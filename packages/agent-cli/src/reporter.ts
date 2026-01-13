import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ReporterOptions {
  useSpinner?: boolean;
}

export interface BannerInfo {
  mode: 'chat' | 'run';
  provider: string;
  model: string;
  temperature?: number;
  sessionId: string;
}

export class CliReporter {
  private spinner: Ora | null = null;
  private currentStatus: string | null = null;
  private useSpinner: boolean;

  constructor(options: ReporterOptions = {}) {
    this.useSpinner = options.useSpinner ?? process.stdout.isTTY;
  }

  banner(info: BannerInfo): void {
    this.pauseStatus();
    console.log(chalk.bold('CORINT Agent'));
    console.log(
      chalk.gray(
        `mode=${info.mode} provider=${info.provider} model=${info.model}${
          info.temperature !== undefined ? ` temp=${info.temperature}` : ''
        }`,
      ),
    );
    console.log(chalk.gray(`session=${info.sessionId}`));
    console.log('');
    this.resumeStatus();
  }

  status(message: string): void {
    this.currentStatus = message;
    if (!this.useSpinner) {
      this.pauseStatus();
      console.log(chalk.gray(`[status] ${message}`));
      this.resumeStatus();
      return;
    }
    if (this.spinner) {
      this.spinner.text = message;
      return;
    }
    this.spinner = ora(message).start();
  }

  pauseStatus(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  resumeStatus(): void {
    if (!this.useSpinner) {
      return;
    }
    if (!this.spinner && this.currentStatus) {
      this.spinner = ora(this.currentStatus).start();
    }
  }

  clearStatus(): void {
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
    console.log(chalk.white(trimmed));
    console.log('');
  }

  toolCall(name: string, args: unknown): void {
    this.pauseStatus();
    console.log(chalk.cyan(`tool: ${name}`));
    console.log(chalk.gray(formatArgs(args)));
    this.resumeStatus();
  }

  toolResult(name: string, ok: boolean, summary?: string): void {
    this.pauseStatus();
    const status = ok ? chalk.green('ok') : chalk.red('error');
    console.log(`${chalk.cyan(`tool: ${name}`)} ${status}${summary ? ` ${summary}` : ''}`);
    this.resumeStatus();
  }

  private printTag(
    label: string,
    color: (text: string) => string,
    message: string,
  ): void {
    this.pauseStatus();
    console.log(`${color(`[${label}]`)} ${message}`);
    this.resumeStatus();
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
