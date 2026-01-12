import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';

export type DataSourceType = 'postgres' | 'mysql' | 'clickhouse';

export interface DataSourceConfig {
  type: DataSourceType;
  url?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

export type DataSourceClient =
  | { type: 'postgres'; client: Pool; config: DataSourceConfig }
  | { type: 'mysql'; client: mysql.Pool; config: DataSourceConfig }
  | { type: 'clickhouse'; client: ClickHouseClient; config: DataSourceConfig };

const dataSourceCache = new Map<string, DataSourceClient>();

export function getDataSourceConfig(name: string): DataSourceConfig {
  const normalized = normalizeName(name);

  const fromEnvJson = parseDataSourcesEnv(name);
  if (fromEnvJson) {
    return fromEnvJson;
  }

  const fromPrefix = parseEnvPrefix(normalized);
  if (fromPrefix) {
    return fromPrefix;
  }

  throw new Error(
    `Data source ${name} not configured. Set CORINT_DATA_SOURCES or CORINT_DS_${normalized}_TYPE.`,
  );
}

export async function getDataSourceClient(name: string): Promise<DataSourceClient> {
  const cached = dataSourceCache.get(name);
  if (cached) {
    return cached;
  }

  const config = getDataSourceConfig(name);
  let client: DataSourceClient;

  switch (config.type) {
    case 'postgres':
      client = {
        type: 'postgres',
        config,
        client: new Pool(buildPostgresConfig(config)),
      };
      break;
    case 'mysql':
      client = {
        type: 'mysql',
        config,
        client: mysql.createPool(buildMySQLConfig(config)),
      };
      break;
    case 'clickhouse':
      client = {
        type: 'clickhouse',
        config,
        client: createClient(buildClickHouseConfig(config)),
      };
      break;
    default:
      throw new Error(`Unsupported data source type: ${config.type}`);
  }

  dataSourceCache.set(name, client);
  return client;
}

function parseDataSourcesEnv(name: string): DataSourceConfig | undefined {
  const raw = process.env.CORINT_DATA_SOURCES;
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const match = parsed.find(entry => entry && (entry as { name?: string }).name === name);
      return match ? normalizeConfig(match as Record<string, unknown>) : undefined;
    }
    if (parsed && typeof parsed === 'object') {
      const entry = (parsed as Record<string, unknown>)[name];
      return entry ? normalizeConfig(entry as Record<string, unknown>) : undefined;
    }
  } catch (error) {
    console.error('Failed to parse CORINT_DATA_SOURCES:', error);
  }

  return undefined;
}

function parseEnvPrefix(normalizedName: string): DataSourceConfig | undefined {
  const prefix = `CORINT_DS_${normalizedName}_`;
  const type = process.env[`${prefix}TYPE`] as DataSourceType | undefined;
  if (!type) {
    return undefined;
  }

  const config: DataSourceConfig = {
    type,
    url: process.env[`${prefix}URL`],
    host: process.env[`${prefix}HOST`],
    port: parseNumber(process.env[`${prefix}PORT`]),
    user: process.env[`${prefix}USER`],
    password: process.env[`${prefix}PASSWORD`],
    database: process.env[`${prefix}DATABASE`] || process.env[`${prefix}DB`],
    ssl: parseBoolean(process.env[`${prefix}SSL`]),
  };

  return config;
}

function normalizeConfig(input: Record<string, unknown>): DataSourceConfig {
  return {
    type: String(input.type) as DataSourceType,
    url: asString(input.url),
    host: asString(input.host),
    port: asNumber(input.port),
    user: asString(input.user),
    password: asString(input.password),
    database: asString(input.database),
    ssl: asBoolean(input.ssl),
  };
}

function buildPostgresConfig(config: DataSourceConfig): {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: { rejectUnauthorized: boolean } | undefined;
} {
  return {
    connectionString: config.url,
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

function buildMySQLConfig(config: DataSourceConfig): {
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: Record<string, unknown>;
  waitForConnections: boolean;
} {
  return {
    uri: config.url,
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? {} : undefined,
    waitForConnections: true,
  };
}

function buildClickHouseConfig(config: DataSourceConfig): {
  url?: string;
  username?: string;
  password?: string;
  database?: string;
} {
  const url =
    config.url ||
    (config.host
      ? `${config.ssl ? 'https' : 'http'}://${config.host}:${config.port || 8123}`
      : undefined);

  return {
    url,
    username: config.user,
    password: config.password,
    database: config.database,
  };
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
