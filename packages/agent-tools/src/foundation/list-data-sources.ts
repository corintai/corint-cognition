import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import { listDataSources } from './data-source.js';

const ListDataSourcesInput = z.object({}).describe('No input parameters');

type ListDataSourcesInputType = z.infer<typeof ListDataSourcesInput>;

export interface ListDataSourcesResult {
  sources: Array<{
    name: string;
    type: string;
  }>;
}

export class ListDataSourcesTool extends Tool<
  ListDataSourcesInputType,
  ListDataSourcesResult
> {
  name = 'list_data_sources';
  description = 'List configured data sources';
  parameters = ListDataSourcesInput;

  async execute(
    _input: ListDataSourcesInputType,
    _context: ToolExecutionContext,
  ): Promise<ListDataSourcesResult> {
    const sources = listDataSources().map(source => ({
      name: source.name,
      type: source.type,
    }));
    return { sources };
  }
}
