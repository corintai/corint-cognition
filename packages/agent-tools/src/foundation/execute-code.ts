import { Tool, ToolExecutionContext } from '@corint/agent-core';
import { z } from 'zod';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { resolvePath } from './path-utils.js';

const ExecuteCodeInput = z.object({
  language: z.enum(['python']).optional().describe('Execution language'),
  code: z.string().describe('Source code to execute'),
  args: z.array(z.string()).optional().describe('Command line arguments'),
  input: z.string().optional().describe('Standard input'),
  timeout_ms: z.number().int().positive().optional().describe('Execution timeout in milliseconds'),
  working_dir: z.string().optional().describe('Working directory'),
});

type ExecuteCodeInputType = z.infer<typeof ExecuteCodeInput>;

export interface ExecuteCodeResult {
  exitCode: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timedOut?: boolean;
}

export class ExecuteCodeTool extends Tool<ExecuteCodeInputType, ExecuteCodeResult> {
  name = 'execute_code';
  description = 'Execute Python code in a local sandbox';
  parameters = ExecuteCodeInput;

  async execute(
    input: ExecuteCodeInputType,
    context: ToolExecutionContext,
  ): Promise<ExecuteCodeResult> {
    if (input.language && input.language !== 'python') {
      throw new Error(`Unsupported language: ${input.language}`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'corint-code-'));
    const filePath = path.join(tempDir, 'script.py');
    await fs.writeFile(filePath, input.code, { encoding: 'utf8' });

    const cwd = input.working_dir
      ? resolvePath(input.working_dir, context)
      : context.workingDir || tempDir;

    const args = [filePath, ...(input.args || [])];
    const timeoutMs = input.timeout_ms ?? 30000;

    const env = { ...process.env, ...context.env, PYTHONUNBUFFERED: '1' };

    try {
      return await runPython(args, cwd, input.input, timeoutMs, env);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function runPython(
  args: string[],
  cwd: string,
  input: string | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<ExecuteCodeResult> {
  const pythonBin = process.env.CORINT_PYTHON_BIN || 'python3';
  try {
    return await spawnProcess(pythonBin, args, cwd, input, timeoutMs, env);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && pythonBin !== 'python') {
      return spawnProcess('python', args, cwd, input, timeoutMs, env);
    }
    throw error;
  }
}

async function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  input: string | undefined,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<ExecuteCodeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const start = Date.now();

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
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
      });
    });

    if (input) {
      child.stdin?.write(input);
    }
    child.stdin?.end();
  });
}
