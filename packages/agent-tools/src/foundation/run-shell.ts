import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import { spawn } from 'child_process';
import { resolvePath } from './path-utils.js';

const RunShellInput = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  env: z.record(z.string()).optional().describe('Additional environment variables'),
  input: z.string().optional().describe('Standard input'),
  shell: z.boolean().optional().describe('Run command inside a shell'),
  timeout_ms: z.number().int().positive().optional().describe('Execution timeout in milliseconds'),
  max_output_bytes: z.number().int().positive().optional().describe('Maximum output size in bytes'),
});

type RunShellInputType = z.infer<typeof RunShellInput>;

export interface RunShellResult {
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timedOut?: boolean;
  truncated?: boolean;
}

export class RunShellTool extends Tool<RunShellInputType, RunShellResult> {
  name = 'run_shell';
  description = 'Execute a shell command in the local environment';
  parameters = RunShellInput;

  async execute(input: RunShellInputType, context: ToolExecutionContext): Promise<RunShellResult> {
    const cwd = input.cwd ? resolvePath(input.cwd, context) : context.workingDir || process.cwd();
    const timeoutMs = input.timeout_ms ?? 30000;
    const maxOutputBytes = input.max_output_bytes ?? 1024 * 1024;
    const start = Date.now();

    const env = { ...process.env, ...context.env, ...input.env };

    return new Promise((resolve, reject) => {
      const child = spawn(input.command, input.args || [], {
        cwd,
        env,
        shell: input.shell ?? false,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';
      let stdoutSize = 0;
      let stderrSize = 0;
      let timedOut = false;
      let truncated = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout?.on('data', chunk => {
        if (stdoutSize < maxOutputBytes) {
          const data = chunk.toString();
          stdoutSize += Buffer.byteLength(data);
          stdout += data;
        } else if (!truncated) {
          truncated = true;
          child.kill('SIGKILL');
        }
      });

      child.stderr?.on('data', chunk => {
        if (stderrSize < maxOutputBytes) {
          const data = chunk.toString();
          stderrSize += Buffer.byteLength(data);
          stderr += data;
        } else if (!truncated) {
          truncated = true;
          child.kill('SIGKILL');
        }
      });

      child.on('error', error => {
        clearTimeout(timeoutId);
        reject(error);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        resolve({
          exitCode: code,
          signal: signal || undefined,
          stdout,
          stderr,
          duration_ms: Date.now() - start,
          timedOut: timedOut || undefined,
          truncated: truncated || undefined,
        });
      });

      if (input.input) {
        child.stdin?.write(input.input);
      }
      child.stdin?.end();
    });
  }
}
