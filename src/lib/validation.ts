import {
  ColumnInfo,
  ColumnMapping,
  ValidationResult,
  ValidationError,
  mapPostgresType,
  DataType,
} from './types';

export function validateData(
  rows: Record<string, unknown>[],
  mappings: ColumnMapping[],
  tableColumns: ColumnInfo[]
): ValidationResult {
  const validRows: Record<string, unknown>[] = [];
  const invalidRows: {
    row: number;
    data: Record<string, unknown>;
    errors: ValidationError[];
  }[] = [];

  // Create a map of db column name to column info
  const columnInfoMap = new Map<string, ColumnInfo>();
  tableColumns.forEach((col) => columnInfoMap.set(col.name, col));

  // Create a map of excel column to db column
  const mappingMap = new Map<string, string>();
  mappings.forEach((m) => {
    if (m.dbColumn) {
      mappingMap.set(m.excelColumn, m.dbColumn);
    }
  });

  rows.forEach((row, index) => {
    const errors: ValidationError[] = [];
    const transformedRow: Record<string, unknown> = {};

    // Validate each mapped column
    mappings.forEach((mapping) => {
      if (!mapping.dbColumn) return;

      const excelValue = row[mapping.excelColumn];
      const columnInfo = columnInfoMap.get(mapping.dbColumn);

      if (!columnInfo) return;

      // Check required fields
      if (
        !columnInfo.isNullable &&
        !columnInfo.defaultValue &&
        (excelValue === null || excelValue === undefined || excelValue === '')
      ) {
        errors.push({
          row: index + 1,
          column: mapping.excelColumn,
          value: excelValue,
          message: `"${mapping.dbColumn}" is required`,
        });
        return;
      }

      // Skip empty optional fields
      if (excelValue === null || excelValue === undefined || excelValue === '') {
        transformedRow[mapping.dbColumn] = null;
        return;
      }

      // Validate and transform based on type
      const dataType = mapPostgresType(columnInfo.dataType);
      const validationResult = validateAndTransform(
        excelValue,
        dataType,
        columnInfo
      );

      if (validationResult.error) {
        errors.push({
          row: index + 1,
          column: mapping.excelColumn,
          value: excelValue,
          message: validationResult.error,
        });
      } else {
        transformedRow[mapping.dbColumn] = validationResult.value;
      }
    });

    if (errors.length === 0) {
      validRows.push(transformedRow);
    } else {
      invalidRows.push({
        row: index + 1,
        data: row,
        errors,
      });
    }
  });

  return {
    isValid: invalidRows.length === 0,
    validRows,
    invalidRows,
    totalRows: rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
  };
}

function validateAndTransform(
  value: unknown,
  dataType: DataType,
  columnInfo: ColumnInfo
): { value: unknown; error?: string } {
  const strValue = String(value).trim();

  switch (dataType) {
    case 'number': {
      const num = Number(strValue);
      if (isNaN(num)) {
        return { value: null, error: `"${strValue}" is not a valid number` };
      }
      return { value: num };
    }

    case 'boolean': {
      const lower = strValue.toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(lower)) {
        return { value: true };
      }
      if (['false', '0', 'no', 'n'].includes(lower)) {
        return { value: false };
      }
      return { value: null, error: `"${strValue}" is not a valid boolean` };
    }

    case 'date':
    case 'datetime': {
      const date = new Date(strValue);
      if (isNaN(date.getTime())) {
        return { value: null, error: `"${strValue}" is not a valid date` };
      }
      return { value: date.toISOString() };
    }

    case 'uuid': {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(strValue)) {
        return { value: null, error: `"${strValue}" is not a valid UUID` };
      }
      return { value: strValue };
    }

    case 'json': {
      try {
        const parsed = JSON.parse(strValue);
        return { value: parsed };
      } catch {
        return { value: null, error: `"${strValue}" is not valid JSON` };
      }
    }

    case 'string':
    default: {
      // Check max length
      if (columnInfo.maxLength && strValue.length > columnInfo.maxLength) {
        return {
          value: null,
          error: `Value exceeds max length of ${columnInfo.maxLength}`,
        };
      }
      return { value: strValue };
    }
  }
}

export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid) {
    return `All ${result.totalRows} rows are valid and ready to import.`;
  }
  return `${result.validCount} of ${result.totalRows} rows are valid. ${result.invalidCount} rows have errors.`;
}
