'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ValidationResult, ValidationError } from '@/lib/types';

interface PreviewRow {
  [key: string]: unknown;
  _rowNum: number;
  _errors: ValidationError[];
  _isValid: boolean;
}

interface DataPreviewProps {
  validation: ValidationResult | null;
  columns: string[];
  maxRows?: number;
}

export function DataPreview({
  validation,
  columns,
  maxRows = 10,
}: DataPreviewProps) {
  if (!validation) {
    return null;
  }

  const previewRows: PreviewRow[] = [
    ...validation.invalidRows.slice(0, maxRows).map((r) => ({
      ...r.data,
      _rowNum: r.row,
      _errors: r.errors,
      _isValid: false as const,
    })),
    ...validation.validRows.slice(0, maxRows - validation.invalidRows.length).map((r, i) => ({
      ...r,
      _rowNum: i + 1,
      _errors: [] as ValidationError[],
      _isValid: true as const,
    })),
  ].sort((a, b) => a._rowNum - b._rowNum);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Data Preview</CardTitle>
          <div className="flex gap-2">
            <Badge variant="default">
              {validation.validCount} valid
            </Badge>
            {validation.invalidCount > 0 && (
              <Badge variant="destructive">
                {validation.invalidCount} invalid
              </Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Showing {Math.min(previewRows.length, maxRows)} of {validation.totalRows} rows
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                {columns.map((col) => (
                  <TableHead key={col}>{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, index) => {
                const errors = row._errors;
                const errorColumns = new Set(errors.map((e) => e.column));

                return (
                  <TableRow
                    key={index}
                    className={row._isValid ? '' : 'bg-destructive/5'}
                  >
                    <TableCell className="text-muted-foreground">
                      {row._rowNum}
                    </TableCell>
                    <TableCell>
                      {row._isValid ? (
                        <Badge variant="default" className="text-xs">OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Error</Badge>
                      )}
                    </TableCell>
                    {columns.map((col) => {
                      const hasError = errorColumns.has(col);
                      const error = errors.find((e) => e.column === col);

                      return (
                        <TableCell
                          key={col}
                          className={hasError ? 'text-destructive' : ''}
                          title={error?.message}
                        >
                          {String(row[col] ?? '')}
                          {hasError && (
                            <span className="block text-xs text-destructive">
                              {error?.message}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
