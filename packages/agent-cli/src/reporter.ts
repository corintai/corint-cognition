import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ReporterOptions {
  useSpinner?: boolean;
  output?: ReporterOutput;
}

export interface ReporterOutput {
  writeLine(line: string): void;
  setStatus(message: string | null): void;
  writeText?(text: string): void;
  flushStream?(): void;
}

export interface BannerInfo {
  mode: 'chat' | 'run';
  provider: string;
  model: string;
  temperature?: number;
  sessionId: string;
  ui?: 'tui' | 'plain';
}

export class CliReporter {
  private spinner: Ora | null = null;
  private currentStatus: string | null = null;
  private useSpinner: boolean;
  private output?: ReporterOutput;
  private streamBuffer = '';
  private isStreaming = false;

  constructor(options: ReporterOptions = {}) {
    this.output = options.output;
    this.useSpinner = this.output ? false : options.useSpinner ?? process.stdout.isTTY;
  }

  banner(info: BannerInfo): void {
    this.pauseStatus();
    this.writeLine(chalk.bold('CORINT Agent'));
    this.writeLine(
      chalk.gray(
        `mode=${info.mode} provider=${info.provider} model=${info.model}${
          info.temperature !== undefined ? ` temp=${info.temperature}` : ''
        }${info.ui ? ` ui=${info.ui}` : ''}`,
      ),
    );
    this.writeLine(chalk.gray(`session=${info.sessionId}`));
    this.writeLine('');
    this.resumeStatus();
  }

  status(message: string): void {
    this.currentStatus = message;
    if (this.output) {
      this.output.setStatus(chalk.gray(`status: ${message}`));
      return;
    }
    if (this.spinner) {
      this.spinner.text = message;
      return;
    }
    this.spinner = ora(message).start();
  }

  pauseStatus(): void {
    if (this.output) {
      return;
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  resumeStatus(): void {
    if (this.output || !this.useSpinner) {
      return;
    }
    if (!this.spinner && this.currentStatus) {
      this.spinner = ora(this.currentStatus).start();
    }
  }

  clearStatus(): void {
    if (this.output) {
      this.output.setStatus(null);
    }
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    this.currentStatus = null;
  }

  info(message: string): void {
    this.printTag('info', chalk.gray, message);
  }

  warn(message: string): void {
    this.printTag('warn', chalk.yellow, message);
  }

  error(message: string): void {
    this.printTag('error', chalk.red, message);
  }

  success(message: string): void {
    this.printTag('ok', chalk.green, message);
  }

  response(message: string): void {
    this.clearStatus();
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    this.writeLine(chalk.white(trimmed));
    this.writeLine('');
  }

  streamText(text: string): void {
    if (!this.isStreaming) {
      this.clearStatus();
      this.isStreaming = true;
    }
    this.streamBuffer += text;
    if (this.output?.writeText) {
      this.output.writeText(text);
    } else {
      process.stdout.write(chalk.white(text));
    }
  }

  flushStream(): void {
    if (this.isStreaming) {
      if (this.output?.flushStream) {
        this.output.flushStream();
      } else if (!this.output?.writeText) {
        process.stdout.write('\n\n');
      } else {
        this.output.writeLine('');
      }
      this.streamBuffer = '';
      this.isStreaming = false;
    }
  }

  toolCall(name: string, args: unknown): void {
    this.pauseStatus();
    this.writeLine(chalk.cyan(`tool: ${name}`));
    this.writeLine(chalk.gray(formatArgs(args)));
    this.resumeStatus();
  }

  toolResult(name: string, ok: boolean, summary?: string): void {
    this.pauseStatus();
    const status = ok ? chalk.green('ok') : chalk.red('error');
    this.writeLine(
      `${chalk.cyan(`tool: ${name}`)} ${status}${summary ? ` ${summary}` : ''}`,
    );
    this.resumeStatus();
  }

  private printTag(
    label: string,
    color: (text: string) => string,
    message: string,
  ): void {
    this.pauseStatus();
    this.writeLine(`${color(`[${label}]`)} ${message}`);
    this.resumeStatus();
  }

  line(message: string): void {
    this.pauseStatus();
    this.writeLine(message);
    this.resumeStatus();
  }

  blank(): void {
    this.line('');
  }

  private writeLine(message: string): void {
    if (this.output) {
      this.output.writeLine(message);
      return;
    }
    console.log(message);
  }
}

function formatArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args, null, 2);
    return json.length > 1200 ? `${json.slice(0, 1200)}...` : json;
  } catch {
    return String(args);
  }
}
