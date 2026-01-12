import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import { getDataSourceClient, type DataSourceClient } from './data-source.js';

const QuerySQLInput = z.object({
  sql: z.string().describe('SQL query to execute'),
  data_source: z.string().describe('Data source identifier (e.g., "postgres_main")'),
  params: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe('Positional parameters for the SQL query'),
  timeout_ms: z.number().int().positive().optional().describe('Query timeout in milliseconds'),
  max_rows: z.number().int().positive().optional().describe('Maximum number of rows to return'),
});

type QuerySQLInputType = z.infer<typeof QuerySQLInput>;

export interface QuerySQLResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated?: boolean;
}

export class QuerySQLTool extends Tool<QuerySQLInputType, QuerySQLResult> {
  name = 'query_sql';
  description = 'Execute SQL query against a configured data source';
  parameters = QuerySQLInput;

  async execute(input: QuerySQLInputType, context: ToolExecutionContext): Promise<QuerySQLResult> {
    void context;
    const client: DataSourceClient = await getDataSourceClient(input.data_source);

    switch (client.type) {
      case 'postgres':
        return this.queryPostgres(client.client, input);
      case 'mysql':
        return this.queryMySQL(client.client, input);
      case 'clickhouse':
        return this.queryClickHouse(client.client, input);
      default:
        throw new Error('Unsupported data source type');
    }
  }

  private async queryPostgres(
    pool: import('pg').Pool,
    input: QuerySQLInputType,
  ): Promise<QuerySQLResult> {
    const query = pool.query({
      text: input.sql,
      values: input.params,
    });
    const result = input.timeout_ms ? await withTimeout(query, input.timeout_ms) : await query;

    return this.buildResult(result.rows, result.rowCount ?? result.rows.length, input.max_rows);
  }

  private async queryMySQL(
    pool: import('mysql2/promise').Pool,
    input: QuerySQLInputType,
  ): Promise<QuerySQLResult> {
    const [rows] = await pool.query({
      sql: input.sql,
      values: input.params,
      timeout: input.timeout_ms,
    });

    if (Array.isArray(rows)) {
      return this.buildResult(rows as Record<string, unknown>[], rows.length, input.max_rows);
    }

    const affectedRows =
      typeof rows === 'object' && rows && 'affectedRows' in rows
        ? Number((rows as { affectedRows?: number }).affectedRows || 0)
        : 0;

    return this.buildResult([], affectedRows, input.max_rows);
  }

  private async queryClickHouse(
    client: import('@clickhouse/client').ClickHouseClient,
    input: QuerySQLInputType,
  ): Promise<QuerySQLResult> {
    if (input.params && input.params.length > 0) {
      throw new Error('ClickHouse parameters are not supported for query_sql');
    }

    const querySettings =
      input.timeout_ms && input.timeout_ms > 0
        ? { max_execution_time: Math.ceil(input.timeout_ms / 1000) }
        : undefined;

    const resultSet = await client.query({
      query: input.sql,
      format: 'JSONEachRow',
      clickhouse_settings: querySettings,
    });

    const rows = await resultSet.json<Record<string, unknown>>();
    return this.buildResult(rows, rows.length, input.max_rows);
  }

  private buildResult(
    rows: Record<string, unknown>[],
    rowCount: number,
    maxRows?: number,
  ): QuerySQLResult {
    if (!maxRows || rows.length <= maxRows) {
      return { rows, rowCount };
    }

    return {
      rows: rows.slice(0, maxRows),
      rowCount,
      truncated: true,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Query timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => resolve(result))
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}
