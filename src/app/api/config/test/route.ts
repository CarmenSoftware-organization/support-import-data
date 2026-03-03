import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// POST - Test connection without saving
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.host || !body.database || !body.username) {
      return NextResponse.json(
        { error: 'Missing required fields: host, database, username' },
        { status: 400 }
      );
    }

    const config = {
      host: body.host,
      port: body.port || 5432,
      database: body.database,
      username: body.username,
      password: body.password || '',
      ssl: body.ssl || false,
      schema: body.schema || 'public',
    };

    const hasCerts = !!(body.certs?.ca);
    const sslParam = config.ssl && !hasCerts ? '?sslmode=require' : '';
    const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${sslParam}`;

    // Build SSL options from in-memory cert content (no file I/O)
    let sslOptions: undefined | Record<string, unknown>;
    if (config.ssl) {
      if (hasCerts) {
        sslOptions = { rejectUnauthorized: true };
        if (body.certs.ca) sslOptions.ca = Buffer.from(body.certs.ca, 'base64');
        if (body.certs.cert) sslOptions.cert = Buffer.from(body.certs.cert, 'base64');
        if (body.certs.key) sslOptions.key = Buffer.from(body.certs.key, 'base64');
      } else {
        sslOptions = { rejectUnauthorized: false };
      }
    }

    const testPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5000,
      ...(sslOptions ? { ssl: sslOptions } : {}),
    });

    try {
      const client = await testPool.connect();

      // Get server version
      const versionResult = await client.query('SELECT version()');
      const version = versionResult.rows[0]?.version || 'Unknown';

      // Get available schemas
      const schemasResult = await client.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name
      `);
      const schemas = schemasResult.rows.map((row) => row.schema_name);

      client.release();
      await testPool.end();

      return NextResponse.json({
        success: true,
        message: 'Connection successful',
        serverVersion: version,
        schemas,
      });
    } catch (err) {
      await testPool.end();
      const message = err instanceof Error ? err.message : 'Connection failed';
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
