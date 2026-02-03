import * as XLSX from 'xlsx';
import { ParsedExcel, SheetData, ColumnInfo } from './types';

export function parseExcelBuffer(
  buffer: Buffer,
  fileName: string
): ParsedExcel {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
    });

    const columns =
      jsonData.length > 0 ? Object.keys(jsonData[0]) : getColumnsFromSheet(worksheet);

    return {
      name: sheetName,
      columns,
      rows: jsonData,
      totalRows: jsonData.length,
    };
  });

  return {
    fileName,
    sheets,
  };
}

function getColumnsFromSheet(worksheet: XLSX.WorkSheet): string[] {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  const columns: string[] = [];

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = worksheet[cellAddress];
    if (cell && cell.v !== undefined) {
      columns.push(String(cell.v));
    }
  }

  return columns;
}

export function createExcelFromData(
  data: Record<string, unknown>[],
  sheetName: string = 'Sheet1'
): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

export function createTemplateFromColumns(
  columns: ColumnInfo[],
  sheetName: string = 'Template'
): Buffer {
  const workbook = XLSX.utils.book_new();

  // Create header row with column names
  const headers = columns
    .filter((col) => !col.isPrimaryKey || !col.defaultValue?.includes('nextval'))
    .map((col) => col.name);

  // Create worksheet with just headers
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);

  // Set column widths
  worksheet['!cols'] = headers.map(() => ({ wch: 15 }));

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

export function getSampleValues(
  rows: Record<string, unknown>[],
  column: string,
  count: number = 3
): unknown[] {
  const values: unknown[] = [];
  for (let i = 0; i < Math.min(count, rows.length); i++) {
    const value = rows[i][column];
    if (value !== undefined && value !== null && value !== '') {
      values.push(value);
    }
  }
  return values;
}
