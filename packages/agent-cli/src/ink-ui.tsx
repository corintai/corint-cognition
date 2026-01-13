import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useInput, useStdout } from 'ink';
import { EventEmitter } from 'node:events';
import wrapAnsi from 'wrap-ansi';
import type { ReporterOutput } from './reporter.js';

interface ReadLineOptions {
  prompt?: string;
  echo?: boolean;
  echoPrefix?: string;
}

export interface InkUIOptions {
  prompt?: string;
  echoPrefix?: string;
  maxOutputLines?: number;
  showDivider?: boolean;
}

type InputRequest = Required<Pick<ReadLineOptions, 'prompt' | 'echo' | 'echoPrefix'>>;

export class InkUI implements ReporterOutput {
  private emitter = new EventEmitter();
  private pending: { resolve: (value: string) => void; options: InputRequest } | null = null;
  private unmount?: () => void;
  private prompt: string;
  private echoPrefix: string;
  private maxOutputLines: number;
  private showDivider: boolean;

  constructor(options: InkUIOptions = {}) {
    this.prompt = options.prompt ?? '> ';
    this.echoPrefix = options.echoPrefix ?? '> ';
    this.maxOutputLines = options.maxOutputLines ?? 2000;
    this.showDivider = options.showDivider ?? true;
  }

  start(): void {
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      return;
    }
    const { unmount } = render(
      <InkApp
        controller={this}
        maxOutputLines={this.maxOutputLines}
        showDivider={this.showDivider}
      />,
    );
    this.unmount = unmount;
  }

  close(): void {
    this.unmount?.();
    this.unmount = undefined;
  }

  writeLine(line: string): void {
    this.emitter.emit('line', line);
  }

  setStatus(message: string | null): void {
    this.emitter.emit('status', message);
  }

  readLine(options: ReadLineOptions = {}): Promise<string> {
    if (this.pending) {
      return Promise.reject(new Error('Input already pending'));
    }
    const request: InputRequest = {
      prompt: options.prompt ?? this.prompt,
      echo: options.echo ?? true,
      echoPrefix: options.echoPrefix ?? this.echoPrefix,
    };
    this.emitter.emit('input-request', request);
    return new Promise(resolve => {
      this.pending = { resolve, options: request };
    });
  }

  async confirm(message: string): Promise<boolean> {
    this.writeLine(`? ${message} (y/N)`);
    const answer = await this.readLine({ echo: true, echoPrefix: this.echoPrefix });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  on(event: 'line' | 'status' | 'input-request' | 'input-done', handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: 'line' | 'status' | 'input-request' | 'input-done', handler: (...args: any[]) => void): void {
    this.emitter.off(event, handler);
  }

  submitInput(value: string): void {
    if (!this.pending) {
      return;
    }
    const pending = this.pending;
    this.pending = null;
    if (pending.options.echo) {
      this.writeLine(`${pending.options.echoPrefix}${value}`);
    }
    pending.resolve(value);
    this.emitter.emit('input-done');
  }
}

interface InkAppProps {
  controller: InkUI;
  maxOutputLines: number;
  showDivider: boolean;
}

const InkApp: React.FC<InkAppProps> = ({ controller, maxOutputLines, showDivider }) => {
  const { stdout } = useStdout();
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('> ');
  const [input, setInput] = useState('');
  const [inputActive, setInputActive] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollOffsetRef = React.useRef(0);

  useEffect(() => {
    const onLine = (line: string) => {
      const parts = line.split(/\r?\n/);
      setLines(prev => {
        const next = [...prev, ...parts];
        return next.length > maxOutputLines ? next.slice(-maxOutputLines) : next;
      });
    };
    const onStatus = (message: string | null) => {
      setStatus(message);
    };
    const onRequest = (request: InputRequest) => {
      setPrompt(request.prompt);
      setInput('');
      setInputActive(true);
    };
    const onDone = () => {
      setInput('');
      setInputActive(false);
    };
    controller.on('line', onLine);
    controller.on('status', onStatus);
    controller.on('input-request', onRequest);
    controller.on('input-done', onDone);
    return () => {
      controller.off('line', onLine);
      controller.off('status', onStatus);
      controller.off('input-request', onRequest);
      controller.off('input-done', onDone);
    };
  }, [controller, maxOutputLines]);

  useInput((inputChar, key) => {
    if (key.ctrl && key.name === 'c') {
      controller.close();
      process.exit(0);
    }

    if (key.pageUp || key.name === 'pageup') {
      const next = scrollOffsetRef.current + getPageSize(stdout?.rows);
      scrollOffsetRef.current = next;
      setScrollOffset(next);
      return;
    }

    if (key.pageDown || key.name === 'pagedown') {
      const next = Math.max(0, scrollOffsetRef.current - getPageSize(stdout?.rows));
      scrollOffsetRef.current = next;
      setScrollOffset(next);
      return;
    }

    if (!inputActive) {
      return;
    }

    if (key.return || key.name === 'enter') {
      controller.submitInput(input);
      return;
    }

    if (key.backspace || key.delete || inputChar === '\b' || inputChar === '\x7f') {
      setInput(prev => (prev.length > 0 ? prev.slice(0, -1) : prev));
      return;
    }

    if (key.escape) {
      setInput('');
      return;
    }

    if (inputChar && !key.meta && !key.ctrl) {
      setInput(prev => prev + inputChar);
    }
  });

  const columns = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  const wrappedLines = useMemo(() => wrapOutput(lines, columns), [lines, columns]);
  const statusHeight = status ? 1 : 0;
  const dividerHeight = showDivider ? 1 : 0;
  const inputHeight = 1;
  const available = Math.max(0, rows - statusHeight - dividerHeight - inputHeight);
  const maxScroll = Math.max(0, wrappedLines.length - available);
  const appliedScroll = Math.min(scrollOffset, maxScroll);
  if (appliedScroll !== scrollOffsetRef.current) {
    scrollOffsetRef.current = appliedScroll;
  }
  const start = Math.max(0, wrappedLines.length - available - appliedScroll);
  const visible = wrappedLines.slice(start, start + available);

  const divider = showDivider ? '-'.repeat(columns) : '';

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, index) => (
          <Text key={`${index}-${line}`} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>
      {status ? (
        <Text color="gray" wrap="truncate">
          {status}
        </Text>
      ) : null}
      {showDivider ? (
        <Text color="gray" wrap="truncate">
          {divider}
        </Text>
      ) : null}
      <Text wrap="truncate">
        {inputActive ? prompt : dim(prompt)}
        {input}
      </Text>
    </Box>
  );
};

function wrapOutput(lines: string[], width: number): string[] {
  if (width <= 0) {
    return [''];
  }
  const wrapped: string[] = [];
  for (const line of lines) {
    const segments = wrapAnsi(line, width, { hard: true, trim: false }).split('\n');
    wrapped.push(...segments);
  }
  return wrapped;
}

function getPageSize(rows?: number): number {
  if (!rows || rows <= 0) {
    return 10;
  }
  return Math.max(3, rows - 4);
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}
