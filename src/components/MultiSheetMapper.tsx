'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TableInfo,
  TableSchema,
  SheetData,
  SheetTableMapping,
  ColumnInfo,
} from '@/lib/types';

interface MultiSheetMapperProps {
  sheets: SheetData[];
  tables: TableInfo[];
  sheetMappings: SheetTableMapping[];
  tableSchemas: Map<string, TableSchema>;
  onTableSelect: (sheetName: string, tableName: string | null) => void;
  onColumnMappingChange: (
    sheetName: string,
    excelColumn: string,
    dbColumn: string | null
  ) => void;
  onToggleSheet: (sheetName: string) => void;
  getTableSchema: (tableName: string, schema?: string) => TableSchema | undefined;
}

export function MultiSheetMapper({
  sheets,
  tables,
  sheetMappings,
  onTableSelect,
  onColumnMappingChange,
  onToggleSheet,
  getTableSchema,
}: MultiSheetMapperProps) {
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(
    new Set(sheets.slice(0, 2).map((s) => s.name))
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

  const getMapping = (sheetName: string): SheetTableMapping | undefined => {
    return sheetMappings.find((m) => m.sheetName === sheetName);
  };

  const getMappedColumnCount = (mapping: SheetTableMapping): number => {
    return mapping.columnMappings.filter((cm) => cm.dbColumn !== null).length;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Sheet to Table Mapping</CardTitle>
            <Badge variant="outline">
              {sheetMappings.filter((m) => m.tableName).length} of {sheets.length} sheets mapped
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Map each Excel sheet to a database table and configure column mappings
          </p>
        </CardHeader>
      </Card>

      {sheets.map((sheet) => {
        const mapping = getMapping(sheet.name);
        const isExpanded = expandedSheets.has(sheet.name);
        const isEnabled = mapping?.isEnabled ?? true;
        const tableSchema = mapping?.tableName
          ? getTableSchema(mapping.tableName, mapping.schema)
          : undefined;

        return (
          <Card
            key={sheet.name}
            className={`transition-opacity ${!isEnabled ? 'opacity-50' : ''}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-1 h-auto"
                  onClick={() => toggleExpanded(sheet.name)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className={`p-1 h-auto ${
                    isEnabled ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                  onClick={() => onToggleSheet(sheet.name)}
                  title={isEnabled ? 'Disable this sheet' : 'Enable this sheet'}
                >
                  {isEnabled ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">{sheet.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {sheet.totalRows} rows
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {sheet.columns.length} columns
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">&rarr;</span>
                  <Select
                    value={mapping?.tableName || '_none_'}
                    onValueChange={(value) =>
                      onTableSelect(sheet.name, value === '_none_' ? null : value)
                    }
                    disabled={!isEnabled}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select table..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none_">
                        <span className="text-muted-foreground">-- Skip --</span>
                      </SelectItem>
                      {tables.map((table) => (
                        <SelectItem key={table.name} value={table.name}>
                          {table.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {mapping?.tableName && (
                  <Badge
                    variant={getMappedColumnCount(mapping) > 0 ? 'default' : 'destructive'}
                  >
                    {getMappedColumnCount(mapping)} mapped
                  </Badge>
                )}
              </div>
            </CardHeader>

            {isExpanded && isEnabled && mapping?.tableName && tableSchema && (
              <CardContent className="pt-0">
                <SheetColumnMapper
                  sheet={sheet}
                  mapping={mapping}
                  tableSchema={tableSchema}
                  onColumnMappingChange={(excelCol, dbCol) =>
                    onColumnMappingChange(sheet.name, excelCol, dbCol)
                  }
                />
              </CardContent>
            )}

            {isExpanded && isEnabled && !mapping?.tableName && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Select a table to configure column mappings
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

interface SheetColumnMapperProps {
  sheet: SheetData;
  mapping: SheetTableMapping;
  tableSchema: TableSchema;
  onColumnMappingChange: (excelColumn: string, dbColumn: string | null) => void;
}

function SheetColumnMapper({
  sheet,
  mapping,
  tableSchema,
  onColumnMappingChange,
}: SheetColumnMapperProps) {
  const getMappingForColumn = (excelColumn: string) => {
    return (
      mapping.columnMappings.find((m) => m.excelColumn === excelColumn)?.dbColumn ||
      ''
    );
  };

  const getSampleValues = (excelColumn: string) => {
    return sheet.rows
      .slice(0, 2)
      .map((row) => row[excelColumn])
      .filter((v) => v !== undefined && v !== null && v !== '');
  };

  const dbColumns: ColumnInfo[] = tableSchema.columns;

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Excel Column</TableHead>
            <TableHead className="w-[200px]">Sample Values</TableHead>
            <TableHead>Database Column</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sheet.columns.map((excelCol) => (
            <TableRow key={excelCol}>
              <TableCell className="font-medium">{excelCol}</TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                {getSampleValues(excelCol)
                  .map((v) => String(v))
                  .join(', ')}
              </TableCell>
              <TableCell>
                <Select
                  value={getMappingForColumn(excelCol) || '_skip_'}
                  onValueChange={(value) =>
                    onColumnMappingChange(excelCol, value === '_skip_' ? null : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_skip_">
                      <span className="text-muted-foreground">-- Skip --</span>
                    </SelectItem>
                    {dbColumns.map((dbCol) => (
                      <SelectItem key={dbCol.name} value={dbCol.name}>
                        <div className="flex items-center gap-2">
                          <span>{dbCol.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {dbCol.dataType}
                          </Badge>
                          {!dbCol.isNullable && !dbCol.defaultValue && (
                            <Badge variant="destructive" className="text-xs">
                              required
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
