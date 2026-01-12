import type { LLMClient } from './llm-client.js';
import type { ToolRegistry } from './tool.js';
import type { Task, Plan, SessionContext } from './agent-types.js';

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  tokensUsed?: number;
}

export class Executor {
  private llmClient: LLMClient;
  private toolRegistry: ToolRegistry;
  private maxRetries = 3;

  constructor(llmClient: LLMClient, toolRegistry: ToolRegistry) {
    this.llmClient = llmClient;
    this.toolRegistry = toolRegistry;
  }

  async executeTask(task: Task, context: SessionContext): Promise<ExecutionResult> {
    task.status = 'running';

    try {
      const result = await this.executeWithRetry(task, context);
      task.status = 'completed';
      task.result = result.output;
      return result;
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async executePlan(plan: Plan, context: SessionContext): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (let i = plan.currentTaskIndex; i < plan.tasks.length; i++) {
      const task = plan.tasks[i];
      plan.currentTaskIndex = i;

      if (!this.canExecuteTask(task, plan.tasks)) {
        task.status = 'blocked';
        continue;
      }

      const result = await this.executeTask(task, context);
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return results;
  }

  async executeWithTools(userMessage: string, context: SessionContext): Promise<ExecutionResult> {
    const tools = this.toolRegistry.getOpenAITools();

    const messages = [
      { role: 'system' as const, content: this.getSystemPrompt() },
      ...context.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await this.llmClient.complete(messages, { tools });

    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolResults = await this.executeToolCalls(response.tool_calls, context);
      return {
        success: true,
        output: {
          content: response.content,
          toolCalls: response.tool_calls,
          toolResults,
        },
        tokensUsed: response.usage?.total_tokens,
      };
    }

    return {
      success: true,
      output: response.content,
      tokensUsed: response.usage?.total_tokens,
    };
  }

  private async executeWithRetry(task: Task, context: SessionContext): Promise<ExecutionResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        task.retryCount = attempt;
        return await this.executeSingleAttempt(task, context);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Execution failed after retries');
  }

  private async executeSingleAttempt(
    task: Task,
    context: SessionContext,
  ): Promise<ExecutionResult> {
    const prompt = `Execute the following task:
Task: ${task.description}

Context:
${JSON.stringify(context.workingMemory, null, 2)}

Provide a detailed result.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      output: response.content,
      tokensUsed: response.usage?.total_tokens,
    };
  }

  private async executeToolCalls(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    context: SessionContext,
  ): Promise<Array<{ toolCallId: string; result: unknown; error?: string }>> {
    const results = await Promise.all(
      toolCalls.map(async toolCall => {
        try {
          const tool = this.toolRegistry.get(toolCall.function.name);
          if (!tool) {
            throw new Error(`Tool ${toolCall.function.name} not found`);
          }

          const args = JSON.parse(toolCall.function.arguments) as unknown;
          const input = tool.validate(args);

          const result = await tool.execute(input, {
            sessionId: context.sessionId,
          });

          return {
            toolCallId: toolCall.id,
            result,
          };
        } catch (error) {
          return {
            toolCallId: toolCall.id,
            result: null,
            error: (error as Error).message,
          };
        }
      }),
    );

    return results;
  }

  private canExecuteTask(task: Task, allTasks: Task[]): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      const depTask = allTasks.find(t => t.id === depId);
      return depTask?.status === 'completed';
    });
  }

  private getSystemPrompt(): string {
    return `You are a risk management assistant specialized in analyzing data, generating strategies, and optimizing rules.
You have access to various tools to query databases, analyze metrics, and validate configurations.
Always provide clear, actionable results.`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
