import type { LLMClient } from './llm-client.js';
import type { ToolRegistry } from './tool.js';
import { ContextManager } from './context-manager.js';
import { CostController } from './cost-controller.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { Evaluator } from './evaluator.js';
import type { AgentConfig, AgentResponse, SessionContext } from './agent-types.js';

export class Orchestrator {
  private llmClient: LLMClient;
  private contextManager: ContextManager;
  private costController: CostController;
  private planner: Planner;
  private executor: Executor;
  private evaluator: Evaluator;

  constructor(llmClient: LLMClient, toolRegistry: ToolRegistry, config: AgentConfig = {}) {
    this.llmClient = llmClient;

    this.contextManager = new ContextManager();
    this.costController = new CostController({
      maxTokens: config.maxTokens,
      maxQueries: config.maxQueries,
      timeout: config.timeout,
    });
    this.planner = new Planner(llmClient);
    this.executor = new Executor(llmClient, toolRegistry);
    this.evaluator = new Evaluator(llmClient);
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
      const intent = await this.classifyIntent(userMessage, context);

      if (intent === 'simple_query') {
        return await this.handleSimpleQuery(sessionId, userMessage, context);
      } else {
        return await this.handleComplexTask(sessionId, userMessage, context);
      }
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

    yield { type: 'status', content: 'Processing message...' };

    this.contextManager.addMessage(sessionId, 'user', userMessage);

    yield { type: 'status', content: 'Analyzing intent...' };

    const intent = await this.classifyIntent(userMessage, context);

    if (intent === 'simple_query') {
      yield { type: 'status', content: 'Executing query...' };
      const response = await this.handleSimpleQuery(sessionId, userMessage, context);
      yield { type: 'response', content: response.content };
    } else {
      yield { type: 'status', content: 'Creating plan...' };
      const response = await this.handleComplexTask(sessionId, userMessage, context);
      yield { type: 'response', content: response.content };
    }
  }

  getSession(sessionId: string): SessionContext | undefined {
    return this.contextManager.getSession(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.contextManager.deleteSession(sessionId);
    this.costController.clearMetrics(sessionId);
  }

  private async classifyIntent(
    message: string,
    context: SessionContext,
  ): Promise<'simple_query' | 'complex_task'> {
    const systemPrompt = `Classify the user's intent:
- simple_query: Direct question or data lookup
- complex_task: Requires planning and multiple steps

Reply with just: simple_query or complex_task`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ]);

    this.recordTokenUsage(context.sessionId, response.usage);

    const intent = response.content?.toLowerCase().trim();
    return intent?.includes('complex') ? 'complex_task' : 'simple_query';
  }

  private async handleSimpleQuery(
    sessionId: string,
    message: string,
    context: SessionContext,
  ): Promise<AgentResponse> {
    const result = await this.executor.executeWithTools(message, context);

    this.recordTokenUsage(sessionId, { total_tokens: result.tokensUsed || 0 });

    const response: AgentResponse = {
      content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
      confidence: 'high',
    };

    this.contextManager.addMessage(sessionId, 'assistant', response.content);

    return response;
  }

  private async handleComplexTask(
    sessionId: string,
    message: string,
    context: SessionContext,
  ): Promise<AgentResponse> {
    const planningResult = await this.planner.createPlan(message, context);
    context.currentPlan = planningResult.plan;

    const executionResults = await this.executor.executePlan(planningResult.plan, context);

    const errorAnalysis = await this.evaluator.detectErrors(executionResults);

    if (errorAnalysis.hasErrors) {
      const revisedPlanResult = await this.planner.revisePlan(
        planningResult.plan,
        errorAnalysis.recoverySuggestion || 'Retry failed tasks',
        'overwrite',
      );
      context.currentPlan = revisedPlanResult.plan;
    }

    const evaluation = await this.evaluator.evaluateResult(message, executionResults);

    const response = await this.evaluator.synthesizeResponse(
      message,
      executionResults,
      evaluation,
    );

    this.contextManager.addMessage(sessionId, 'assistant', response.content);

    return response;
  }

  private recordTokenUsage(
    sessionId: string,
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number },
  ): void {
    if (usage) {
      this.costController.recordQuery(
        sessionId,
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
      );
    }
  }
}