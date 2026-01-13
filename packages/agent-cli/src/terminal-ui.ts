import readline, { type Key } from 'node:readline';
import type { ReporterOutput } from './reporter.js';

interface ReadLineOptions {
  prompt?: string;
  echo?: boolean;
  echoPrefix?: string;
}

export interface TerminalUIOptions {
  prompt?: string;
  echoPrefix?: string;
  maxOutputLines?: number;
  useAltScreen?: boolean;
  showDivider?: boolean;
}

export class TerminalUI implements ReporterOutput {
  private outputLines: string[] = [];
  private statusLine: string | null = null;
  private inputBuffer = '';
  private inputEnabled = false;
  private prompt: string;
  private echoPrefix: string;
  private maxOutputLines: number;
  private useAltScreen: boolean;
  private showDivider: boolean;
  private scrollOffset = 0;
  private renderQueued = false;
  private needsFullRender = false;
  private lastRenderCols = 0;
  private lastRenderRows = 0;
  private lastAvailable = 0;
  private pending: {
    resolve: (value: string) => void;
    options: ReadLineOptions;
  } | null = null;
  private started = false;

  constructor(options: TerminalUIOptions = {}) {
    this.prompt = options.prompt ?? '> ';
    this.echoPrefix = options.echoPrefix ?? '> ';
    this.maxOutputLines = options.maxOutputLines ?? 2000;
    this.useAltScreen = options.useAltScreen ?? true;
    this.showDivider = options.showDivider ?? true;
  }

  start(): void {
    if (this.started || !process.stdin.isTTY || !process.stdout.isTTY) {
      return;
    }
    this.started = true;
    if (this.useAltScreen) {
      process.stdout.write('\x1b[?1049h');
    }
    process.stdout.write('\x1b[?25l');
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', this.handleKeypress);
    process.stdout.on('resize', this.handleResize);
    this.renderFull();
  }

  close(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    process.stdin.off('keypress', this.handleKeypress);
    process.stdout.off('resize', this.handleResize);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write('\x1b[?25h');
    if (this.useAltScreen) {
      process.stdout.write('\x1b[?1049l');
    }
  }

  writeLine(line: string): void {
    const lines = line.split(/\r?\n/);
    for (const entry of lines) {
      this.outputLines.push(entry);
    }
    if (this.outputLines.length > this.maxOutputLines) {
      this.outputLines = this.outputLines.slice(-this.maxOutputLines);
    }
    this.scheduleRender(true);
  }

  setStatus(message: string | null): void {
    this.statusLine = message;
    this.scheduleRender(true);
  }

  readLine(options: ReadLineOptions = {}): Promise<string> {
    if (!this.started) {
      return Promise.resolve('');
    }
    if (this.pending) {
      return Promise.reject(new Error('Input already pending'));
    }
    this.inputBuffer = '';
    this.inputEnabled = true;
    const prompt = options.prompt ?? this.prompt;
    this.pending = { resolve: () => {}, options: { ...options, prompt } };
    this.scheduleRender(true);
    return new Promise<string>(resolve => {
      if (this.pending) {
        this.pending.resolve = resolve;
      } else {
        resolve('');
      }
    });
  }

  async confirm(message: string): Promise<boolean> {
    this.writeLine(`? ${message} (y/N)`);
    const answer = await this.readLine({ echo: true, echoPrefix: this.echoPrefix });
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private handleKeypress = (_: string, key: Key): void => {
    if (key?.ctrl && key?.name === 'c') {
      this.close();
      process.exit(0);
    }

    if (!this.inputEnabled || !this.pending) {
      return;
    }

    if (key?.name === 'pageup') {
      this.scrollBy(this.lastAvailable || (process.stdout.rows || 24));
      return;
    }

    if (key?.name === 'pagedown') {
      this.scrollBy(-(this.lastAvailable || (process.stdout.rows || 24)));
      return;
    }

    if (key?.name === 'return' || key?.name === 'enter') {
      const input = this.inputBuffer;
      const pending = this.pending;
      if (!pending) {
        return;
      }
      const { options } = pending;
      const echo = options.echo ?? true;
      const echoPrefix = options.echoPrefix ?? this.echoPrefix;
      this.pending = null;
      this.inputEnabled = false;
      this.inputBuffer = '';
      if (echo) {
        this.writeLine(`${echoPrefix}${input}`);
      } else {
        this.scheduleRender(true);
      }
      pending.resolve(input);
      return;
    }

    if (key?.name === 'backspace') {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.scheduleRender(false);
      }
      return;
    }

    if (key?.name === 'escape') {
      this.inputBuffer = '';
      this.scheduleRender(false);
      return;
    }

    if (key?.sequence && !key?.ctrl && !key?.meta) {
      this.inputBuffer += key.sequence;
      this.scheduleRender(false);
    }
  };

  private handleResize = (): void => {
    this.scheduleRender(true);
  };

  private scheduleRender(full: boolean): void {
    if (!this.started) {
      return;
    }
    if (full) {
      this.needsFullRender = true;
    }
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    setImmediate(() => {
      this.renderQueued = false;
      if (!this.started) {
        return;
      }
      if (this.needsFullRender) {
        this.needsFullRender = false;
        this.renderFull();
      } else {
        this.renderInputLine();
      }
    });
  }

  private renderFull(): void {
    if (!this.started) {
      return;
    }

    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    const wrappedOutput = this.wrapLines(this.outputLines, cols);
    const statusLine = this.statusLine ? this.truncateAnsi(this.statusLine, cols) : null;
    const statusHeight = statusLine ? 1 : 0;
    const dividerHeight = this.showDivider ? 1 : 0;
    const inputHeight = 1;
    const available = Math.max(0, rows - statusHeight - dividerHeight - inputHeight);
    const maxScroll = Math.max(0, wrappedOutput.length - available);
    if (this.scrollOffset > maxScroll) {
      this.scrollOffset = maxScroll;
    }
    const start = Math.max(0, wrappedOutput.length - available - this.scrollOffset);
    const visibleOutput = wrappedOutput.slice(start, start + available);
    this.lastRenderCols = cols;
    this.lastRenderRows = rows;
    this.lastAvailable = available;

    process.stdout.write('\x1b[2J\x1b[H');
    for (const line of visibleOutput) {
      process.stdout.write(line + '\x1b[0m\n');
    }

    if (statusLine) {
      process.stdout.write(statusLine + '\x1b[0m\n');
    }

    if (this.showDivider) {
      process.stdout.write(this.dim('-'.repeat(cols)) + '\x1b[0m\n');
    }

    this.renderInputLine();
  }

  private renderInputLine(): void {
    if (!this.started) {
      return;
    }
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    if (cols !== this.lastRenderCols || rows !== this.lastRenderRows) {
      this.renderFull();
      return;
    }
    const prompt = this.pending?.options.prompt ?? this.prompt;
    const promptWidth = this.visibleLength(prompt);
    const maxInput = Math.max(0, cols - promptWidth);
    const displayInput =
      this.inputBuffer.length > maxInput
        ? this.inputBuffer.slice(this.inputBuffer.length - maxInput)
        : this.inputBuffer;
    const inputLine = this.inputEnabled ? `${prompt}${displayInput}` : this.dim(`${prompt}${displayInput}`);
    process.stdout.write(`\x1b[${rows};1H`);
    process.stdout.write('\x1b[2K');
    process.stdout.write(this.truncateAnsi(inputLine, cols) + '\x1b[0m');
  }

  private scrollBy(lines: number): void {
    const next = Math.max(0, this.scrollOffset + lines);
    if (next === this.scrollOffset) {
      return;
    }
    this.scrollOffset = next;
    this.scheduleRender(true);
  }

  private wrapLines(lines: string[], width: number): string[] {
    const result: string[] = [];
    for (const line of lines) {
      result.push(...this.wrapLine(line, width));
    }
    return result;
  }

  private wrapLine(line: string, width: number): string[] {
    if (width <= 0) {
      return [''];
    }
    const segments: string[] = [];
    let current = '';
    let visible = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '\x1b') {
        const match = /\x1b\[[0-9;]*m/.exec(line.slice(i));
        if (match) {
          current += match[0];
          i += match[0].length - 1;
          continue;
        }
      }
      current += char;
      visible += 1;
      if (visible >= width) {
        segments.push(current);
        current = '';
        visible = 0;
      }
    }
    if (current.length > 0 || segments.length === 0) {
      segments.push(current);
    }
    return segments;
  }

  private truncateAnsi(line: string, width: number): string {
    if (width <= 0) {
      return '';
    }
    let visible = 0;
    let result = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '\x1b') {
        const match = /\x1b\[[0-9;]*m/.exec(line.slice(i));
        if (match) {
          result += match[0];
          i += match[0].length - 1;
          continue;
        }
      }
      if (visible >= width) {
        break;
      }
      result += char;
      visible += 1;
    }
    return result;
  }

  private visibleLength(line: string): number {
    return line.replace(/\x1b\[[0-9;]*m/g, '').length;
  }

  private dim(line: string): string {
    return `\x1b[2m${line}\x1b[0m`;
  }
}
