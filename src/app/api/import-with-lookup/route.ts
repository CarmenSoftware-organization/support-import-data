import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { validateData } from '@/lib/validation';
import { ColumnMapping, ColumnInfo } from '@/lib/types';

interface LookupConfig {
  sourceColumn: string;      // Excel column name
  targetColumn: string;      // DB column to set (e.g., delivery_point_id)
  lookupTable: string;       // Table to lookup from (e.g., tb_delivery_point)
  lookupColumn: string;      // Column to match (e.g., name)
  lookupResultColumn: string; // Column to get value from (e.g., id)
  createIfNotFound?: boolean; // If true, create a new record if lookup fails
}

interface UniqueCheckConfig {
  columns: string[];           // DB columns to check for uniqueness
  mode: 'skip' | 'error' | 'upsert';
}

interface DefaultValueConfig {
  dbColumn: string;
  value: string | 'CURRENT_TIMESTAMP';
}

interface JsonbFieldMapping {
  jsonKey: string;
  excelColumn: string;
}

interface RelatedInsertColumn {
  dbColumn: string;
  source: 'excel' | 'lookup' | 'static' | 'parent_id' | 'jsonb';
  excelColumn?: string;
  lookupConfig?: {
    sourceColumn: string;
    lookupTable: string;
    lookupColumn: string;
    lookupResultColumn: string;
  };
  staticValue?: string | number | boolean;
  jsonbFields?: JsonbFieldMapping[];
}

interface RelatedInsertConfig {
  tableName: string;
  condition?: {
    sourceColumns: string[];
  };
  columns: RelatedInsertColumn[];
}

interface ImportWithLookupRequest {
  tableName: string;
  schema: string;
  mappings: ColumnMapping[];
  rows: Record<string, unknown>[];
  lookups?: LookupConfig[];
  uniqueCheck?: UniqueCheckConfig;
  defaultValues?: DefaultValueConfig[];
  relatedInserts?: RelatedInsertConfig[];
  skipInvalid?: boolean;
  truncateEnabled?: boolean;  // If true, skip unique check against database
  connectionId?: string;  // Optional: specify which database connection to use
}

export async function POST(request: NextRequest) {
  try {
    const body: ImportWithLookupRequest = await request.json();
    const { tableName, schema, mappings, rows, lookups = [], uniqueCheck, defaultValues = [], relatedInserts = [], skipInvalid = true, truncateEnabled = false, connectionId } = body;

    if (!tableName || !mappings || !rows) {
      return NextResponse.json(
        { error: 'Missing required fields: tableName, mappings, rows' },
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

    // Get table schema for validation
    const schemaQuery = `
      SELECT
        c.column_name as name,
        c.data_type as "dataType",
        c.is_nullable = 'YES' as "isNullable",
        COALESCE(tc.constraint_type = 'PRIMARY KEY', false) as "isPrimaryKey",
        c.column_default as "defaultValue",
        c.character_maximum_length as "maxLength"
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_schema = kcu.table_schema
        AND c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
        AND tc.constraint_type = 'PRIMARY KEY'
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;

    const schemaResult = await pool.query(schemaQuery, [schema, tableName]);
    const tableColumns: ColumnInfo[] = schemaResult.rows;

    if (tableColumns.length === 0) {
      return NextResponse.json(
        { error: `Table "${schema}.${tableName}" not found` },
        { status: 404 }
      );
    }

    // Build lookup caches
    const lookupCaches = new Map<string, Map<string, unknown>>();

    for (const lookup of lookups) {
      const cacheKey = `${lookup.lookupTable}.${lookup.lookupColumn}`;
      if (!lookupCaches.has(cacheKey)) {
        const lookupQuery = `
          SELECT "${lookup.lookupColumn}", "${lookup.lookupResultColumn}"
          FROM "${schema}"."${lookup.lookupTable}"
          WHERE deleted_at IS NULL
        `;
        const lookupResult = await pool.query(lookupQuery);
        const cache = new Map<string, unknown>();
        for (const row of lookupResult.rows) {
          // Store with lowercase key for case-insensitive matching
          const key = String(row[lookup.lookupColumn] || '').toLowerCase().trim();
          cache.set(key, row[lookup.lookupResultColumn]);
        }
        lookupCaches.set(cacheKey, cache);
      }
    }

    // Build unique check cache if configured (skip if truncate is enabled since table will be empty)
    const existingRecords = new Set<string>();
    const existingRecordsMap = new Map<string, unknown>(); // For upsert mode - stores ID

    if (uniqueCheck && uniqueCheck.columns.length > 0 && !truncateEnabled) {
      const uniqueColumns = uniqueCheck.columns.map(c => `"${c}"`).join(', ');
      const uniqueQuery = `
        SELECT id, ${uniqueColumns}
        FROM "${schema}"."${tableName}"
        WHERE deleted_at IS NULL
      `;
      const uniqueResult = await pool.query(uniqueQuery);

      for (const row of uniqueResult.rows) {
        // Create a composite key from all unique columns
        const keyParts = uniqueCheck.columns.map(col =>
          String(row[col] || '').toLowerCase().trim()
        );
        const compositeKey = keyParts.join('|||');
        existingRecords.add(compositeKey);
        existingRecordsMap.set(compositeKey, row.id);
      }
    }

    // Process rows with lookups
    const processedRows: Record<string, unknown>[] = [];
    const lookupErrors: { row: number; message: string }[] = [];
    const duplicateErrors: { row: number; message: string }[] = [];
    const duplicateSkipped: { row: number; message: string }[] = [];

    // Create a map from excel column to db column for unique check
    const excelToDbMap = new Map<string, string>();
    for (const m of mappings) {
      if (m.dbColumn) {
        excelToDbMap.set(m.excelColumn, m.dbColumn);
      }
    }

    // Also track unique values within the current import to avoid duplicates in same file
    const seenInImport = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = { ...rows[i] };
      let hasLookupError = false;
      let isDuplicate = false;

      // Process lookups first
      for (const lookup of lookups) {
        const sourceValue = row[lookup.sourceColumn];
        if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
          const cacheKey = `${lookup.lookupTable}.${lookup.lookupColumn}`;
          const cache = lookupCaches.get(cacheKey);
          const lookupKey = String(sourceValue).toLowerCase().trim();
          let lookupValue = cache?.get(lookupKey);

          if (lookupValue !== undefined) {
            row[lookup.targetColumn] = lookupValue;
          } else if (lookup.createIfNotFound) {
            // Auto-create the missing record
            try {
              const insertQuery = `
                INSERT INTO "${schema}"."${lookup.lookupTable}" ("${lookup.lookupColumn}")
                VALUES ($1)
                RETURNING "${lookup.lookupResultColumn}"
              `;
              const insertResult = await pool.query(insertQuery, [String(sourceValue).trim()]);

              if (insertResult.rows.length > 0) {
                lookupValue = insertResult.rows[0][lookup.lookupResultColumn];
                row[lookup.targetColumn] = lookupValue;

                // Update cache with new value for subsequent rows
                if (cache) {
                  cache.set(lookupKey, lookupValue);
                }
              } else {
                lookupErrors.push({
                  row: i + 1,
                  message: `Failed to create "${sourceValue}" in ${lookup.lookupTable}`,
                });
                hasLookupError = true;
              }
            } catch (createErr) {
              lookupErrors.push({
                row: i + 1,
                message: `Error creating "${sourceValue}" in ${lookup.lookupTable}: ${createErr instanceof Error ? createErr.message : 'Unknown error'}`,
              });
              hasLookupError = true;
            }
          } else {
            lookupErrors.push({
              row: i + 1,
              message: `"${sourceValue}" not found in ${lookup.lookupTable}.${lookup.lookupColumn}`,
            });
            hasLookupError = true;
          }
        }
      }

      // Check for uniqueness if configured
      if (uniqueCheck && uniqueCheck.columns.length > 0 && !hasLookupError) {
        // Build composite key from row data using the mapped column values
        const keyPartsWithValues: { column: string; value: string }[] = uniqueCheck.columns.map(dbCol => {
          // Find the excel column that maps to this db column
          const excelCol = Array.from(excelToDbMap.entries())
            .find(([, db]) => db === dbCol)?.[0];
          const value = excelCol ? row[excelCol] : row[dbCol];
          return { column: dbCol, value: String(value || '').trim() };
        });
        const keyParts = keyPartsWithValues.map(kv => kv.value.toLowerCase());
        const compositeKey = keyParts.join('|||');

        // Check if exists in database or already seen in this import
        const existsInDb = existingRecords.has(compositeKey);
        const existsInImport = seenInImport.has(compositeKey);

        if (existsInDb || existsInImport) {
          isDuplicate = true;

          // Build value display string
          const valueDisplay = keyPartsWithValues.map(kv => `${kv.column}="${kv.value}"`).join(', ');
          const source = existsInDb ? 'in database' : 'in this file';

          if (uniqueCheck.mode === 'error') {
            duplicateErrors.push({
              row: i + 1,
              message: `Duplicate ${source}: ${valueDisplay}`,
            });
          } else if (uniqueCheck.mode === 'skip') {
            duplicateSkipped.push({
              row: i + 1,
              message: `Duplicate ${source} (will skip): ${valueDisplay}`,
            });
          }
          // For upsert mode, we'll handle it during insert
        }

        // Track this record to detect duplicates within the same import
        seenInImport.add(compositeKey);
      }

      // Add to processed rows based on conditions
      if (!hasLookupError && !isDuplicate) {
        processedRows.push(row);
      } else if (isDuplicate && uniqueCheck?.mode === 'upsert') {
        // For upsert, still add to processed but mark for update
        row._existingId = existingRecordsMap.get(
          uniqueCheck.columns.map(dbCol => {
            const excelCol = Array.from(excelToDbMap.entries())
              .find(([, db]) => db === dbCol)?.[0];
            const value = excelCol ? row[excelCol] : row[dbCol];
            return String(value || '').toLowerCase().trim();
          }).join('|||')
        );
        processedRows.push(row);
      }
    }

    // Create extended mappings that include lookup target columns
    const extendedMappings: ColumnMapping[] = [...mappings];
    for (const lookup of lookups) {
      const existingIndex = extendedMappings.findIndex(m => m.dbColumn === lookup.targetColumn);
      if (existingIndex >= 0) {
        // Replace existing mapping to use the looked-up value (UUID) instead of raw Excel value
        extendedMappings[existingIndex] = {
          ...extendedMappings[existingIndex],
          excelColumn: lookup.targetColumn,
        };
      } else {
        extendedMappings.push({
          excelColumn: lookup.targetColumn,
          dbColumn: lookup.targetColumn,
          sampleValues: [],
        });
      }
    }

    // Validate data
    const validationResult = validateData(processedRows, extendedMappings, tableColumns);

    // Build a map from valid rows back to their original processedRows (for related inserts)
    // The validation creates transformed rows with DB column names only,
    // but related inserts need access to original Excel column values.
    const validRowOriginalData: Record<string, unknown>[] = [];
    {
      let validIndex = 0;
      const invalidRowNumbers = new Set(validationResult.invalidRows.map(r => r.row));
      for (let i = 0; i < processedRows.length; i++) {
        if (!invalidRowNumbers.has(i + 1)) {
          validRowOriginalData.push(processedRows[i]);
          // Preserve _existingId for upsert mode
          if (processedRows[i]._existingId) {
            validationResult.validRows[validIndex]._existingId = processedRows[i]._existingId;
          }
          validIndex++;
        }
      }
    }

    // Add lookup errors to validation
    if (lookupErrors.length > 0) {
      validationResult.invalidRows.push(
        ...lookupErrors.map((err) => ({
          row: err.row,
          data: rows[err.row - 1],
          errors: [{ row: err.row, column: 'lookup', value: null, message: err.message }],
        }))
      );
    }

    // Add duplicate errors to validation
    if (duplicateErrors.length > 0) {
      validationResult.invalidRows.push(
        ...duplicateErrors.map((err) => ({
          row: err.row,
          data: rows[err.row - 1],
          errors: [{ row: err.row, column: 'unique', value: null, message: err.message }],
        }))
      );
    }

    // Add skipped duplicates as warnings (not errors, but shown to user)
    const skippedDuplicateRows = duplicateSkipped.map((dup) => ({
      row: dup.row,
      data: rows[dup.row - 1],
      errors: [{ row: dup.row, column: 'unique', value: null, message: dup.message }],
    }));

    // Update counts
    validationResult.invalidCount = validationResult.invalidRows.length;
    validationResult.isValid = validationResult.invalidCount === 0;

    // Add duplicateSkipped info to validation result for display
    const extendedValidation = {
      ...validationResult,
      skippedDuplicates: skippedDuplicateRows,
      skippedDuplicateCount: duplicateSkipped.length,
    };

    if (!skipInvalid && !validationResult.isValid) {
      return NextResponse.json({
        success: false,
        validation: extendedValidation,
        duplicateSkipped: duplicateSkipped.length,
        message: 'Validation failed. Set skipInvalid=true to import valid rows only.',
      });
    }

    // Get mapped columns (including lookup columns)
    const dbColumns = extendedMappings
      .filter((m) => m.dbColumn !== null)
      .map((m) => m.dbColumn as string);

    if (dbColumns.length === 0) {
      return NextResponse.json(
        { error: 'No columns mapped for import' },
        { status: 400 }
      );
    }

    // Insert/Update valid rows
    const rowsToInsert = validationResult.validRows;
    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: false,
        importedCount: 0,
        skippedCount: validationResult.invalidCount + duplicateSkipped.length,
        duplicateSkipped: duplicateSkipped.length,
        validation: extendedValidation,
        message: 'No valid rows to import',
      });
    }

    // Build and execute insert/update queries
    let inserted = 0;
    let updated = 0;
    let relatedInserted = 0;
    const errors: string[] = [];

    // Prepare default value columns (columns with SQL expressions like CURRENT_TIMESTAMP)
    const defaultValueColumns = defaultValues.filter(dv => dv.value === 'CURRENT_TIMESTAMP');
    const staticDefaultValues = defaultValues.filter(dv => dv.value !== 'CURRENT_TIMESTAMP');

    // Build lookup caches for related inserts
    const relatedLookupCaches = new Map<string, Map<string, unknown>>();
    for (const relatedInsert of relatedInserts) {
      for (const col of relatedInsert.columns) {
        if (col.source === 'lookup' && col.lookupConfig) {
          const cacheKey = `${col.lookupConfig.lookupTable}.${col.lookupConfig.lookupColumn}`;
          if (!relatedLookupCaches.has(cacheKey)) {
            const lookupQuery = `
              SELECT "${col.lookupConfig.lookupColumn}", "${col.lookupConfig.lookupResultColumn}"
              FROM "${schema}"."${col.lookupConfig.lookupTable}"
              WHERE deleted_at IS NULL
            `;
            const lookupResult = await pool.query(lookupQuery);
            const cache = new Map<string, unknown>();
            for (const r of lookupResult.rows) {
              const key = String(r[col.lookupConfig.lookupColumn] || '').toLowerCase().trim();
              cache.set(key, r[col.lookupConfig.lookupResultColumn]);
            }
            relatedLookupCaches.set(cacheKey, cache);
          }
        }
      }
    }

    for (let rowIdx = 0; rowIdx < rowsToInsert.length; rowIdx++) {
      const row = rowsToInsert[rowIdx];
      const originalRow = validRowOriginalData[rowIdx] || row;  // Original Excel data for related inserts
      // Apply static default values to the row
      for (const dv of staticDefaultValues) {
        if (row[dv.dbColumn] === undefined || row[dv.dbColumn] === null) {
          row[dv.dbColumn] = dv.value;
        }
      }

      const values = dbColumns.map((col) => row[col] ?? null);

      // Build column names including default value columns
      const allColumnNames = [
        ...dbColumns.map((col) => `"${col}"`),
        ...defaultValueColumns.map((dv) => `"${dv.dbColumn}"`),
      ].join(', ');

      let parentId: unknown = null;

      // Check if this is an upsert (update existing record)
      if (row._existingId && uniqueCheck?.mode === 'upsert') {
        // Update existing record
        const setClause = dbColumns.map((col, i) => `"${col}" = $${i + 1}`).join(', ');
        const defaultSetClause = defaultValueColumns.map((dv) => `"${dv.dbColumn}" = CURRENT_TIMESTAMP`).join(', ');
        const fullSetClause = defaultSetClause ? `${setClause}, ${defaultSetClause}` : setClause;

        const updateQuery = `
          UPDATE "${schema}"."${tableName}"
          SET ${fullSetClause}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $${dbColumns.length + 1}
        `;

        try {
          await pool.query(updateQuery, [...values, row._existingId]);
          updated++;
          parentId = row._existingId;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Update failed');
        }
      } else {
        // Insert new record and return the ID
        const placeholders = [
          ...dbColumns.map((_, i) => `$${i + 1}`),
          ...defaultValueColumns.map(() => 'CURRENT_TIMESTAMP'),
        ].join(', ');

        const insertQuery = `
          INSERT INTO "${schema}"."${tableName}" (${allColumnNames})
          VALUES (${placeholders})
          RETURNING id
        `;

        try {
          const insertResult = await pool.query(insertQuery, values);
          inserted++;
          parentId = insertResult.rows[0]?.id;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : 'Insert failed');
        }
      }

      // Process related inserts if we have a parent ID
      // Use originalRow for Excel column access since validRows only have DB column names
      if (parentId && relatedInserts.length > 0) {
        for (const relatedInsert of relatedInserts) {
          // Check condition - all source columns must have values
          if (relatedInsert.condition?.sourceColumns) {
            const hasAllValues = relatedInsert.condition.sourceColumns.every((col) => {
              const val = originalRow[col];
              return val !== undefined && val !== null && val !== '';
            });
            if (!hasAllValues) continue;
          }

          // Build the related insert
          const relatedColumns: string[] = [];
          const relatedValues: unknown[] = [];

          for (const col of relatedInsert.columns) {
            relatedColumns.push(`"${col.dbColumn}"`);

            if (col.source === 'parent_id') {
              relatedValues.push(parentId);
            } else if (col.source === 'static') {
              relatedValues.push(col.staticValue);
            } else if (col.source === 'excel' && col.excelColumn) {
              relatedValues.push(originalRow[col.excelColumn] ?? null);
            } else if (col.source === 'lookup' && col.lookupConfig) {
              const cacheKey = `${col.lookupConfig.lookupTable}.${col.lookupConfig.lookupColumn}`;
              const cache = relatedLookupCaches.get(cacheKey);
              const sourceVal = originalRow[col.lookupConfig.sourceColumn];
              const lookupKey = String(sourceVal || '').toLowerCase().trim();
              relatedValues.push(cache?.get(lookupKey) ?? null);
            } else if (col.source === 'jsonb' && col.jsonbFields) {
              // Build a JSON object from multiple Excel columns
              const jsonObj: Record<string, unknown> = {};
              for (const field of col.jsonbFields) {
                const val = originalRow[field.excelColumn];
                jsonObj[field.jsonKey] = val !== undefined && val !== null && val !== '' ? val : '';
              }
              relatedValues.push(JSON.stringify(jsonObj));
            } else {
              relatedValues.push(null);
            }
          }

          const relatedPlaceholders = relatedColumns.map((_, i) => `$${i + 1}`).join(', ');
          const relatedInsertQuery = `
            INSERT INTO "${schema}"."${relatedInsert.tableName}" (${relatedColumns.join(', ')})
            VALUES (${relatedPlaceholders})
          `;

          try {
            await pool.query(relatedInsertQuery, relatedValues);
            relatedInserted++;
          } catch (err) {
            errors.push(`Related insert to ${relatedInsert.tableName}: ${err instanceof Error ? err.message : 'Failed'}`);
          }
        }
      }
    }

    const totalImported = inserted + updated;
    let message = `Successfully imported ${inserted} rows`;
    if (updated > 0) {
      message = `Successfully imported ${inserted} new rows, updated ${updated} existing rows`;
    }
    if (relatedInserted > 0) {
      message += `, ${relatedInserted} related records`;
    }
    if (duplicateSkipped.length > 0) {
      message += `, skipped ${duplicateSkipped.length} duplicates`;
    }

    return NextResponse.json({
      success: true,
      importedCount: totalImported,
      insertedCount: inserted,
      relatedInsertedCount: relatedInserted,
      updatedCount: updated,
      skippedCount: validationResult.invalidCount + duplicateSkipped.length,
      duplicateSkipped: duplicateSkipped.length,
      validation: extendedValidation,
      dbErrors: errors,
      message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
