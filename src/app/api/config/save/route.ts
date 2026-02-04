import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { saveConnection, DatabaseConfig } from '@/lib/config';
import { resetPool } from '@/lib/db';

// POST - Save or update a connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, name, config, setAsDefault } = body;

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

    const dbConfig = {
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      username: config.username,
      password: config.password || '',
      ssl: config.ssl || false,
      schema: config.schema || 'public',
    };

    // Test connection before saving
    const connectionString = `postgresql://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${dbConfig.ssl ? '?sslmode=require' : ''}`;

    const testPool = new Pool({ connectionString });
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

    // Save connection and reset its pool (returns UUID)
    const savedId = saveConnection(connectionId || null, name, dbConfig, setAsDefault);
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
