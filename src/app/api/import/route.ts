import { NextRequest, NextResponse } from 'next/server';
import { getTableSchema, insertRows } from '@/lib/db';
import { validateData } from '@/lib/validation';
import { ColumnMapping } from '@/lib/types';

interface ImportRequest {
  tableName: string;
  schema: string;
  mappings: ColumnMapping[];
  rows: Record<string, unknown>[];
  skipInvalid?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();
    const { tableName, schema, mappings, rows, skipInvalid = true } = body;

    if (!tableName || !mappings || !rows) {
      return NextResponse.json(
        { error: 'Missing required fields: tableName, mappings, rows' },
        { status: 400 }
      );
    }

    // Get table schema for validation
    const tableSchema = await getTableSchema(tableName, schema);
    if (tableSchema.columns.length === 0) {
      return NextResponse.json(
        { error: `Table "${schema}.${tableName}" not found` },
        { status: 404 }
      );
    }

    // Validate data
    const validationResult = validateData(rows, mappings, tableSchema.columns);

    if (!skipInvalid && !validationResult.isValid) {
      return NextResponse.json({
        success: false,
        validation: validationResult,
        message: 'Validation failed. Set skipInvalid=true to import valid rows only.',
      });
    }

    // Get mapped columns
    const dbColumns = mappings
      .filter((m) => m.dbColumn !== null)
      .map((m) => m.dbColumn as string);

    if (dbColumns.length === 0) {
      return NextResponse.json(
        { error: 'No columns mapped for import' },
        { status: 400 }
      );
    }

    // Insert valid rows
    const rowsToInsert = validationResult.validRows;
    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: false,
        importedCount: 0,
        skippedCount: validationResult.invalidCount,
        validation: validationResult,
        message: 'No valid rows to import',
      });
    }

    const { inserted, errors } = await insertRows(
      tableName,
      schema,
      dbColumns,
      rowsToInsert
    );

    return NextResponse.json({
      success: true,
      importedCount: inserted,
      skippedCount: validationResult.invalidCount + (rowsToInsert.length - inserted),
      validation: validationResult,
      dbErrors: errors,
      message: `Successfully imported ${inserted} rows`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
