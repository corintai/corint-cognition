import type { LLMClient } from './llm-client.js';
import type { ToolRegistry } from './tool.js';
import type { Task, Plan, SessionContext } from './agent-types.js';
import type { LLMMessage, LLMResponse, LLMToolCall } from './types.js';

export interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  tokensUsed?: number;
  usage?: LLMResponse['usage'];
  toolCalls?: LLMToolCall[];
  toolResults?: Array<{ toolCallId: string; result: unknown; error?: string }>;
}

export class Executor {
  private llmClient: LLMClient;
  private toolRegistry: ToolRegistry;
  private maxRetries = 3;
  private maxToolIterations = 5;

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
    let madeProgress = true;

    while (madeProgress) {
      madeProgress = false;

      for (let i = 0; i < plan.tasks.length; i++) {
        const task = plan.tasks[i];

        if (task.status === 'completed' || task.status === 'failed') {
          continue;
        }

        if (!this.canExecuteTask(task, plan.tasks)) {
          task.status = 'blocked';
          continue;
        }

        plan.currentTaskIndex = i;
        const result = await this.executeTask(task, context);
        results.push(result);
        madeProgress = true;

        if (!result.success) {
          return results;
        }
      }
    }

    return results;
  }

  async executeWithTools(userMessage: string, context: SessionContext): Promise<ExecutionResult> {
    const tools = this.toolRegistry.getOpenAITools();
    const toolConfig = tools.length > 0 ? { tools } : {};

    let messages: LLMMessage[] = [
      { role: 'system' as const, content: this.getSystemPrompt() },
      ...context.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    let response = await this.llmClient.complete(messages, toolConfig);
    let mergedUsage = response.usage;
    const toolCalls: LLMToolCall[] = [];
    const toolResults: Array<{ toolCallId: string; result: unknown; error?: string }> = [];

    for (let iteration = 0; iteration < this.maxToolIterations; iteration++) {
      if (!response.tool_calls || response.tool_calls.length === 0) {
        break;
      }

      toolCalls.push(...response.tool_calls);
      const results = await this.executeToolCalls(response.tool_calls, context);
      toolResults.push(...results);

      const toolMessages = results.map(result => ({
        role: 'tool' as const,
        content: JSON.stringify(result.error ? { error: result.error } : result.result),
        tool_call_id: result.toolCallId,
      }));

      messages = [
        ...messages,
        {
          role: 'assistant' as const,
          content: response.content ?? '',
          tool_calls: response.tool_calls,
        },
        ...toolMessages,
      ];

      response = await this.llmClient.complete(messages, toolConfig);
      mergedUsage = this.mergeUsage(mergedUsage, response.usage);
    }

    return {
      success: true,
      output: response.content,
      tokensUsed: mergedUsage?.total_tokens ?? response.usage?.total_tokens,
      usage: mergedUsage ?? response.usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
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
${JSON.stringify(this.formatWorkingMemory(context.workingMemory), null, 2)}

Provide a detailed result.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: this.getSystemPrompt() },
      { role: 'user', content: prompt },
    ]);

    return {
      success: true,
      output: response.content,
      tokensUsed: response.usage?.total_tokens,
      usage: response.usage,
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
If a required data source is unknown, call list_data_sources and ask the user to choose or configure one.
Always provide clear, actionable results.`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatWorkingMemory(memory: Map<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(memory.entries());
  }

  private mergeUsage(
    first?: LLMResponse['usage'],
    second?: LLMResponse['usage'],
  ): LLMResponse['usage'] | undefined {
    if (!first && !second) {
      return undefined;
    }
    return {
      prompt_tokens: (first?.prompt_tokens || 0) + (second?.prompt_tokens || 0),
      completion_tokens: (first?.completion_tokens || 0) + (second?.completion_tokens || 0),
      total_tokens: (first?.total_tokens || 0) + (second?.total_tokens || 0),
    };
  }
}
