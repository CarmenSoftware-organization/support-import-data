'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ColumnInfo, ColumnMapping } from '@/lib/types';

interface ColumnMapperProps {
  excelColumns: string[];
  dbColumns: ColumnInfo[];
  mappings: ColumnMapping[];
  onMappingChange: (excelColumn: string, dbColumn: string | null) => void;
}

export function ColumnMapper({
  excelColumns,
  dbColumns,
  mappings,
  onMappingChange,
}: ColumnMapperProps) {
  const getMappingForColumn = (excelColumn: string) => {
    return mappings.find((m) => m.excelColumn === excelColumn)?.dbColumn || '';
  };

  const getSampleValues = (excelColumn: string) => {
    const mapping = mappings.find((m) => m.excelColumn === excelColumn);
    return mapping?.sampleValues || [];
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Map Columns</CardTitle>
        <p className="text-sm text-muted-foreground">
          Match Excel columns to database columns
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Excel Column</TableHead>
              <TableHead className="w-[200px]">Sample Values</TableHead>
              <TableHead className="w-[250px]">Database Column</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {excelColumns.map((excelCol) => (
              <TableRow key={excelCol}>
                <TableCell className="font-medium">{excelCol}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {getSampleValues(excelCol)
                    .slice(0, 2)
                    .map((v) => String(v))
                    .join(', ')}
                </TableCell>
                <TableCell>
                  <Select
                    value={getMappingForColumn(excelCol)}
                    onValueChange={(value) =>
                      onMappingChange(excelCol, value === '_skip_' ? null : value)
                    }
                  >
                    <SelectTrigger>
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
      </CardContent>
    </Card>
  );
}
