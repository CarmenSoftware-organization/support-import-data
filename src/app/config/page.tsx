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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface ConfigForm {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  schema: string;
}

interface Connection {
  id: string;        // UUID
  name: string;      // User-friendly name
  config: ConfigForm;
  isDefault: boolean;
}

export default function ConfigPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [defaultConnectionId, setDefaultConnectionId] = useState<string>('');
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<ConfigForm>({
    host: 'localhost',
    port: '5432',
    database: '',
    username: '',
    password: '',
    ssl: false,
    schema: 'public',
  });
  const [connectionId, setConnectionId] = useState('');  // UUID when editing
  const [connectionName, setConnectionName] = useState('');  // User-friendly name
  const [schemas, setSchemas] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const response = await fetch('/api/config/list');
      const data = await response.json();

      if (data.connections) {
        const connList: Connection[] = Object.entries(data.connections).map(([id, conn]: [string, any]) => ({
          id,
          name: conn.name || id,  // Fallback to ID if name not present
          config: conn as ConfigForm,
          isDefault: id === data.default,
        }));
        setConnections(connList);
        setDefaultConnectionId(data.default || '');
      }
    } catch (err) {
      toast.error('Failed to load connections');
    }
  };

  const handleAddConnection = () => {
    setEditingConnection(null);
    setConnectionId('');  // Will be generated as UUID
    setConnectionName('');
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
    setIsDialogOpen(true);
  };

  const handleEditConnection = (conn: Connection) => {
    setEditingConnection(conn);
    setConnectionId(conn.id);  // UUID
    setConnectionName(conn.name);  // User-friendly name
    setForm({
      ...conn.config,
      port: String(conn.config.port),
      password: '', // Don't pre-fill password for security
    });
    setSchemas([]);
    setTestResult(null);
    setIsDialogOpen(true);
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

        if (data.schemas && data.schemas.length > 0) {
          setSchemas(data.schemas);
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

  const handleSaveConnection = async () => {
    if (!connectionName.trim()) {
      toast.error('Please enter a connection name');
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: editingConnection ? connectionId : null,  // null = create new UUID
          name: connectionName.trim(),
          config: {
            ...form,
            port: parseInt(form.port, 10),
          },
          setAsDefault: !editingConnection, // Set as default if it's a new connection
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Connection saved successfully');
        setIsDialogOpen(false);
        loadConnections();
      } else {
        toast.error(data.error || 'Failed to save connection');
      }
    } catch (err) {
      toast.error('Failed to save connection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    if (!confirm(`Are you sure you want to delete connection "${id}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/config/delete?connectionId=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Connection deleted');
        loadConnections();
      } else {
        toast.error('Failed to delete connection');
      }
    } catch (err) {
      toast.error('Failed to delete connection');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch('/api/config/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: id }),
      });

      if (response.ok) {
        toast.success('Default connection updated');
        loadConnections();
      } else {
        toast.error('Failed to set default connection');
      }
    } catch (err) {
      toast.error('Failed to set default connection');
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Database Connections</h1>
        <p className="text-muted-foreground">
          Manage multiple PostgreSQL database connections
        </p>
      </div>

      <div className="mb-4">
        <Button onClick={handleAddConnection}>Add New Connection</Button>
      </div>

      {/* Connections List */}
      <div className="space-y-4">
        {connections.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No connections configured. Add your first connection to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          connections.map((conn) => (
            <Card key={conn.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{conn.name}</CardTitle>
                    {conn.isDefault && <Badge variant="default">Default</Badge>}
                  </div>
                  <div className="flex gap-2">
                    {!conn.isDefault && (
                      <Button
                        onClick={() => handleSetDefault(conn.id)}
                        variant="outline"
                        size="sm"
                      >
                        Set as Default
                      </Button>
                    )}
                    <Button
                      onClick={() => handleEditConnection(conn)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteConnection(conn.id)}
                      variant="destructive"
                      size="sm"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">
                  ID: <code className="bg-muted px-1 rounded">{conn.id}</code>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Host:</span> {conn.config.host}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Port:</span> {conn.config.port}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Database:</span> {conn.config.database}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Schema:</span> {conn.config.schema}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Username:</span> {conn.config.username}
                  </div>
                  <div>
                    <span className="text-muted-foreground">SSL:</span> {conn.config.ssl ? 'Yes' : 'No'}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit/Add Connection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? `Edit Connection: ${editingConnection.name}` : 'Add New Connection'}
            </DialogTitle>
            <DialogDescription>
              Configure PostgreSQL database connection settings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Connection Name</label>
              <Input
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="e.g., Main Database, Company Profile, Production"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A user-friendly name for this connection (can be changed anytime)
              </p>
            </div>

            {editingConnection && (
              <div className="text-sm bg-muted p-3 rounded-lg">
                <p className="text-muted-foreground">
                  <strong>Connection ID:</strong> <code>{editingConnection.id}</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  (Internal identifier - cannot be changed)
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Host</label>
                <Input
                  name="host"
                  value={form.host}
                  onChange={handleInputChange}
                  placeholder="localhost"
                />
              </div>
              <div>
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
          </div>

          <DialogFooter>
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={isTesting || !form.host || !form.database || !form.username}
            >
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              onClick={handleSaveConnection}
              disabled={isSaving || !form.host || !form.database || !form.username || !connectionName.trim()}
            >
              {isSaving ? 'Saving...' : 'Save Connection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
