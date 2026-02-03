export interface TableInfo {
  name: string;
  schema: string;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  maxLength: number | null;
}

export interface TableSchema {
  tableName: string;
  schema: string;
  columns: ColumnInfo[];
}

export interface ParsedExcel {
  fileName: string;
  sheets: SheetData[];
}

export interface SheetData {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export interface ColumnMapping {
  excelColumn: string;
  dbColumn: string | null;
  sampleValues: unknown[];
}

export interface ValidationError {
  row: number;
  column: string;
  value: unknown;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  validRows: Record<string, unknown>[];
  invalidRows: {
    row: number;
    data: Record<string, unknown>;
    errors: ValidationError[];
  }[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
}

export type DataType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'json';

export function mapPostgresType(pgType: string): DataType {
  const type = pgType.toLowerCase();

  if (['varchar', 'text', 'char', 'character varying', 'character'].includes(type)) {
    return 'string';
  }
  if (['integer', 'int', 'int4', 'int8', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float', 'float4', 'float8'].includes(type)) {
    return 'number';
  }
  if (['boolean', 'bool'].includes(type)) {
    return 'boolean';
  }
  if (type === 'date') {
    return 'date';
  }
  if (['timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone'].includes(type)) {
    return 'datetime';
  }
  if (type === 'uuid') {
    return 'uuid';
  }
  if (['json', 'jsonb'].includes(type)) {
    return 'json';
  }

  return 'string';
}
