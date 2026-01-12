import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class CliReporter {
  private spinner: Ora | null = null;
  private currentStatus: string | null = null;

  status(message: string): void {
    this.currentStatus = message;
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
    this.pauseStatus();
    console.log(chalk.gray(message));
    this.resumeStatus();
  }

  warn(message: string): void {
    this.pauseStatus();
    console.log(chalk.yellow(message));
    this.resumeStatus();
  }

  error(message: string): void {
    this.pauseStatus();
    console.log(chalk.red(message));
    this.resumeStatus();
  }

  success(message: string): void {
    this.pauseStatus();
    console.log(chalk.green(message));
    this.resumeStatus();
  }

  response(message: string): void {
    this.clearStatus();
    console.log(chalk.white(message));
  }

  toolCall(name: string, args: unknown): void {
    this.pauseStatus();
    console.log(chalk.cyan(`[tool] ${name}`));
    console.log(chalk.gray(formatArgs(args)));
    this.resumeStatus();
  }

  toolResult(name: string, ok: boolean, summary?: string): void {
    this.pauseStatus();
    const status = ok ? chalk.green('ok') : chalk.red('error');
    console.log(`${chalk.cyan(`[tool] ${name}`)} ${status}${summary ? ` ${summary}` : ''}`);
    this.resumeStatus();
  }
}

function formatArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args, null, 2);
    return json.length > 1000 ? `${json.slice(0, 1000)}...` : json;
  } catch {
    return String(args);
  }
}
