import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

interface TruncateRequest {
  tableName: string;
  schema: string;
  cascade?: boolean;
  connectionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TruncateRequest = await request.json();
    const { tableName, schema, cascade = false, connectionId } = body;

    if (!tableName || !schema) {
      return NextResponse.json(
        { error: 'Missing required fields: tableName, schema' },
        { status: 400 }
      );
    }

    const pool = getPool(connectionId);
    if (!pool) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Verify table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) as exists
    `;
    const checkResult = await pool.query(checkQuery, [schema, tableName]);

    if (!checkResult.rows[0].exists) {
      return NextResponse.json(
        { error: `Table "${schema}.${tableName}" not found` },
        { status: 404 }
      );
    }

    // Count rows before truncate
    const countQuery = `SELECT COUNT(*) as count FROM "${schema}"."${tableName}"`;
    const countResult = await pool.query(countQuery);
    const rowCount = parseInt(countResult.rows[0].count, 10);

    // Truncate table
    const cascadeClause = cascade ? ' CASCADE' : '';
    const truncateQuery = `TRUNCATE TABLE "${schema}"."${tableName}"${cascadeClause}`;

    await pool.query(truncateQuery);

    return NextResponse.json({
      success: true,
      message: `Truncated ${rowCount} rows from ${schema}.${tableName}`,
      deletedCount: rowCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
