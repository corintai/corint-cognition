import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';
import { resolvePath } from './path-utils.js';

const WriteFileInput = z.object({
  path: z.string().describe('Path to the file'),
  format: z
    .enum(['auto', 'text', 'json', 'csv', 'xlsx', 'binary'])
    .optional()
    .describe('File format'),
  content: z.string().optional().describe('File content for text/json/binary'),
  data: z
    .array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .optional()
    .describe('Tabular data for csv/xlsx/json'),
  sheet: z.string().optional().describe('Excel sheet name'),
  encoding: z.enum(['utf8', 'base64']).optional().describe('Text encoding'),
  overwrite: z.boolean().optional().describe('Overwrite if the file exists'),
});

type WriteFileInputType = z.infer<typeof WriteFileInput>;

export interface WriteFileResult {
  path: string;
  format: string;
  bytesWritten: number;
}

export class WriteFileTool extends Tool<WriteFileInputType, WriteFileResult> {
  name = 'write_file';
  description = 'Write a file to disk (text, json, csv, or xlsx)';
  parameters = WriteFileInput;

  async execute(input: WriteFileInputType, context: ToolExecutionContext): Promise<WriteFileResult> {
    const filePath = resolvePath(input.path, context);
    const format = normalizeFormat(input.format, filePath);
    const encoding = input.encoding || 'utf8';
    const overwrite = input.overwrite !== false;

    if (!overwrite) {
      await assertNotExists(filePath);
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    switch (format) {
      case 'text':
        return this.writeText(filePath, input.content ?? '', encoding, 'text');
      case 'json':
        return this.writeText(
          filePath,
          input.content ?? JSON.stringify(input.data ?? [], null, 2),
          encoding,
          'json',
        );
      case 'csv':
        return this.writeText(filePath, this.writeCsv(input.data), encoding, 'csv');
      case 'xlsx':
        return this.writeXlsx(filePath, input.data, input.sheet);
      case 'binary':
        return this.writeBinary(filePath, input.content);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private async writeText(
    filePath: string,
    content: string,
    encoding: BufferEncoding,
    format: string,
  ): Promise<WriteFileResult> {
    await fs.writeFile(filePath, content, { encoding });
    return { path: filePath, format, bytesWritten: Buffer.byteLength(content) };
  }

  private writeCsv(data?: Array<Record<string, unknown>>): string {
    if (!data || data.length === 0) {
      return '';
    }
    const columns = Object.keys(data[0]);
    return stringifyCsv(data, { header: true, columns });
  }

  private async writeXlsx(
    filePath: string,
    data?: Array<Record<string, unknown>>,
    sheetName?: string,
  ): Promise<WriteFileResult> {
    if (!data) {
      throw new Error('xlsx format requires data');
    }
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName || 'Sheet1');
    XLSX.writeFile(workbook, filePath);
    const stats = await fs.stat(filePath);
    return { path: filePath, format: 'xlsx', bytesWritten: stats.size };
  }

  private async writeBinary(
    filePath: string,
    content?: string,
  ): Promise<WriteFileResult> {
    if (!content) {
      throw new Error('binary format requires content');
    }
    const buffer = Buffer.from(content, 'base64');
    await fs.writeFile(filePath, buffer);
    return { path: filePath, format: 'binary', bytesWritten: buffer.length };
  }
}

function normalizeFormat(format: WriteFileInputType['format'], filePath: string): string {
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

async function assertNotExists(filePath: string): Promise<void> {
  try {
    await fs.stat(filePath);
    throw new Error(`File already exists: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
