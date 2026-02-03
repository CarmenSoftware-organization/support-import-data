import { NextRequest, NextResponse } from 'next/server';
import { getTables, testConnection } from '@/lib/db';
import { getDefaultSchema } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    const connected = await testConnection();
    if (!connected) {
      return NextResponse.json(
        { error: 'Unable to connect to database. Check DATABASE_URL.' },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const schemaParam = url.searchParams.get('schema');
    const defaultSchema = getDefaultSchema();

    const allTables = await getTables();

    // Filter by schema - use provided schema or default
    const filterSchema = schemaParam || defaultSchema;
    const tables = allTables.filter((t) => t.schema === filterSchema);

    return NextResponse.json({
      tables,
      defaultSchema,
      currentSchema: filterSchema,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
