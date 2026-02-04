'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableInfo } from '@/lib/types';

interface TableListProps {
  tables: TableInfo[];
  isLoading?: boolean;
  error?: string | null;
  currentSchema?: string;
  connectionId?: string;
}

export function TableList({ tables, isLoading, error, currentSchema, connectionId }: TableListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading tables...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (tables.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No tables found in this schema
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="grid gap-2">
          {tables.map((table) => {
            const schema = currentSchema || table.schema;
            const connParam = connectionId ? `&connectionId=${connectionId}` : '';
            return (
              <div
                key={`${schema}.${table.name}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
              >
                <span className="font-medium">{table.name}</span>
                <div className="flex gap-2">
                  <Link href={`/import/${table.name}?schema=${schema}${connParam}`}>
                    <Button size="sm">Import</Button>
                  </Link>
                  <Link href={`/export/${table.name}?schema=${schema}${connParam}`}>
                    <Button size="sm" variant="outline">
                      Export
                    </Button>
                  </Link>
                  <a
                    href={`/api/template/${table.name}?schema=${schema}${connParam}`}
                    download
                  >
                    <Button size="sm" variant="ghost">
                      Template
                    </Button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
