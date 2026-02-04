import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface DatabaseConfig {
  id: string;        // UUID - immutable identifier
  name: string;      // User-friendly name - can be changed
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  schema: string;
}

export interface MultiDatabaseConfig {
  connections: Record<string, DatabaseConfig>;  // Key is UUID
  default: string;  // UUID of default connection
}

const CONFIG_FILE = path.join(process.cwd(), 'db-config.json');

// Legacy support: Read old single-config format and migrate to new format
function migrateOldConfig(data: unknown): MultiDatabaseConfig | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check if it's the new format (has 'connections' and 'default')
  if ('connections' in obj && 'default' in obj) {
    const config = obj as unknown as MultiDatabaseConfig;

    // Migrate old name-based connections to UUID-based
    const migratedConnections: Record<string, DatabaseConfig> = {};
    let migratedDefault = config.default;

    for (const [key, conn] of Object.entries(config.connections)) {
      // Check if connection already has UUID format
      if (conn.id && conn.name) {
        migratedConnections[key] = conn;
      } else {
        // Migrate old format: key was the name, now generate UUID
        const uuid = randomUUID();
        migratedConnections[uuid] = {
          ...conn,
          id: uuid,
          name: key, // Use old key as the name
        };

        // Update default if this was the default connection
        if (key === config.default) {
          migratedDefault = uuid;
        }
      }
    }

    return {
      connections: migratedConnections,
      default: migratedDefault,
    };
  }

  // Check if it's the old single-config format (has 'host', 'port', etc.)
  if ('host' in obj && 'database' in obj) {
    const uuid = randomUUID();
    return {
      connections: {
        [uuid]: {
          ...(obj as Omit<DatabaseConfig, 'id' | 'name'>),
          id: uuid,
          name: 'main',
        },
      },
      default: uuid,
    };
  }

  return null;
}

export function getMultiConfig(): MultiDatabaseConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return migrateOldConfig(parsed);
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return null;
}

// Get a specific connection config
export function getConfig(connectionId?: string): DatabaseConfig | null {
  const multiConfig = getMultiConfig();
  if (!multiConfig) return null;

  const id = connectionId || multiConfig.default;
  return multiConfig.connections[id] || null;
}

// Get all connection IDs
export function getConnectionIds(): string[] {
  const multiConfig = getMultiConfig();
  return multiConfig ? Object.keys(multiConfig.connections) : [];
}

// Save entire multi-config
export function saveMultiConfig(config: MultiDatabaseConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Save or update a single connection
export function saveConnection(
  connectionId: string | null,  // null = create new with UUID
  name: string,
  config: Omit<DatabaseConfig, 'id' | 'name'>,
  setAsDefault = false
): string {
  const multiConfig = getMultiConfig() || { connections: {}, default: '' };

  // Generate UUID for new connection or use existing ID
  const id = connectionId || randomUUID();

  multiConfig.connections[id] = {
    ...config,
    id,
    name,
  };

  if (setAsDefault || !multiConfig.default || !multiConfig.connections[multiConfig.default]) {
    multiConfig.default = id;
  }

  saveMultiConfig(multiConfig);
  return id;  // Return the UUID
}

// Update connection name only
export function updateConnectionName(connectionId: string, newName: string): void {
  const multiConfig = getMultiConfig();
  if (!multiConfig || !multiConfig.connections[connectionId]) {
    throw new Error(`Connection ${connectionId} not found`);
  }

  multiConfig.connections[connectionId].name = newName;
  saveMultiConfig(multiConfig);
}

// Delete a specific connection
export function deleteConnection(connectionId: string): void {
  const multiConfig = getMultiConfig();
  if (!multiConfig) return;

  delete multiConfig.connections[connectionId];

  // If we deleted the default, pick a new one
  if (multiConfig.default === connectionId) {
    const remainingIds = Object.keys(multiConfig.connections);
    multiConfig.default = remainingIds.length > 0 ? remainingIds[0] : '';
  }

  if (Object.keys(multiConfig.connections).length === 0) {
    deleteConfig();
  } else {
    saveMultiConfig(multiConfig);
  }
}

export function deleteConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

export function getConnectionString(connectionId?: string): string | null {
  // First check environment variable (only for default connection)
  if (!connectionId && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Then check config file
  const config = getConfig(connectionId);
  if (config) {
    const { host, port, database, username, password, ssl } = config;
    const sslParam = ssl ? '?sslmode=require' : '';
    return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}${sslParam}`;
  }

  return null;
}

export function isConfigured(connectionId?: string): boolean {
  if (!connectionId) {
    return !!process.env.DATABASE_URL || !!getConfig();
  }
  return !!getConfig(connectionId);
}

export function getDefaultSchema(connectionId?: string): string {
  const config = getConfig(connectionId);
  return config?.schema || 'public';
}

export function getDefaultConnectionId(): string | null {
  const multiConfig = getMultiConfig();
  return multiConfig?.default || null;
}
