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

interface Connection {
  id: string;
  name: string;
  schema: string;
}

export default function Home() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [currentConnectionId, setCurrentConnectionId] = useState<string>('');
  const [currentSchema, setCurrentSchema] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  // Fetch connections
  useEffect(() => {
    async function fetchConnections() {
      try {
        const response = await fetch('/api/config/list');
        const data = await response.json();
        if (data.connections) {
          const connList: Connection[] = Object.entries(data.connections).map(([id, conn]: [string, any]) => ({
            id,
            name: conn.name || id,
            schema: conn.schema || 'public',
          }));
          setConnections(connList);

          // Set default connection
          if (data.default) {
            setCurrentConnectionId(data.default);
            const defaultConn = connList.find(c => c.id === data.default);
            if (defaultConn) {
              setCurrentSchema(defaultConn.schema);
            }
          }
        }
      } catch (err) {
        // Silently fail
      }
    }

    fetchConnections();
  }, []);

  // Fetch tables
  useEffect(() => {
    async function fetchTables() {
      if (!currentConnectionId) return;

      setIsLoading(true);
      setError(null);

      try {
        const url = `/api/tables?connectionId=${currentConnectionId}&schema=${currentSchema}`;
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
  }, [currentConnectionId, currentSchema]);

  const handleConnectionChange = (connectionId: string) => {
    setCurrentConnectionId(connectionId);
    const connection = connections.find(c => c.id === connectionId);
    if (connection) {
      setCurrentSchema(connection.schema);
    }
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
        <div className="flex gap-2">
          <Link href="/preconfig/wizard">
            <Button>Preconfig Wizard</Button>
          </Link>
          <Link href="/config">
            <Button variant="outline">Settings</Button>
          </Link>
        </div>
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
          {/* Connection Selector */}
          {connections.length > 0 && (
            <div className="mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium whitespace-nowrap">Database Connection:</label>
                    <Select value={currentConnectionId} onValueChange={handleConnectionChange}>
                      <SelectTrigger className="w-[300px]">
                        <SelectValue placeholder="Select connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((connection) => (
                          <SelectItem key={connection.id} value={connection.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{connection.name}</span>
                              <span className="text-xs text-muted-foreground">({connection.schema})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <TableList
            tables={tables}
            isLoading={isLoading}
            error={error}
            currentSchema={currentSchema}
            connectionId={currentConnectionId}
          />
        </>
      )}
    </main>
  );
}
