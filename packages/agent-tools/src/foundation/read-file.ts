import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { resolvePath } from './path-utils.js';

const ReadFileInput = z.object({
  path: z.string().describe('Path to the file'),
  format: z
    .enum(['auto', 'text', 'json', 'csv', 'xlsx', 'binary'])
    .optional()
    .describe('File format'),
  encoding: z.enum(['utf8', 'base64']).optional().describe('Text encoding'),
  sheet: z.string().optional().describe('Excel sheet name'),
  max_rows: z.number().int().positive().optional().describe('Maximum rows to return'),
});

type ReadFileInputType = z.infer<typeof ReadFileInput>;

export interface ReadFileResult {
  path: string;
  format: string;
  content?: string;
  data?: unknown;
  rows?: Array<Record<string, unknown>>;
  sheet?: string;
  sheets?: string[];
  truncated?: boolean;
}

export class ReadFileTool extends Tool<ReadFileInputType, ReadFileResult> {
  name = 'read_file';
  description = 'Read a file from disk (text, json, csv, or xlsx)';
  parameters = ReadFileInput;

  async execute(input: ReadFileInputType, context: ToolExecutionContext): Promise<ReadFileResult> {
    const filePath = resolvePath(input.path, context);
    const format = normalizeFormat(input.format, filePath);
    const encoding = input.encoding || 'utf8';

    switch (format) {
      case 'text': {
        const content = await fs.readFile(filePath, { encoding });
        return { path: filePath, format, content };
      }
      case 'json': {
        const content = await fs.readFile(filePath, { encoding: 'utf8' });
        const data = JSON.parse(content);
        return { path: filePath, format, data };
      }
      case 'csv': {
        const content = await fs.readFile(filePath, { encoding: 'utf8' });
        const rows = parseCsv(content, {
          columns: true,
          skip_empty_lines: true,
        }) as Array<Record<string, unknown>>;
        return buildRowsResult(filePath, format, rows, input.max_rows);
      }
      case 'xlsx': {
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const sheets = workbook.SheetNames;
        const sheetName = input.sheet || sheets[0];
        if (!sheetName) {
          throw new Error('Excel file has no sheets');
        }
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error(`Sheet not found: ${sheetName}`);
        }
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null }) as Array<
          Record<string, unknown>
        >;
        const result = buildRowsResult(filePath, format, rows, input.max_rows);
        return { ...result, sheet: sheetName, sheets };
      }
      case 'binary': {
        const content = await fs.readFile(filePath, { encoding: 'base64' });
        return { path: filePath, format, content };
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}

function normalizeFormat(format: ReadFileInputType['format'], filePath: string): string {
  if (format && format !== 'auto') {
    return format;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return 'json';
  }
  if (ext === '.csv') {
    return 'csv';
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return 'xlsx';
  }
  return 'text';
}

function buildRowsResult(
  filePath: string,
  format: string,
  rows: Array<Record<string, unknown>>,
  maxRows?: number,
): ReadFileResult {
  if (!maxRows || rows.length <= maxRows) {
    return { path: filePath, format, rows };
  }

  return {
    path: filePath,
    format,
    rows: rows.slice(0, maxRows),
    truncated: true,
  };
}
