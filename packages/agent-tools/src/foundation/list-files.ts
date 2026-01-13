import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import fg from 'fast-glob';
import { resolvePath } from './path-utils.js';

const ListFilesInput = z.object({
  path: z.string().describe('Directory or glob pattern'),
  pattern: z.string().optional().describe('Glob pattern (default **/*)'),
  include_dirs: z.boolean().optional().describe('Include directories in results'),
  absolute: z.boolean().optional().describe('Return absolute paths'),
  max_results: z.number().int().positive().optional().describe('Limit number of results'),
});

type ListFilesInputType = z.infer<typeof ListFilesInput>;

export interface ListFilesResult {
  basePath: string;
  files: string[];
  truncated?: boolean;
}

export class ListFilesTool extends Tool<ListFilesInputType, ListFilesResult> {
  name = 'list_files';
  description = 'List files in a directory or matching a glob pattern';
  parameters = ListFilesInput;

  async execute(input: ListFilesInputType, context: ToolExecutionContext): Promise<ListFilesResult> {
    const pathHasGlob = isGlob(input.path);
    const basePath = pathHasGlob ? resolvePath('.', context) : resolvePath(input.path, context);
    const pattern = input.pattern || (pathHasGlob ? input.path : '**/*');
    const absolute = input.absolute ?? false;
    const maxResults = input.max_results ?? 200;

    const entries = await fg(pattern, {
      cwd: basePath,
      dot: true,
      onlyFiles: !input.include_dirs,
      unique: true,
      absolute,
    });

    if (entries.length <= maxResults) {
      return { basePath, files: entries };
    }

    return {
      basePath,
      files: entries.slice(0, maxResults),
      truncated: true,
    };
  }
}

function isGlob(value: string): boolean {
  return /[*?[\]{},]/.test(value);
}
