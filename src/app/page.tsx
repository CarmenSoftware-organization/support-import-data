'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TableList } from '@/components/TableList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableInfo } from '@/lib/types';

export default function Home() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  // Fetch schemas
  useEffect(() => {
    async function fetchSchemas() {
      try {
        const response = await fetch('/api/schemas');
        const data = await response.json();
        if (data.schemas) {
          setSchemas(data.schemas);
        }
      } catch (err) {
        // Silently fail
      }
    }

    fetchSchemas();
  }, []);

  // Fetch tables
  useEffect(() => {
    async function fetchTables() {
      setIsLoading(true);
      setError(null);

      try {
        const url = currentSchema
          ? `/api/tables?schema=${currentSchema}`
          : '/api/tables';
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          if (data.error?.includes('not configured') || data.error?.includes('DATABASE_URL')) {
            setIsNotConfigured(true);
            return;
          }
          throw new Error(data.error || 'Failed to fetch tables');
        }

        setTables(data.tables);

        // Set current schema from response if not already set
        if (!currentSchema && data.currentSchema) {
          setCurrentSchema(data.currentSchema);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.includes('not configured') || message.includes('DATABASE_URL')) {
          setIsNotConfigured(true);
        } else {
          setError(message);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchTables();
  }, [currentSchema]);

  const handleSchemaChange = (value: string) => {
    setCurrentSchema(value);
  };

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Excel Import Tool</h1>
          <p className="text-muted-foreground">
            Import data from Excel files to your PostgreSQL database
          </p>
        </div>
        <Link href="/config">
          <Button variant="outline">Settings</Button>
        </Link>
      </div>

      {isNotConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle>Database Not Configured</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Please configure your PostgreSQL database connection to get started.
            </p>
            <Link href="/config">
              <Button>Configure Database</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Schema Selector */}
          {schemas.length > 0 && (
            <div className="mb-6 flex items-center gap-3">
              <label className="text-sm font-medium">Schema:</label>
              <Select value={currentSchema} onValueChange={handleSchemaChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select schema" />
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

          <TableList
            tables={tables}
            isLoading={isLoading}
            error={error}
            currentSchema={currentSchema}
          />
        </>
      )}
    </main>
  );
}
