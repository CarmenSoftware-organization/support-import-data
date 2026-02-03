'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SheetData } from '@/lib/types';

interface SheetSelectorProps {
  sheets: SheetData[];
  selectedSheet: string;
  onSheetChange: (sheetName: string) => void;
}

export function SheetSelector({
  sheets,
  selectedSheet,
  onSheetChange,
}: SheetSelectorProps) {
  if (sheets.length <= 1) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Select Worksheet</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={selectedSheet} onValueChange={onSheetChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a sheet" />
          </SelectTrigger>
          <SelectContent>
            {sheets.map((sheet) => (
              <SelectItem key={sheet.name} value={sheet.name}>
                {sheet.name} ({sheet.totalRows} rows)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
