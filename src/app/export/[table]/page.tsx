'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableSchema } from '@/lib/types';
import { toast } from 'sonner';

interface ExportPageProps {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ schema?: string }>;
}

export default function ExportPage({ params, searchParams }: ExportPageProps) {
  const { table } = use(params);
  const { schema = 'public' } = use(searchParams);

  const [tableSchema, setTableSchema] = useState<TableSchema | null>(null);
  const [limit, setLimit] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const params = new URLSearchParams({ table, schema });
      if (limit) {
        params.append('limit', limit);
      }

      const response = await fetch(`/api/export?${params}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table}_export.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export successful');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

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
          Export {schema}.{table}
        </h1>
        <p className="text-muted-foreground">
          Download table data as an Excel file
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tableSchema && (
            <div className="text-sm text-muted-foreground">
              Table has {tableSchema.columns.length} columns
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-xs">
              <label className="text-sm font-medium mb-1 block">
                Row Limit (optional)
              </label>
              <Input
                type="number"
                placeholder="Leave empty for all rows"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export to Excel'}
            </Button>
            <a href={`/api/template/${table}?schema=${schema}`} download>
              <Button variant="outline">Download Empty Template</Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
