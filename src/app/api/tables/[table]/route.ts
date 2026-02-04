import { NextRequest, NextResponse } from 'next/server';
import { getTableSchema } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const { table } = await params;
    const url = new URL(request.url);
    const schema = url.searchParams.get('schema') || 'public';
    const connectionId = url.searchParams.get('connectionId') || undefined;

    const tableSchema = await getTableSchema(table, schema, connectionId);

    if (tableSchema.columns.length === 0) {
      return NextResponse.json(
        { error: `Table "${schema}.${table}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(tableSchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
