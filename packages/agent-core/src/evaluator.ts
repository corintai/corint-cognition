import type { LLMClient } from './llm-client.js';
import type { ExecutionResult } from './executor.js';
import type { AgentResponse } from './agent-types.js';

export interface EvaluationResult {
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  isValid: boolean;
  needsRevision: boolean;
  suggestions?: string[];
  requiresUserInput?: boolean;
}

export class Evaluator {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async evaluateResult(
    goal: string,
    executionResults: ExecutionResult[],
  ): Promise<EvaluationResult> {
    const systemPrompt = `You are an evaluation assistant for a risk management agent.
Evaluate whether the execution results successfully achieve the user's goal.

Output format:
{
  "confidence": "high" | "medium" | "low",
  "reasoning": "Detailed reasoning",
  "isValid": true/false,
  "needsRevision": true/false,
  "suggestions": ["suggestion 1", "suggestion 2"],
  "requiresUserInput": true/false
}`;

    const userPrompt = `Goal: ${goal}

Execution Results:
${JSON.stringify(executionResults, null, 2)}

Please evaluate whether these results achieve the goal.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this.parseEvaluationResponse(response.content || '');
  }

  async synthesizeResponse(
    goal: string,
    executionResults: ExecutionResult[],
    evaluation: EvaluationResult,
  ): Promise<AgentResponse> {
    const systemPrompt = `You are synthesizing results for the user.
Create a clear, concise response that explains what was done and the results.
Use natural language, not JSON.`;

    const userPrompt = `Goal: ${goal}

Results:
${JSON.stringify(executionResults, null, 2)}

Evaluation:
${JSON.stringify(evaluation, null, 2)}

Please create a user-friendly response.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return {
      content: response.content || 'Task completed.',
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      suggestions: evaluation.suggestions,
      requiresUserInput: evaluation.requiresUserInput,
    };
  }

  async detectErrors(executionResults: ExecutionResult[]): Promise<{
    hasErrors: boolean;
    errorSummary?: string;
    recoverySuggestion?: string;
  }> {
    const errors = executionResults.filter(r => !r.success);

    if (errors.length === 0) {
      return { hasErrors: false };
    }

    const systemPrompt = `You are analyzing execution errors.
Provide a summary and suggest recovery strategies.

Output format:
{
  "errorSummary": "Brief summary of errors",
  "recoverySuggestion": "How to recover or adjust"
}`;

    const userPrompt = `Errors encountered:
${JSON.stringify(errors, null, 2)}

Please analyze and suggest recovery.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = this.parseErrorAnalysis(response.content || '');

    return {
      hasErrors: true,
      errorSummary: result.errorSummary,
      recoverySuggestion: result.recoverySuggestion,
    };
  }

  private parseEvaluationResponse(content: string): EvaluationResult {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as EvaluationResult;
        return parsed;
      }
    } catch (error) {
      console.error('Failed to parse evaluation response:', error);
    }

    return {
      confidence: 'low',
      reasoning: 'Failed to parse evaluation',
      isValid: false,
      needsRevision: true,
    };
  }

  private parseErrorAnalysis(content: string): {
    errorSummary: string;
    recoverySuggestion: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          errorSummary: string;
          recoverySuggestion: string;
        };
        return parsed;
      }
    } catch (error) {
      console.error('Failed to parse error analysis:', error);
    }

    return {
      errorSummary: content.slice(0, 200),
      recoverySuggestion: 'Please retry or provide more details.',
    };
  }
}
