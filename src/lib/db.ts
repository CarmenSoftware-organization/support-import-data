import { Pool } from 'pg';
import { TableInfo, ColumnInfo, TableSchema } from './types';
import { getConnectionString } from './config';

// Map of connection ID to pool instances
const pools = new Map<string, Pool>();
const connectionStrings = new Map<string, string>();

export function getPool(connectionId?: string): Pool {
  const id = connectionId || 'main';
  const connectionString = getConnectionString(connectionId);

  if (!connectionString) {
    throw new Error(
      `Database connection "${id}" not configured. Please configure the database connection in Settings.`
    );
  }

  // Reset pool if connection string changed
  const currentConnectionString = connectionStrings.get(id);
  if (pools.has(id) && currentConnectionString !== connectionString) {
    pools.get(id)?.end();
    pools.delete(id);
    connectionStrings.delete(id);
  }

  // Create new pool if doesn't exist
  if (!pools.has(id)) {
    const pool = new Pool({ connectionString });
    pools.set(id, pool);
    connectionStrings.set(id, connectionString);
  }

  return pools.get(id)!;
}

export async function resetPool(connectionId?: string): Promise<void> {
  if (connectionId) {
    // Reset specific pool
    const pool = pools.get(connectionId);
    if (pool) {
      await pool.end();
      pools.delete(connectionId);
      connectionStrings.delete(connectionId);
    }
  } else {
    // Reset all pools
    for (const [id, pool] of pools.entries()) {
      await pool.end();
      pools.delete(id);
      connectionStrings.delete(id);
    }
  }
}

export async function getTables(connectionId?: string): Promise<TableInfo[]> {
  const client = await getPool(connectionId).connect();
  try {
    const result = await client.query(`
      SELECT table_name as name, table_schema as schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getTableSchema(
  tableName: string,
  schema: string = 'public',
  connectionId?: string
): Promise<TableSchema> {
  const client = await getPool(connectionId).connect();
  try {
    // Get column information
    const columnsResult = await client.query(
      `
      SELECT
        c.column_name as name,
        c.data_type as "dataType",
        c.is_nullable = 'YES' as "isNullable",
        c.column_default as "defaultValue",
        c.character_maximum_length as "maxLength",
        COALESCE(
          (SELECT true FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
           WHERE tc.table_name = c.table_name
             AND tc.table_schema = c.table_schema
             AND tc.constraint_type = 'PRIMARY KEY'
             AND kcu.column_name = c.column_name
           LIMIT 1),
          false
        ) as "isPrimaryKey"
      FROM information_schema.columns c
      WHERE c.table_name = $1
        AND c.table_schema = $2
      ORDER BY c.ordinal_position
    `,
      [tableName, schema]
    );

    const columns: ColumnInfo[] = columnsResult.rows.map((row) => ({
      name: row.name,
      dataType: row.dataType,
      isNullable: row.isNullable,
      isPrimaryKey: row.isPrimaryKey,
      defaultValue: row.defaultValue,
      maxLength: row.maxLength,
    }));

    return {
      tableName,
      schema,
      columns,
    };
  } finally {
    client.release();
  }
}

export async function insertRows(
  tableName: string,
  schema: string,
  columns: string[],
  rows: Record<string, unknown>[],
  connectionId?: string
): Promise<{ inserted: number; errors: string[] }> {
  const client = await getPool(connectionId).connect();
  const errors: string[] = [];
  let inserted = 0;

  try {
    await client.query('BEGIN');

    const quotedTable = `"${schema}"."${tableName}"`;
    const quotedColumns = columns.map((c) => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertQuery = `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const values = columns.map((col) => {
        const val = row[col];
        if (val === '' || val === undefined) return null;
        return val;
      });

      try {
        await client.query(insertQuery, values);
        inserted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Row ${i + 1}: ${message}`);
      }
    }

    await client.query('COMMIT');
    return { inserted, errors };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTableData(
  tableName: string,
  schema: string = 'public',
  limit?: number,
  connectionId?: string
): Promise<Record<string, unknown>[]> {
  const client = await getPool(connectionId).connect();
  try {
    const quotedTable = `"${schema}"."${tableName}"`;
    const query = limit
      ? `SELECT * FROM ${quotedTable} LIMIT ${limit}`
      : `SELECT * FROM ${quotedTable}`;
    const result = await client.query(query);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function testConnection(connectionId?: string): Promise<boolean> {
  try {
    const client = await getPool(connectionId).connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
