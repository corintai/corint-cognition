import path from 'path';
import type { ToolExecutionContext } from '@corint/agent-core';

export function resolvePath(inputPath: string, context?: ToolExecutionContext): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  const base = context?.workingDir || process.cwd();
  return path.resolve(base, inputPath);
}
