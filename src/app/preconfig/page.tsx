'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileUploader } from '@/components/FileUploader';
import { MultiSheetMapper } from '@/components/MultiSheetMapper';
import { MultiSheetPreview } from '@/components/MultiSheetPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  TableInfo,
  TableSchema,
  ParsedExcel,
  SheetTableMapping,
  ColumnMapping,
  MultiSheetValidationResult,
  MultiSheetImportResult,
} from '@/lib/types';

type Step = 'upload' | 'map' | 'preview' | 'done';

export default function PreconfigImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [parsedExcel, setParsedExcel] = useState<ParsedExcel | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [tableSchemas, setTableSchemas] = useState<Map<string, TableSchema>>(new Map());
  const [sheetMappings, setSheetMappings] = useState<SheetTableMapping[]>([]);
  const [validationResults, setValidationResults] = useState<MultiSheetValidationResult[]>([]);
  const [importResults, setImportResults] = useState<MultiSheetImportResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Fetch schemas on mount
  useEffect(() => {
    async function fetchSchemas() {
      try {
        const response = await fetch('/api/schemas');
        const data = await response.json();
        if (data.schemas) {
          setSchemas(data.schemas);
        }
      } catch {
        // Silently fail
      }
    }
    fetchSchemas();
  }, []);

  // Fetch tables when schema changes
  useEffect(() => {
    async function fetchTables() {
      try {
        const url = currentSchema
          ? `/api/tables?schema=${currentSchema}`
          : '/api/tables';
        const response = await fetch(url);
        const data = await response.json();
        if (data.tables) {
          setTables(data.tables);
        }
        // Set current schema from response if not already set
        if (!currentSchema && data.currentSchema) {
          setCurrentSchema(data.currentSchema);
        }
      } catch {
        // Silently fail
      }
    }
    fetchTables();
  }, [currentSchema]);


  // Fetch table schema when a table is selected for a sheet
  const fetchTableSchema = async (tableName: string, schema: string): Promise<TableSchema | null> => {
    const cacheKey = `${schema}.${tableName}`;
    if (tableSchemas.has(cacheKey)) {
      return tableSchemas.get(cacheKey)!;
    }

    try {
      const response = await fetch(`/api/tables/${tableName}?schema=${schema}`);
      const data = await response.json();
      if (response.ok) {
        setTableSchemas((prev) => new Map(prev).set(cacheKey, data));
        return data;
      }
    } catch {
      // Silently fail
    }
    return null;
  };

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse file');
      }

      setParsedExcel(data);

      // Initialize sheet mappings
      const initialMappings: SheetTableMapping[] = data.sheets.map(
        (sheet: { name: string }) => ({
          sheetName: sheet.name,
          tableName: null,
          schema: currentSchema || 'public',
          columnMappings: [],
          validation: null,
          isEnabled: true,
        })
      );
      setSheetMappings(initialMappings);
      setStep('map');
      toast.success(`File "${file.name}" uploaded with ${data.sheets.length} sheets`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle table selection for a sheet
  const handleTableSelect = async (sheetName: string, tableName: string | null) => {
    if (tableName) {
      const schema = currentSchema || 'public';
      const tableSchema = await fetchTableSchema(tableName, schema);
      const sheet = parsedExcel?.sheets.find((s) => s.name === sheetName);

      if (tableSchema && sheet) {
        // Auto-match columns
        const columnMappings: ColumnMapping[] = sheet.columns.map((excelCol) => {
          const matchedDbCol = tableSchema.columns.find(
            (dbCol) =>
              dbCol.name.toLowerCase() === excelCol.toLowerCase() ||
              dbCol.name.toLowerCase().replace(/_/g, ' ') === excelCol.toLowerCase() ||
              dbCol.name.toLowerCase() === excelCol.toLowerCase().replace(/ /g, '_')
          );

          return {
            excelColumn: excelCol,
            dbColumn: matchedDbCol?.name || null,
            sampleValues: sheet.rows.slice(0, 3).map((row) => row[excelCol]),
          };
        });

        setSheetMappings((prev) =>
          prev.map((m) =>
            m.sheetName === sheetName
              ? { ...m, tableName, schema, columnMappings, validation: null }
              : m
          )
        );
      }
    } else {
      setSheetMappings((prev) =>
        prev.map((m) =>
          m.sheetName === sheetName
            ? { ...m, tableName: null, columnMappings: [], validation: null }
            : m
        )
      );
    }
  };

  // Handle column mapping change
  const handleColumnMappingChange = (
    sheetName: string,
    excelColumn: string,
    dbColumn: string | null
  ) => {
    setSheetMappings((prev) =>
      prev.map((m) =>
        m.sheetName === sheetName
          ? {
              ...m,
              columnMappings: m.columnMappings.map((cm) =>
                cm.excelColumn === excelColumn ? { ...cm, dbColumn } : cm
              ),
              validation: null,
            }
          : m
      )
    );
  };

  // Toggle sheet enabled/disabled
  const handleToggleSheet = (sheetName: string) => {
    setSheetMappings((prev) =>
      prev.map((m) =>
        m.sheetName === sheetName ? { ...m, isEnabled: !m.isEnabled } : m
      )
    );
  };

  // Validate all sheets
  const handleValidate = async () => {
    if (!parsedExcel) return;

    setIsValidating(true);
    const results: MultiSheetValidationResult[] = [];

    const enabledMappings = sheetMappings.filter(
      (m) => m.isEnabled && m.tableName && m.columnMappings.some((cm) => cm.dbColumn)
    );

    for (const mapping of enabledMappings) {
      const sheet = parsedExcel.sheets.find((s) => s.name === mapping.sheetName);
      if (!sheet) continue;

      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName: mapping.tableName,
            schema: mapping.schema,
            mappings: mapping.columnMappings,
            rows: sheet.rows,
            skipInvalid: false,
          }),
        });

        const data = await response.json();

        if (data.validation) {
          results.push({
            sheetName: mapping.sheetName,
            tableName: mapping.tableName!,
            schema: mapping.schema,
            validation: data.validation,
          });

          // Update the mapping with validation result
          setSheetMappings((prev) =>
            prev.map((m) =>
              m.sheetName === mapping.sheetName
                ? { ...m, validation: data.validation }
                : m
            )
          );
        }
      } catch {
        toast.error(`Validation failed for sheet "${mapping.sheetName}"`);
      }
    }

    setValidationResults(results);
    setIsValidating(false);

    if (results.length > 0) {
      setStep('preview');
      const totalValid = results.reduce((sum, r) => sum + r.validation.validCount, 0);
      const totalInvalid = results.reduce((sum, r) => sum + r.validation.invalidCount, 0);
      toast.success(`Validation complete: ${totalValid} valid, ${totalInvalid} invalid rows`);
    } else {
      toast.error('No sheets configured for import');
    }
  };

  // Import all validated sheets
  const handleImport = async () => {
    if (!parsedExcel) return;

    setIsImporting(true);
    const results: MultiSheetImportResult[] = [];

    const enabledMappings = sheetMappings.filter(
      (m) =>
        m.isEnabled &&
        m.tableName &&
        m.validation &&
        m.validation.validCount > 0
    );

    for (const mapping of enabledMappings) {
      const sheet = parsedExcel.sheets.find((s) => s.name === mapping.sheetName);
      if (!sheet) continue;

      try {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName: mapping.tableName,
            schema: mapping.schema,
            mappings: mapping.columnMappings,
            rows: sheet.rows,
            skipInvalid: true,
          }),
        });

        const data = await response.json();

        results.push({
          sheetName: mapping.sheetName,
          tableName: mapping.tableName!,
          success: data.success,
          importedCount: data.importedCount || 0,
          skippedCount: data.skippedCount || 0,
          errors: data.dbErrors || [],
        });
      } catch (err) {
        results.push({
          sheetName: mapping.sheetName,
          tableName: mapping.tableName!,
          success: false,
          importedCount: 0,
          skippedCount: 0,
          errors: [err instanceof Error ? err.message : 'Unknown error'],
        });
      }
    }

    setImportResults(results);
    setIsImporting(false);

    const totalImported = results.reduce((sum, r) => sum + r.importedCount, 0);
    const successCount = results.filter((r) => r.success).length;

    if (successCount === results.length) {
      toast.success(`Successfully imported ${totalImported} rows across ${successCount} tables`);
    } else {
      toast.error(`Import completed with errors. ${totalImported} rows imported.`);
    }

    setStep('done');
  };

  // Reset to start over
  const handleReset = () => {
    setParsedExcel(null);
    setSheetMappings([]);
    setValidationResults([]);
    setImportResults([]);
    setStep('upload');
  };

  // Get table schema for a specific table
  const getTableSchema = (tableName: string, schema?: string): TableSchema | undefined => {
    const schemaToUse = schema || currentSchema || 'public';
    return tableSchemas.get(`${schemaToUse}.${tableName}`);
  };

  // Count configured sheets
  const configuredSheetsCount = sheetMappings.filter(
    (m) => m.isEnabled && m.tableName && m.columnMappings.some((cm) => cm.dbColumn)
  ).length;

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Multi-Sheet Import</h1>
          <p className="text-muted-foreground">
            Import data from multiple Excel sheets to multiple database tables
          </p>
          <Link
            href="/preconfig/wizard"
            className="text-sm text-primary hover:underline mt-1 inline-block"
          >
            Or use the step-by-step Preconfig Wizard →
          </Link>
        </div>
        {schemas.length > 0 && step !== 'upload' && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Schema:</label>
            <Select value={currentSchema} onValueChange={setCurrentSchema}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((schema) => (
                  <SelectItem key={schema} value={schema}>
                    {schema}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          {['upload', 'map', 'preview', 'done'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : ['upload', 'map', 'preview', 'done'].indexOf(step) > i
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && (
                <div
                  className={`w-16 h-1 mx-2 ${
                    ['upload', 'map', 'preview', 'done'].indexOf(step) > i
                      ? 'bg-primary/50'
                      : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <span className="text-xs w-8 text-center">Upload</span>
          <span className="text-xs w-16 ml-2" />
          <span className="text-xs w-8 text-center">Map</span>
          <span className="text-xs w-16 ml-2" />
          <span className="text-xs w-8 text-center">Preview</span>
          <span className="text-xs w-16 ml-2" />
          <span className="text-xs w-8 text-center">Done</span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} />
        )}

        {/* Step 2: Map sheets to tables */}
        {step === 'map' && parsedExcel && (
          <>
            <MultiSheetMapper
              sheets={parsedExcel.sheets}
              tables={tables}
              sheetMappings={sheetMappings}
              tableSchemas={tableSchemas}
              onTableSelect={handleTableSelect}
              onColumnMappingChange={handleColumnMappingChange}
              onToggleSheet={handleToggleSheet}
              getTableSchema={getTableSchema}
            />

            <div className="flex gap-4">
              <Button onClick={handleReset} variant="outline">
                Upload Different File
              </Button>
              <Button
                onClick={handleValidate}
                disabled={configuredSheetsCount === 0 || isValidating}
              >
                {isValidating
                  ? 'Validating...'
                  : `Validate ${configuredSheetsCount} Sheet${configuredSheetsCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Preview validation results */}
        {step === 'preview' && (
          <>
            <MultiSheetPreview
              validationResults={validationResults}
              sheetMappings={sheetMappings}
              parsedExcel={parsedExcel}
            />

            <div className="flex gap-4">
              <Button onClick={() => setStep('map')} variant="outline">
                Back to Mapping
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  validationResults.every((r) => r.validation.validCount === 0) ||
                  isImporting
                }
              >
                {isImporting
                  ? 'Importing...'
                  : `Import ${validationResults.reduce((sum, r) => sum + r.validation.validCount, 0)} Valid Rows`}
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <Card>
            <CardHeader>
              <CardTitle>Import Complete</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {importResults.map((result) => (
                  <div
                    key={result.sheetName}
                    className={`p-4 rounded-lg border ${
                      result.success
                        ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                        : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {result.sheetName} &rarr; {result.tableName}
                      </span>
                      <span
                        className={`text-sm ${
                          result.success ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {result.success ? 'Success' : 'Failed'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Imported: {result.importedCount} | Skipped: {result.skippedCount}
                    </p>
                    {result.errors.length > 0 && (
                      <ul className="text-sm text-red-600 mt-2">
                        {result.errors.slice(0, 3).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {result.errors.length > 3 && (
                          <li>...and {result.errors.length - 3} more errors</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={handleReset}>Import More Data</Button>
                <Link href="/">
                  <Button variant="outline">Back to Home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
