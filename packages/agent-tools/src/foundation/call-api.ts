import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';

const CallApiInput = z.object({
  url: z.string().describe('Request URL'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .optional()
    .describe('HTTP method'),
  headers: z.record(z.string()).optional().describe('HTTP headers'),
  query: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
    .describe('Query string parameters'),
  body: z
    .union([
      z.string(),
      z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ])
    .optional()
    .describe('Request body'),
  timeout_ms: z.number().int().positive().optional().describe('Request timeout in milliseconds'),
  response_type: z
    .enum(['auto', 'json', 'text', 'array_buffer'])
    .optional()
    .describe('Response parsing mode'),
});

type CallApiInputType = z.infer<typeof CallApiInput>;

export interface CallApiResult {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  body_base64?: string;
}

export class CallApiTool extends Tool<CallApiInputType, CallApiResult> {
  name = 'call_api';
  description = 'Call a REST API endpoint with optional headers and body';
  parameters = CallApiInput;

  async execute(input: CallApiInputType, context: ToolExecutionContext): Promise<CallApiResult> {
    void context;
    const url = new URL(input.url);

    if (input.query) {
      for (const [key, value] of Object.entries(input.query)) {
        if (value === null || value === undefined) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(input.headers || {});
    let body: string | undefined;

    if (typeof input.body === 'string') {
      body = input.body;
    } else if (input.body && typeof input.body === 'object') {
      body = JSON.stringify(input.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    const controller = new AbortController();
    const timeout = input.timeout_ms ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method: input.method || 'GET',
        headers,
        body,
        signal: controller.signal,
      });

      const responseHeaders = Object.fromEntries(response.headers.entries());
      const responseType = input.response_type || 'auto';

      if (responseType === 'array_buffer') {
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: responseHeaders,
          body_base64: buffer.toString('base64'),
        };
      }

      if (responseType === 'json' || shouldParseJson(response, responseType)) {
        const data = await response.json().catch(() => response.text());
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: responseHeaders,
          body: data,
        };
      }

      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        headers: responseHeaders,
        body: text,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function shouldParseJson(response: Response, responseType: 'auto' | 'json' | 'text'): boolean {
  if (responseType === 'json') {
    return true;
  }
  if (responseType === 'text') {
    return false;
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json');
}
