'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { FileUploader } from '@/components/FileUploader';
import { SheetSelector } from '@/components/SheetSelector';
import { ColumnMapper } from '@/components/ColumnMapper';
import { DataPreview } from '@/components/DataPreview';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  TableSchema,
  ParsedExcel,
  SheetData,
  ColumnMapping,
  ValidationResult,
} from '@/lib/types';

interface ImportPageProps {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ schema?: string }>;
}

export default function ImportPage({ params, searchParams }: ImportPageProps) {
  const { table } = use(params);
  const { schema = 'public' } = use(searchParams);

  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [parsedExcel, setParsedExcel] = useState<ParsedExcel | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');

  // Fetch table schema
  useEffect(() => {
    async function fetchSchema() {
      try {
        const response = await fetch(`/api/tables/${table}?schema=${schema}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch table schema');
        }

        setTableSchema(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    fetchSchema();
  }, [table, schema]);

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);

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

      // Auto-select first sheet
      if (data.sheets.length > 0) {
        setSelectedSheet(data.sheets[0].name);
        initializeMappings(data.sheets[0]);
      }

      setStep('map');
      toast.success(`File "${file.name}" uploaded successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      toast.error('Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize column mappings with auto-matching
  const initializeMappings = (sheet: SheetData) => {
    if (!tableSchema) return;

    const newMappings: ColumnMapping[] = sheet.columns.map((excelCol) => {
      // Try to auto-match by column name (case-insensitive)
      const matchedDbCol = tableSchema.columns.find(
        (dbCol) => dbCol.name.toLowerCase() === excelCol.toLowerCase()
      );

      return {
        excelColumn: excelCol,
        dbColumn: matchedDbCol?.name || null,
        sampleValues: sheet.rows.slice(0, 3).map((row) => row[excelCol]),
      };
    });

    setMappings(newMappings);
  };

  // Handle sheet change
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const sheet = parsedExcel?.sheets.find((s) => s.name === sheetName);
    if (sheet) {
      initializeMappings(sheet);
    }
    setValidation(null);
  };

  // Handle mapping change
  const handleMappingChange = (excelColumn: string, dbColumn: string | null) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.excelColumn === excelColumn ? { ...m, dbColumn } : m
      )
    );
    setValidation(null);
  };

  // Validate data
  const handleValidate = async () => {
    if (!parsedExcel || !tableSchema) return;

    const sheet = parsedExcel.sheets.find((s) => s.name === selectedSheet);
    if (!sheet) return;

    setIsLoading(true);

    try {
      // Call import API with validation only
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: table,
          schema,
          mappings,
          rows: sheet.rows,
          skipInvalid: false,
        }),
      });

      const data = await response.json();

      if (data.validation) {
        setValidation(data.validation);
        setStep('preview');
      }
    } catch (err) {
      toast.error('Validation failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Import data
  const handleImport = async () => {
    if (!parsedExcel || !validation) return;

    const sheet = parsedExcel.sheets.find((s) => s.name === selectedSheet);
    if (!sheet) return;

    setIsImporting(true);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: table,
          schema,
          mappings,
          rows: sheet.rows,
          skipInvalid: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message);
        setStep('done');
      } else {
        toast.error(data.message || 'Import failed');
      }
    } catch (err) {
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  // Get current sheet
  const currentSheet = parsedExcel?.sheets.find((s) => s.name === selectedSheet);

  // Get mapped excel columns for preview
  const mappedExcelColumns = mappings
    .filter((m) => m.dbColumn !== null)
    .map((m) => m.excelColumn);

  if (error) {
    return (
      <main className="min-h-screen p-8 max-w-6xl mx-auto">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Link href="/">
              <Button>Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          &larr; Back to tables
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Import to {schema}.{table}
        </h1>
        <p className="text-muted-foreground">
          Upload an Excel file and map columns to import data
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} />
        )}

        {/* Step 2: Map columns */}
        {step === 'map' && parsedExcel && tableSchema && (
          <>
            {parsedExcel.sheets.length > 1 && (
              <SheetSelector
                sheets={parsedExcel.sheets}
                selectedSheet={selectedSheet}
                onSheetChange={handleSheetChange}
              />
            )}

            <ColumnMapper
              excelColumns={currentSheet?.columns || []}
              dbColumns={tableSchema.columns}
              mappings={mappings}
              onMappingChange={handleMappingChange}
            />

            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setParsedExcel(null);
                  setStep('upload');
                }}
                variant="outline"
              >
                Upload Different File
              </Button>
              <Button
                onClick={handleValidate}
                disabled={mappings.every((m) => m.dbColumn === null) || isLoading}
              >
                {isLoading ? 'Validating...' : 'Validate & Preview'}
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Preview and import */}
        {step === 'preview' && validation && (
          <>
            <DataPreview
              validation={validation}
              columns={mappedExcelColumns}
            />

            <div className="flex gap-4">
              <Button onClick={() => setStep('map')} variant="outline">
                Back to Mapping
              </Button>
              <Button
                onClick={handleImport}
                disabled={validation.validCount === 0 || isImporting}
              >
                {isImporting
                  ? 'Importing...'
                  : `Import ${validation.validCount} Valid Rows`}
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
              <p>Your data has been successfully imported.</p>
              <div className="flex gap-4">
                <Button
                  onClick={() => {
                    setParsedExcel(null);
                    setValidation(null);
                    setStep('upload');
                  }}
                >
                  Import More Data
                </Button>
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
