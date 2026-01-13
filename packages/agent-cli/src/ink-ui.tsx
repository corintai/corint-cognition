import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Box, Text, render, useInput, useStdout } from 'ink';
import { EventEmitter } from 'node:events';
import wrapAnsi from 'wrap-ansi';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import type { ReporterOutput } from './reporter.js';

marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: false,
  }),
});

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
  private streamBuffer = '';
  private fullStreamContent = '';
  private streamThrottleTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Enable mouse support
    process.stdout.write('\x1b[?1000h'); // Enable mouse click
    process.stdout.write('\x1b[?1002h'); // Enable mouse drag
    process.stdout.write('\x1b[?1006h'); // Enable SGR extended mouse mode

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
    // Disable mouse support
    process.stdout.write('\x1b[?1006l');
    process.stdout.write('\x1b[?1002l');
    process.stdout.write('\x1b[?1000l');
    this.unmount?.();
    this.unmount = undefined;
  }

  writeLine(line: string): void {
    this.emitter.emit('line', line);
  }

  setStatus(message: string | null): void {
    this.emitter.emit('status', message);
  }

  writeText(text: string): void {
    this.fullStreamContent += text;
    this.streamBuffer += text;

    if (!this.streamThrottleTimer) {
      this.streamThrottleTimer = setTimeout(() => {
        this.streamThrottleTimer = null;
        if (this.streamBuffer) {
          const chunk = this.streamBuffer;
          this.streamBuffer = '';
          this.emitter.emit('stream', chunk);
        }
      }, 80);
    }
  }

  flushStream(): void {
    if (this.streamThrottleTimer) {
      clearTimeout(this.streamThrottleTimer);
      this.streamThrottleTimer = null;
    }
    this.streamBuffer = '';
    if (this.fullStreamContent) {
      const rendered = renderMarkdown(this.fullStreamContent);
      this.emitter.emit('stream-end', rendered);
      this.fullStreamContent = '';
    }
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

  on(event: 'line' | 'status' | 'input-request' | 'input-done' | 'stream' | 'stream-end' | 'mouse-scroll', handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: 'line' | 'status' | 'input-request' | 'input-done' | 'stream' | 'stream-end' | 'mouse-scroll', handler: (...args: any[]) => void): void {
    this.emitter.off(event, handler);
  }

  emitMouseScroll(direction: 'up' | 'down'): void {
    this.emitter.emit('mouse-scroll', direction);
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
  const scrollOffsetRef = useRef(0);
  const [streamingLines, setStreamingLines] = useState<string[]>([]);
  const streamingLinesRef = useRef<string[]>([]);
  const streamingRef = useRef(false);

  useEffect(() => {
    const onLine = (line: string) => {
      setLines(prev => {
        const parts = line.split(/\r?\n/);
        const next = [...prev, ...parts];
        return next.length > maxOutputLines ? next.slice(-maxOutputLines) : next;
      });
      scrollOffsetRef.current = 0;
      setScrollOffset(0);
    };
    const onStatus = (message: string | null) => {
      setStatus(message);
    };
    const onRequest = (request: InputRequest) => {
      // Flush streaming text before input
      const pendingStream = streamingLinesRef.current;
      if (pendingStream.length > 0) {
        setLines(prev => appendWithSpacing(prev, pendingStream, maxOutputLines));
        setStreamingLines([]);
        streamingLinesRef.current = [];
        streamingRef.current = false;
      }
      setPrompt(request.prompt);
      setInput('');
      setInputActive(true);
    };
    const onDone = () => {
      setInput('');
      setInputActive(false);
    };
    const onStream = (chunk: string) => {
      streamingRef.current = true;
      setStreamingLines(prev => {
        const next = appendStreamChunk(prev, chunk);
        streamingLinesRef.current = next;
        return next;
      });
      scrollOffsetRef.current = 0;
      setScrollOffset(0);
    };
    const onStreamEnd = (rendered: string) => {
      setLines(prev => appendWithSpacing(prev, rendered.split(/\r?\n/), maxOutputLines));
      setStreamingLines([]);
      streamingLinesRef.current = [];
      streamingRef.current = false;
      scrollOffsetRef.current = 0;
      setScrollOffset(0);
    };
    controller.on('line', onLine);
    controller.on('status', onStatus);
    controller.on('input-request', onRequest);
    controller.on('input-done', onDone);
    controller.on('stream', onStream);
    controller.on('stream-end', onStreamEnd);
    return () => {
      controller.off('line', onLine);
      controller.off('status', onStatus);
      controller.off('input-request', onRequest);
      controller.off('input-done', onDone);
      controller.off('stream', onStream);
      controller.off('stream-end', onStreamEnd);
    };
  }, [controller, maxOutputLines]);

  useInput((inputChar, key) => {
    if (key.ctrl && key.name === 'c') {
      controller.close();
      process.exit(0);
    }

    const mouseScroll = getMouseScrollDirection(inputChar);
    if (mouseScroll === 'up') {
      const next = scrollOffsetRef.current + 3;
      scrollOffsetRef.current = next;
      setScrollOffset(next);
      return;
    }
    if (mouseScroll === 'down') {
      const next = Math.max(0, scrollOffsetRef.current - 3);
      scrollOffsetRef.current = next;
      setScrollOffset(next);
      return;
    }
    if (inputChar && isControlSequence(inputChar)) {
      return;
    }

    // Page scroll
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

    // Arrow key scroll (single line) - only when not typing
    if (!inputActive && key.upArrow) {
      const next = scrollOffsetRef.current + 1;
      scrollOffsetRef.current = next;
      setScrollOffset(next);
      return;
    }

    if (!inputActive && key.downArrow) {
      const next = Math.max(0, scrollOffsetRef.current - 1);
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
  const allLines = useMemo(() => {
    if (streamingLines.length > 0) {
      return [...lines, ...streamingLines];
    }
    return lines;
  }, [lines, streamingLines]);
  const statusHeight = status ? 1 : 0;
  const dividerHeight = showDivider ? 1 : 0;
  const inputHeight = 1;
  const available = Math.max(0, rows - statusHeight - dividerHeight - inputHeight);
  const rawWrapped = useMemo(() => wrapOutput(allLines, columns), [allLines, columns]);
  const rawMaxScroll = Math.max(0, rawWrapped.length - available);
  const showScrollbar = rawMaxScroll > 0 && columns > 2;
  const contentWidth = Math.max(1, showScrollbar ? columns - 1 : columns);
  const wrappedLines = useMemo(
    () => (showScrollbar ? wrapOutput(allLines, contentWidth) : rawWrapped),
    [allLines, contentWidth, rawWrapped, showScrollbar],
  );
  const maxScroll = Math.max(0, wrappedLines.length - available);
  const appliedScroll = Math.min(scrollOffset, maxScroll);
  if (appliedScroll !== scrollOffsetRef.current) {
    scrollOffsetRef.current = appliedScroll;
  }
  const start = Math.max(0, wrappedLines.length - available - appliedScroll);
  const visible = padLines(wrappedLines.slice(start, start + available), available);
  const scrollbar = showScrollbar ? buildScrollbar(available, wrappedLines.length, appliedScroll) : [];

  const divider = showDivider ? '-'.repeat(columns) : '';

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, index) => (
          <Box key={`${index}-${line}`} flexDirection="row">
            <Text wrap="truncate">{padAnsi(line, contentWidth)}</Text>
            {showScrollbar ? (
              <Text color="gray">{scrollbar[index]}</Text>
            ) : null}
          </Box>
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

function appendWithSpacing(lines: string[], parts: string[], maxOutputLines: number): string[] {
  if (parts.length === 0) {
    return lines;
  }
  const next = [...lines];
  if (next.length > 0 && next[next.length - 1] !== '') {
    next.push('');
  }
  next.push(...parts);
  return next.length > maxOutputLines ? next.slice(-maxOutputLines) : next;
}

function appendStreamChunk(lines: string[], chunk: string): string[] {
  if (!chunk) {
    return lines;
  }
  const parts = chunk.split(/\r?\n/);
  if (parts.length === 0) {
    return lines;
  }
  const next = lines.length === 0 ? [''] : [...lines];
  next[next.length - 1] += parts[0] ?? '';
  for (let i = 1; i < parts.length; i += 1) {
    next.push(parts[i]);
  }
  return next;
}

function padLines(lines: string[], size: number): string[] {
  if (lines.length >= size) {
    return lines;
  }
  return [...lines, ...Array.from({ length: size - lines.length }, () => '')];
}

function padAnsi(line: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  const visible = visibleLength(line);
  if (visible >= width) {
    return line;
  }
  return line + ' '.repeat(width - visible);
}

function visibleLength(line: string): number {
  return line.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function getMouseScrollDirection(inputChar?: string): 'up' | 'down' | null {
  if (!inputChar) {
    return null;
  }
  if (inputChar.includes('\x1b[<64;') || inputChar.includes('[<64;')) {
    return 'up';
  }
  if (inputChar.includes('\x1b[<65;') || inputChar.includes('[<65;')) {
    return 'down';
  }
  return null;
}

function isControlSequence(inputChar: string): boolean {
  if (inputChar.includes('\x1b[')) {
    return true;
  }
  return inputChar.startsWith('[<') && /\[<\d+;/.test(inputChar);
}

function buildScrollbar(available: number, total: number, scrollOffset: number): string[] {
  if (available <= 0 || total <= available) {
    return [];
  }
  const maxScroll = Math.max(0, total - available);
  const thumbSize = Math.max(1, Math.round((available * available) / total));
  const maxThumbStart = Math.max(0, available - thumbSize);
  const progress = maxScroll > 0 ? scrollOffset / maxScroll : 0;
  const thumbStart = Math.round(maxThumbStart - progress * maxThumbStart);
  const result: string[] = [];
  for (let i = 0; i < available; i += 1) {
    result.push(i >= thumbStart && i < thumbStart + thumbSize ? '#' : '|');
  }
  return result;
}

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

function renderMarkdown(text: string): string {
  try {
    return (marked.parse(text, { async: false }) as string).trimEnd();
  } catch {
    return text;
  }
}
