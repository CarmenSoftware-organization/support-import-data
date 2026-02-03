import { NextRequest, NextResponse } from 'next/server';
import { getTableSchema } from '@/lib/db';
import { createTemplateFromColumns } from '@/lib/excel';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const { table } = await params;
    const url = new URL(request.url);
    const schema = url.searchParams.get('schema') || 'public';

    const tableSchema = await getTableSchema(table, schema);

    if (tableSchema.columns.length === 0) {
      return NextResponse.json(
        { error: `Table "${schema}.${table}" not found` },
        { status: 404 }
      );
    }

    const buffer = createTemplateFromColumns(tableSchema.columns, table);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${table}_template.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
