'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ParsedExcel,
  SheetTableMapping,
  MultiSheetValidationResult,
  ValidationError,
} from '@/lib/types';

interface MultiSheetPreviewProps {
  validationResults: MultiSheetValidationResult[];
  sheetMappings: SheetTableMapping[];
  parsedExcel: ParsedExcel | null;
}

export function MultiSheetPreview({
  validationResults,
  sheetMappings,
  parsedExcel,
}: MultiSheetPreviewProps) {
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(
    new Set(validationResults.filter((r) => r.validation.invalidCount > 0).map((r) => r.sheetName))
  );

  const toggleExpanded = (sheetName: string) => {
    setExpandedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetName)) {
        next.delete(sheetName);
      } else {
        next.add(sheetName);
      }
      return next;
    });
  };

  const totalValid = validationResults.reduce(
    (sum, r) => sum + r.validation.validCount,
    0
  );
  const totalInvalid = validationResults.reduce(
    (sum, r) => sum + r.validation.invalidCount,
    0
  );
  const totalRows = validationResults.reduce(
    (sum, r) => sum + r.validation.totalRows,
    0
  );

  const getMapping = (sheetName: string): SheetTableMapping | undefined => {
    return sheetMappings.find((m) => m.sheetName === sheetName);
  };

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Validation Summary</CardTitle>
            <div className="flex gap-2">
              <Badge variant="default">{totalValid} valid</Badge>
              {totalInvalid > 0 && (
                <Badge variant="destructive">{totalInvalid} invalid</Badge>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {validationResults.length} sheets validated, {totalRows} total rows
          </p>
        </CardHeader>
      </Card>

      {/* Individual Sheet Results */}
      {validationResults.map((result) => {
        const isExpanded = expandedSheets.has(result.sheetName);
        const mapping = getMapping(result.sheetName);
        const hasErrors = result.validation.invalidCount > 0;
        const sheet = parsedExcel?.sheets.find((s) => s.name === result.sheetName);

        // Get mapped columns for display
        const mappedColumns = mapping?.columnMappings
          .filter((cm) => cm.dbColumn !== null)
          .map((cm) => cm.excelColumn) || [];

        return (
          <Card
            key={result.sheetName}
            className={hasErrors ? 'border-yellow-500/50' : 'border-green-500/50'}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-auto"
                  onClick={() => toggleExpanded(result.sheetName)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {hasErrors ? (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">
                      {result.sheetName} &rarr; {result.schema}.{result.tableName}
                    </h3>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Badge variant="default">
                    {result.validation.validCount} valid
                  </Badge>
                  {result.validation.invalidCount > 0 && (
                    <Badge variant="destructive">
                      {result.validation.invalidCount} invalid
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <SheetValidationPreview
                  validation={result.validation}
                  columns={mappedColumns}
                  maxRows={5}
                />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

interface SheetValidationPreviewProps {
  validation: MultiSheetValidationResult['validation'];
  columns: string[];
  maxRows?: number;
}

interface PreviewRow {
  [key: string]: unknown;
  _rowNum: number;
  _errors: ValidationError[];
  _isValid: boolean;
}

function SheetValidationPreview({
  validation,
  columns,
  maxRows = 5,
}: SheetValidationPreviewProps) {
  const [showOnlyErrors, setShowOnlyErrors] = useState(validation.invalidCount > 0);

  const previewRows: PreviewRow[] = showOnlyErrors
    ? validation.invalidRows.slice(0, maxRows).map((r) => ({
        ...r.data,
        _rowNum: r.row,
        _errors: r.errors,
        _isValid: false,
      }))
    : [
        ...validation.invalidRows.slice(0, Math.ceil(maxRows / 2)).map((r) => ({
          ...r.data,
          _rowNum: r.row,
          _errors: r.errors,
          _isValid: false as const,
        })),
        ...validation.validRows
          .slice(0, maxRows - Math.min(validation.invalidRows.length, Math.ceil(maxRows / 2)))
          .map((r, i) => ({
            ...r,
            _rowNum: validation.invalidRows.length > 0 ? i + 1 : i + 1,
            _errors: [] as ValidationError[],
            _isValid: true as const,
          })),
      ].sort((a, b) => a._rowNum - b._rowNum);

  return (
    <div className="space-y-3">
      {validation.invalidCount > 0 && (
        <div className="flex gap-2">
          <Button
            variant={showOnlyErrors ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowOnlyErrors(true)}
          >
            Show Errors Only
          </Button>
          <Button
            variant={!showOnlyErrors ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowOnlyErrors(false)}
          >
            Show All
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto">
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
            {previewRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 2}
                  className="text-center text-muted-foreground py-8"
                >
                  No data to preview
                </TableCell>
              </TableRow>
            ) : (
              previewRows.map((row, index) => {
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
                        <Badge variant="default" className="text-xs">
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      )}
                    </TableCell>
                    {columns.map((col) => {
                      const hasError = errorColumns.has(col);
                      const error = errors.find((e) => e.column === col);

                      return (
                        <TableCell
                          key={col}
                          className={`max-w-[150px] truncate ${
                            hasError ? 'text-destructive' : ''
                          }`}
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
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {Math.min(previewRows.length, maxRows)} of {validation.totalRows} rows
        {showOnlyErrors && validation.invalidCount > 0 && ' (errors only)'}
      </p>
    </div>
  );
}
