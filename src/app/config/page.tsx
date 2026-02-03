'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ConfigForm {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  schema: string;
}

interface ConfigStatus {
  configured: boolean;
  source: 'file' | 'env' | null;
  config: (ConfigForm & { schema?: string }) | null;
}

export default function ConfigPage() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [form, setForm] = useState<ConfigForm>({
    host: 'localhost',
    port: '5432',
    database: '',
    username: '',
    password: '',
    ssl: false,
    schema: 'public',
  });
  const [schemas, setSchemas] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch current config status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        setStatus(data);

        // Pre-fill form if config exists
        if (data.config && data.source === 'file') {
          setForm({
            host: data.config.host || 'localhost',
            port: String(data.config.port || 5432),
            database: data.config.database || '',
            username: data.config.username || '',
            password: '', // Don't pre-fill password
            ssl: data.config.ssl || false,
            schema: data.config.schema || 'public',
          });
        }

        // If already configured, try to fetch schemas
        if (data.configured) {
          fetchSchemas();
        }
      } catch (err) {
        toast.error('Failed to load configuration status');
      }
    }

    fetchStatus();
  }, []);

  const fetchSchemas = async () => {
    setIsLoadingSchemas(true);
    try {
      const response = await fetch('/api/schemas');
      const data = await response.json();
      if (data.schemas) {
        setSchemas(data.schemas);
      }
    } catch (err) {
      // Silently fail - schemas will just not be available
    } finally {
      setIsLoadingSchemas(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setTestResult(null);
  };

  const handleSchemaChange = (value: string) => {
    setForm((prev) => ({ ...prev, schema: value }));
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          port: parseInt(form.port, 10),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: `Connected! ${data.serverVersion}`,
        });
        toast.success('Connection successful');

        // Use schemas returned from test connection
        if (data.schemas && data.schemas.length > 0) {
          setSchemas(data.schemas);
          // If current schema is not in the list, default to first available
          if (!data.schemas.includes(form.schema)) {
            setForm((prev) => ({ ...prev, schema: data.schemas[0] }));
          }
        }
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection failed',
        });
        toast.error(data.error || 'Connection failed');
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Failed to test connection',
      });
      toast.error('Failed to test connection');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          port: parseInt(form.port, 10),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Configuration saved successfully');
        // Refresh status and schemas
        const statusResponse = await fetch('/api/config');
        const statusData = await statusResponse.json();
        setStatus(statusData);
        fetchSchemas();
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!confirm('Are you sure you want to remove the database configuration?')) {
      return;
    }

    try {
      const response = await fetch('/api/config', { method: 'DELETE' });

      if (response.ok) {
        toast.success('Configuration removed');
        setStatus({ configured: false, source: null, config: null });
        setForm({
          host: 'localhost',
          port: '5432',
          database: '',
          username: '',
          password: '',
          ssl: false,
          schema: 'public',
        });
        setSchemas([]);
        setTestResult(null);
      } else {
        toast.error('Failed to remove configuration');
      }
    } catch (err) {
      toast.error('Failed to remove configuration');
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Database Configuration</h1>
        <p className="text-muted-foreground">
          Configure your PostgreSQL database connection
        </p>
      </div>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          {status === null ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : status.configured ? (
            <div className="flex items-center gap-2">
              <Badge variant="default">Connected</Badge>
              <span className="text-sm text-muted-foreground">
                via {status.source === 'env' ? 'environment variable' : 'saved configuration'}
              </span>
              {status.config?.schema && (
                <Badge variant="outline">Schema: {status.config.schema}</Badge>
              )}
            </div>
          ) : (
            <Badge variant="destructive">Not Configured</Badge>
          )}

          {status?.source === 'env' && (
            <p className="text-sm text-muted-foreground mt-2">
              Database is configured via DATABASE_URL environment variable.
              You can override it by saving a new configuration below.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Settings</CardTitle>
          <CardDescription>
            Enter your PostgreSQL database credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-sm font-medium mb-1 block">Host</label>
              <Input
                name="host"
                value={form.host}
                onChange={handleInputChange}
                placeholder="localhost"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-sm font-medium mb-1 block">Port</label>
              <Input
                name="port"
                value={form.port}
                onChange={handleInputChange}
                placeholder="5432"
                type="number"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Database</label>
            <Input
              name="database"
              value={form.database}
              onChange={handleInputChange}
              placeholder="my_database"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Username</label>
            <Input
              name="username"
              value={form.username}
              onChange={handleInputChange}
              placeholder="postgres"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Password</label>
            <Input
              name="password"
              type="password"
              value={form.password}
              onChange={handleInputChange}
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Default Schema</label>
            {schemas.length > 0 ? (
              <Select value={form.schema} onValueChange={handleSchemaChange}>
                <SelectTrigger>
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
            ) : (
              <Input
                name="schema"
                value={form.schema}
                onChange={handleInputChange}
                placeholder="public"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {schemas.length > 0
                ? 'Select the default schema to use for imports'
                : 'Test connection to load available schemas, or enter manually'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ssl"
              name="ssl"
              checked={form.ssl}
              onChange={handleInputChange}
              className="rounded"
            />
            <label htmlFor="ssl" className="text-sm">
              Use SSL connection
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                testResult.success
                  ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
              }`}
            >
              {testResult.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={isTesting || !form.host || !form.database || !form.username}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={isSaving || !form.host || !form.database || !form.username}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
            {status?.source === 'file' && (
              <Button onClick={handleDeleteConfig} variant="destructive">
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
