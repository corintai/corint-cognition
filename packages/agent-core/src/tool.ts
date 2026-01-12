import { z } from 'zod';

export interface ToolExecutionContext {
  sessionId: string;
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export abstract class Tool<TInput = unknown, TOutput = unknown> {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodSchema<TInput>;

  abstract execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>;

  toOpenAITool(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  } {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  validate(input: unknown): TInput {
    return this.parameters.parse(input);
  }
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getOpenAITools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAll().map(tool => tool.toOpenAITool());
  }
}
