import fs from 'fs';
import path from 'path';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  schema: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'db-config.json');

export function getConfig(): DatabaseConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return null;
}

export function saveConfig(config: DatabaseConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function deleteConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

export function getConnectionString(): string | null {
  // First check environment variable
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Then check config file
  const config = getConfig();
  if (config) {
    const { host, port, database, username, password, ssl } = config;
    const sslParam = ssl ? '?sslmode=require' : '';
    return `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}${sslParam}`;
  }

  return null;
}

export function isConfigured(): boolean {
  return !!process.env.DATABASE_URL || !!getConfig();
}

export function getDefaultSchema(): string {
  const config = getConfig();
  return config?.schema || 'public';
}
