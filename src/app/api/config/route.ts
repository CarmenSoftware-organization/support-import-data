import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getConfig, saveConfig, deleteConfig, DatabaseConfig, getConnectionString } from '@/lib/config';
import { resetPool } from '@/lib/db';

// GET - Get current config (without password)
export async function GET() {
  try {
    const config = getConfig();
    const hasEnvConfig = !!process.env.DATABASE_URL;

    if (config) {
      // Return config without exposing password
      return NextResponse.json({
        configured: true,
        source: 'file',
        config: {
          host: config.host,
          port: config.port,
          database: config.database,
          username: config.username,
          password: '********',
          ssl: config.ssl,
          schema: config.schema || 'public',
        },
      });
    }

    if (hasEnvConfig) {
      return NextResponse.json({
        configured: true,
        source: 'env',
        config: null,
      });
    }

    return NextResponse.json({
      configured: false,
      source: null,
      config: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST - Save new config
export async function POST(request: NextRequest) {
  try {
    const body: DatabaseConfig = await request.json();

    // Validate required fields
    if (!body.host || !body.database || !body.username) {
      return NextResponse.json(
        { error: 'Missing required fields: host, database, username' },
        { status: 400 }
      );
    }

    const config: DatabaseConfig = {
      host: body.host,
      port: body.port || 5432,
      database: body.database,
      username: body.username,
      password: body.password || '',
      ssl: body.ssl || false,
      schema: body.schema || 'public',
    };

    // Test connection before saving
    const connectionString = `postgresql://${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.database}${config.ssl ? '?sslmode=require' : ''}`;

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

    // Save config and reset pool
    saveConfig(config);
    await resetPool();

    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE - Remove config
export async function DELETE() {
  try {
    deleteConfig();
    await resetPool();

    return NextResponse.json({
      success: true,
      message: 'Configuration removed',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
