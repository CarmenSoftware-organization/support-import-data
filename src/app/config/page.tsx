'use client';

import { useEffect, useState, useRef } from 'react';
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

interface CertFiles {
  ca: File | null;
  cert: File | null;
  key: File | null;
}

interface Connection {
  id: string;        // UUID
  name: string;      // User-friendly name
  config: ConfigForm;
  isDefault: boolean;
  hasCaCert?: boolean;
  hasClientCert?: boolean;
  hasClientKey?: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix (e.g., "data:application/x-pem-file;base64,")
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [certFiles, setCertFiles] = useState<CertFiles>({ ca: null, cert: null, key: null });
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

  const caInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

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
          hasCaCert: conn.hasCaCert,
          hasClientCert: conn.hasClientCert,
          hasClientKey: conn.hasClientKey,
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
    setCertFiles({ ca: null, cert: null, key: null });
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
    setCertFiles({ ca: null, cert: null, key: null });
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

  const handleCertFileChange = (type: keyof CertFiles) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setCertFiles((prev) => ({ ...prev, [type]: file }));
    setTestResult(null);
  };

  const handleRemoveCert = (type: keyof CertFiles) => {
    setCertFiles((prev) => ({ ...prev, [type]: null }));
    // Reset the file input
    const ref = type === 'ca' ? caInputRef : type === 'cert' ? certInputRef : keyInputRef;
    if (ref.current) ref.current.value = '';
    setTestResult(null);
  };

  async function buildCertsPayload(): Promise<Record<string, string> | undefined> {
    if (!certFiles.ca && !certFiles.cert && !certFiles.key) return undefined;
    const payload: Record<string, string> = {};
    if (certFiles.ca) payload.ca = await fileToBase64(certFiles.ca);
    if (certFiles.cert) payload.cert = await fileToBase64(certFiles.cert);
    if (certFiles.key) payload.key = await fileToBase64(certFiles.key);
    return Object.keys(payload).length > 0 ? payload : undefined;
  }

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const certs = await buildCertsPayload();
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          port: parseInt(form.port, 10),
          ...(certs ? { certs } : {}),
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
      const certs = await buildCertsPayload();
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
          ...(certs ? { certs } : {}),
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

  /** Whether the editing connection already has a cert of a given type on the server */
  const hasExistingCert = (type: 'ca' | 'cert' | 'key') => {
    if (!editingConnection) return false;
    if (type === 'ca') return editingConnection.hasCaCert;
    if (type === 'cert') return editingConnection.hasClientCert;
    return editingConnection.hasClientKey;
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
                    <span className="text-muted-foreground">SSL:</span>{' '}
                    {conn.config.ssl ? (
                      <>
                        Yes
                        {conn.hasCaCert && (
                          <span className="ml-1 text-xs text-green-600 dark:text-green-400">(CA cert)</span>
                        )}
                      </>
                    ) : (
                      'No'
                    )}
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

            {/* SSL Certificate Files */}
            {form.ssl && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">SSL Certificates (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Upload certificate files for verified SSL connections (e.g., AWS RDS, Google Cloud SQL, Supabase).
                  Without certificates, the connection uses unverified SSL.
                </p>

                {/* CA Certificate */}
                <div>
                  <label className="text-xs font-medium mb-1 block">CA Certificate</label>
                  {hasExistingCert('ca') && !certFiles.ca ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Uploaded</Badge>
                      <span className="text-xs text-muted-foreground">Upload a new file to replace</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      ref={caInputRef}
                      type="file"
                      accept=".pem,.crt,.cer"
                      onChange={handleCertFileChange('ca')}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    {certFiles.ca && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleRemoveCert('ca')}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {/* Client Certificate */}
                <div>
                  <label className="text-xs font-medium mb-1 block">Client Certificate</label>
                  {hasExistingCert('cert') && !certFiles.cert ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Uploaded</Badge>
                      <span className="text-xs text-muted-foreground">Upload a new file to replace</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      ref={certInputRef}
                      type="file"
                      accept=".pem,.crt,.cer"
                      onChange={handleCertFileChange('cert')}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    {certFiles.cert && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleRemoveCert('cert')}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {/* Client Key */}
                <div>
                  <label className="text-xs font-medium mb-1 block">Client Key</label>
                  {hasExistingCert('key') && !certFiles.key ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Uploaded</Badge>
                      <span className="text-xs text-muted-foreground">Upload a new file to replace</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      ref={keyInputRef}
                      type="file"
                      accept=".pem,.key"
                      onChange={handleCertFileChange('key')}
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    {certFiles.key && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleRemoveCert('key')}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

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
