import { NextRequest, NextResponse } from 'next/server';
import { getTableData } from '@/lib/db';
import { createExcelFromData } from '@/lib/excel';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const tableName = url.searchParams.get('table');
    const schema = url.searchParams.get('schema') || 'public';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    if (!tableName) {
      return NextResponse.json(
        { error: 'Missing required parameter: table' },
        { status: 400 }
      );
    }

    const data = await getTableData(tableName, schema, limit);

    if (data.length === 0) {
      return NextResponse.json(
        { error: 'No data found in table' },
        { status: 404 }
      );
    }

    const buffer = createExcelFromData(data, tableName);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${tableName}_export.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
