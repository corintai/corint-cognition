import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';

const QuerySQLInput = z.object({
  sql: z.string().describe('SQL query to execute'),
  data_source: z.string().describe('Data source identifier (e.g., "postgres_main")'),
});

type QuerySQLInputType = z.infer<typeof QuerySQLInput>;

export class QuerySQLTool extends Tool<QuerySQLInputType, Record<string, unknown>[]> {
  name = 'query_sql';
  description = 'Execute SQL query against a configured data source';
  parameters = QuerySQLInput;

  async execute(
    _input: QuerySQLInputType,
    _context: ToolExecutionContext,
  ): Promise<Record<string, unknown>[]> {
    throw new Error(`Tool ${this.name} not implemented yet`);
  }
}