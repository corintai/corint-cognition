import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import { getDataSourceClient, type DataSourceClient } from './data-source.js';

const ExploreSchemaInput = z.object({
  data_source: z.string().describe('Data source identifier'),
  schema: z.string().optional().describe('Schema/database name'),
  table: z.string().optional().describe('Limit to a specific table'),
  include_columns: z.boolean().optional().describe('Include column metadata'),
});

type ExploreSchemaInputType = z.infer<typeof ExploreSchemaInput>;

export interface ExploreSchemaResult {
  tables: Array<{
    schema?: string;
    name: string;
    columns?: Array<{
      name: string;
      type: string;
      nullable?: boolean;
    }>;
  }>;
}

export class ExploreSchemaTool extends Tool<ExploreSchemaInputType, ExploreSchemaResult> {
  name = 'explore_schema';
  description = 'List tables and columns for a configured data source';
  parameters = ExploreSchemaInput;

  async execute(
    input: ExploreSchemaInputType,
    context: ToolExecutionContext,
  ): Promise<ExploreSchemaResult> {
    void context;
    const client: DataSourceClient = await getDataSourceClient(input.data_source);

    switch (client.type) {
      case 'postgres':
        return this.explorePostgres(client.client, input);
      case 'mysql':
        return this.exploreMySQL(client.client, input);
      case 'clickhouse':
        return this.exploreClickHouse(client.client, input);
      default:
        throw new Error('Unsupported data source type');
    }
  }

  private async explorePostgres(
    pool: import('pg').Pool,
    input: ExploreSchemaInputType,
  ): Promise<ExploreSchemaResult> {
    const schemaFilter = input.schema;
    const tableFilter = input.table;

    const tablesQuery = `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ${schemaFilter ? 'AND table_schema = $1' : ''}
        ${tableFilter ? `AND table_name = $${schemaFilter ? 2 : 1}` : ''}
      ORDER BY table_schema, table_name
    `;

    const values = [schemaFilter, tableFilter].filter(
      value => typeof value === 'string',
    ) as string[];

    const tablesResult = await pool.query(tablesQuery, values);
    const tables = tablesResult.rows.map(row => ({
      schema: row.table_schema as string,
      name: row.table_name as string,
    }));

    if (!input.include_columns) {
      return { tables };
    }

    const columnsQuery = `
      SELECT table_schema, table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ${schemaFilter ? 'AND table_schema = $1' : ''}
        ${tableFilter ? `AND table_name = $${schemaFilter ? 2 : 1}` : ''}
      ORDER BY table_schema, table_name, ordinal_position
    `;

    const columnsResult = await pool.query(columnsQuery, values);
    const columnMap = new Map<string, ExploreSchemaResult['tables'][0]['columns']>();

    for (const row of columnsResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const columns = columnMap.get(key) || [];
      columns.push({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES',
      });
      columnMap.set(key, columns);
    }

    return {
      tables: tables.map(table => ({
        ...table,
        columns: columnMap.get(`${table.schema}.${table.name}`) || [],
      })),
    };
  }

  private async exploreMySQL(
    pool: import('mysql2/promise').Pool,
    input: ExploreSchemaInputType,
  ): Promise<ExploreSchemaResult> {
    const schemaFilter = input.schema;
    const tableFilter = input.table;

    const tablesQuery = `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        ${schemaFilter ? 'AND table_schema = ?' : ''}
        ${tableFilter ? 'AND table_name = ?' : ''}
      ORDER BY table_schema, table_name
    `;

    const values = [schemaFilter, tableFilter].filter(
      value => typeof value === 'string',
    ) as string[];

    const [rows] = await pool.query(tablesQuery, values);
    const tables = Array.isArray(rows)
      ? (rows as Array<{ table_schema: string; table_name: string }>).map(row => ({
          schema: row.table_schema,
          name: row.table_name,
        }))
      : [];

    if (!input.include_columns) {
      return { tables };
    }

    const columnsQuery = `
      SELECT table_schema, table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      ${schemaFilter ? 'WHERE table_schema = ?' : ''}
      ${tableFilter ? (schemaFilter ? 'AND' : 'WHERE') + ' table_name = ?' : ''}
      ORDER BY table_schema, table_name, ordinal_position
    `;

    const [columnRows] = await pool.query(columnsQuery, values);
    const columnMap = new Map<string, ExploreSchemaResult['tables'][0]['columns']>();

    if (Array.isArray(columnRows)) {
      for (const row of columnRows as Array<{
        table_schema: string;
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>) {
        const key = `${row.table_schema}.${row.table_name}`;
        const columns = columnMap.get(key) || [];
        columns.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
        });
        columnMap.set(key, columns);
      }
    }

    return {
      tables: tables.map(table => ({
        ...table,
        columns: columnMap.get(`${table.schema}.${table.name}`) || [],
      })),
    };
  }

  private async exploreClickHouse(
    client: import('@clickhouse/client').ClickHouseClient,
    input: ExploreSchemaInputType,
  ): Promise<ExploreSchemaResult> {
    const schemaFilter = input.schema;
    const tableFilter = input.table;

    const tablesQuery = `
      SELECT database AS table_schema, name AS table_name
      FROM system.tables
      WHERE database NOT IN ('system', 'information_schema')
        ${schemaFilter ? 'AND database = {schema:String}' : ''}
        ${tableFilter ? 'AND name = {table:String}' : ''}
      ORDER BY database, name
    `;

    const queryParams: Record<string, string> = {};
    if (schemaFilter) {
      queryParams.schema = schemaFilter;
    }
    if (tableFilter) {
      queryParams.table = tableFilter;
    }

    const tablesResult = await client.query({
      query: tablesQuery,
      format: 'JSONEachRow',
      query_params: queryParams,
    });

    const tablesRows = await tablesResult.json<{ table_schema: string; table_name: string }>();
    const tables = tablesRows.map(row => ({
      schema: row.table_schema,
      name: row.table_name,
    }));

    if (!input.include_columns) {
      return { tables };
    }

    const columnsQuery = `
      SELECT database AS table_schema, table AS table_name, name AS column_name, type
      FROM system.columns
      WHERE database NOT IN ('system', 'information_schema')
        ${schemaFilter ? 'AND database = {schema:String}' : ''}
        ${tableFilter ? 'AND table = {table:String}' : ''}
      ORDER BY database, table, position
    `;

    const columnsResult = await client.query({
      query: columnsQuery,
      format: 'JSONEachRow',
      query_params: queryParams,
    });

    const columnRows = await columnsResult.json<{
      table_schema: string;
      table_name: string;
      column_name: string;
      type: string;
    }>();

    const columnMap = new Map<string, ExploreSchemaResult['tables'][0]['columns']>();
    for (const row of columnRows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const columns = columnMap.get(key) || [];
      columns.push({
        name: row.column_name,
        type: row.type,
        nullable: row.type.startsWith('Nullable('),
      });
      columnMap.set(key, columns);
    }

    return {
      tables: tables.map(table => ({
        ...table,
        columns: columnMap.get(`${table.schema}.${table.name}`) || [],
      })),
    };
  }
}
