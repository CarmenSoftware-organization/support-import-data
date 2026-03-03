import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { saveConnection, saveCertFile, DatabaseConfig } from '@/lib/config';
import { resetPool } from '@/lib/db';

// POST - Save or update a connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, name, config, setAsDefault, certs } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid connection name' },
        { status: 400 }
      );
    }

    if (!config.host || !config.database || !config.username) {
      return NextResponse.json(
        { error: 'Missing required fields: host, database, username' },
        { status: 400 }
      );
    }

    const ssl = config.ssl || false;
    const hasCerts = !!(certs?.ca);

    // Build connection string (without sslmode param when certs are provided — handled via options)
    const sslParam = ssl && !hasCerts ? '?sslmode=require' : '';
    const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password || '')}@${config.host}:${config.port || 5432}/${config.database}${sslParam}`;

    // Build SSL options for test pool
    let sslOptions: undefined | Record<string, unknown>;
    if (ssl) {
      if (hasCerts) {
        sslOptions = { rejectUnauthorized: true };
        if (certs.ca) sslOptions.ca = Buffer.from(certs.ca, 'base64');
        if (certs.cert) sslOptions.cert = Buffer.from(certs.cert, 'base64');
        if (certs.key) sslOptions.key = Buffer.from(certs.key, 'base64');
      } else {
        sslOptions = { rejectUnauthorized: false };
      }
    }

    // Test connection before saving
    const testPool = new Pool({
      connectionString,
      ...(sslOptions ? { ssl: sslOptions } : {}),
    });
    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      await testPool.end();
    } catch (err) {
      await testPool.end();
      const message = err instanceof Error ? err.message : 'Connection failed';
      return NextResponse.json(
        { error: `Connection test failed: ${message}` },
        { status: 400 }
      );
    }

    // Determine the connection ID (use existing or it will be generated)
    const id = connectionId || randomUUID();

    // Prepare the config to save
    const dbConfig: Omit<DatabaseConfig, 'id' | 'name'> = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      username: config.username,
      password: config.password || '',
      ssl,
      schema: config.schema || 'public',
    };

    // Save cert files if provided
    if (certs?.ca) {
      const caContent = Buffer.from(certs.ca, 'base64').toString('utf-8');
      dbConfig.sslCaCert = saveCertFile(id, 'ca', caContent);
    }
    if (certs?.cert) {
      const certContent = Buffer.from(certs.cert, 'base64').toString('utf-8');
      dbConfig.sslClientCert = saveCertFile(id, 'cert', certContent);
    }
    if (certs?.key) {
      const keyContent = Buffer.from(certs.key, 'base64').toString('utf-8');
      dbConfig.sslClientKey = saveCertFile(id, 'key', keyContent);
    }

    // Save connection and reset its pool (pass pre-generated id so cert filenames match)
    const savedId = saveConnection(id, name, dbConfig, setAsDefault);
    await resetPool(savedId);

    return NextResponse.json({
      success: true,
      message: 'Connection saved successfully',
      connectionId: savedId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
