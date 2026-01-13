import type { LLMClient } from './llm-client.js';
import type { ToolRegistry } from './tool.js';
import { ContextManager } from './context-manager.js';
import { CostController } from './cost-controller.js';
import { Executor } from './executor.js';
import type { AgentConfig, AgentResponse, SessionContext } from './agent-types.js';

export class Orchestrator {
  private contextManager: ContextManager;
  private costController: CostController;
  private executor: Executor;

  constructor(llmClient: LLMClient, toolRegistry: ToolRegistry, config: AgentConfig = {}) {
    this.contextManager = new ContextManager();
    this.costController = new CostController({
      maxTokens: config.maxTokens,
      maxQueries: config.maxQueries,
      timeout: config.timeout,
    });
    this.executor = new Executor(llmClient, toolRegistry);
  }

  createSession(sessionId: string, userId?: string): SessionContext {
    const context = this.contextManager.createSession(sessionId, userId);
    this.costController.initSession(sessionId);
    return context;
  }

  async processMessage(sessionId: string, userMessage: string): Promise<AgentResponse> {
    const context = this.contextManager.getSession(sessionId);
    if (!context) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const costCheck = this.costController.checkLimits(sessionId);
    if (!costCheck.allowed) {
      return {
        content: `Request blocked: ${costCheck.reason}`,
        confidence: 'high',
        requiresUserInput: true,
      };
    }

    this.contextManager.addMessage(sessionId, 'user', userMessage);

    try {
      return await this.handleMessage(sessionId, userMessage, context);
    } catch (error) {
      return {
        content: `Error: ${(error as Error).message}`,
        confidence: 'low',
        requiresUserInput: true,
      };
    }
  }

  async *processMessageStream(
    sessionId: string,
    userMessage: string,
  ): AsyncGenerator<{ type: string; content: string }, void, unknown> {
    const context = this.contextManager.getSession(sessionId);
    if (!context) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const costCheck = this.costController.checkLimits(sessionId);
    if (!costCheck.allowed) {
      yield {
        type: 'response',
        content: `Request blocked: ${costCheck.reason}`,
      };
      return;
    }

    this.contextManager.addMessage(sessionId, 'user', userMessage);

    try {
      let fullContent = '';
      const stream = this.executor.executeWithToolsStream(userMessage, context);

      while (true) {
        const { value, done } = await stream.next();
        if (done) {
          const result = value;
          if (result) {
            this.recordTokenUsage(sessionId, result.usage);
            fullContent = typeof result.output === 'string' ? result.output : fullContent;
          }
          break;
        }

        if (value.type === 'text') {
          fullContent += value.content;
          yield { type: 'text', content: value.content };
        } else if (value.type === 'tool_start') {
          yield { type: 'status', content: `Calling ${value.toolName}...` };
        } else if (value.type === 'tool_end') {
          yield { type: 'status', content: `${value.toolName}: ${value.content}` };
        }
      }

      this.contextManager.addMessage(sessionId, 'assistant', fullContent);
      yield { type: 'done', content: '' };
    } catch (error) {
      yield {
        type: 'error',
        content: `Error: ${(error as Error).message}`,
      };
    }
  }

  getSession(sessionId: string): SessionContext | undefined {
    return this.contextManager.getSession(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.contextManager.deleteSession(sessionId);
    this.costController.clearMetrics(sessionId);
  }

  private async handleMessage(
    sessionId: string,
    message: string,
    context: SessionContext,
  ): Promise<AgentResponse> {
    const result = await this.executor.executeWithTools(message, context);

    this.recordTokenUsage(sessionId, result.usage);
    if (!result.usage && result.tokensUsed) {
      this.recordTokenUsage(sessionId, { total_tokens: result.tokensUsed });
    }

    const response: AgentResponse = {
      content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
      confidence: 'high',
      usage:
        result.usage ||
        (result.tokensUsed
          ? {
              prompt_tokens: 0,
              completion_tokens: result.tokensUsed,
              total_tokens: result.tokensUsed,
            }
          : undefined),
    };

    this.contextManager.addMessage(sessionId, 'assistant', response.content);

    return response;
  }

  private recordTokenUsage(
    sessionId: string,
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number },
  ): void {
    if (usage) {
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;
      const derivedCompletion =
        completionTokens || (totalTokens > 0 ? Math.max(totalTokens - promptTokens, 0) : 0);
      this.costController.recordQuery(sessionId, promptTokens, derivedCompletion);
    }
  }

}
