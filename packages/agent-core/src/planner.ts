import type { LLMClient } from './llm-client.js';
import type { Task, Plan, SessionContext } from './agent-types.js';
import type { LLMResponse } from './types.js';

export interface PlanningResult {
  plan: Plan;
  reasoning: string;
  usage?: LLMResponse['usage'];
}

export class Planner {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  async createPlan(goal: string, context: SessionContext): Promise<PlanningResult> {
    const systemPrompt = `You are a planning assistant for a risk management agent.
Given a user goal, break it down into concrete, actionable tasks.
Each task should be specific and achievable.

Output format:
{
  "reasoning": "Explain your planning approach",
  "tasks": [
    {
      "id": "task_1",
      "description": "Task description",
      "dependencies": []
    }
  ]
}`;

    const userPrompt = `Goal: ${goal}

Context:
- Previous conversation: ${this.formatHistory(context)}

Please create a detailed plan to achieve this goal.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = this.parsePlanningResponse(response.content || '');

    const plan: Plan = {
      goal,
      tasks: result.tasks.map(t => ({
        ...t,
        status: 'pending' as const,
      })),
      currentTaskIndex: 0,
    };

    return {
      plan,
      reasoning: result.reasoning,
      usage: response.usage,
    };
  }

  async revisePlan(
    currentPlan: Plan,
    feedback: string,
    mode: 'decompose' | 'overwrite',
  ): Promise<PlanningResult> {
    const systemPrompt = `You are revising an existing plan based on feedback.
Mode: ${mode}
- decompose: Break the current task into smaller sub-tasks
- overwrite: Replace remaining tasks with a new approach

Output format:
{
  "reasoning": "Explain your revision",
  "tasks": [...]
}`;

    const userPrompt = `Current plan:
${JSON.stringify(currentPlan, null, 2)}

Feedback: ${feedback}

Please revise the plan.`;

    const response = await this.llmClient.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const result = this.parsePlanningResponse(response.content || '');

    const revisedPlan: Plan = {
      ...currentPlan,
      tasks:
        mode === 'overwrite'
          ? [
              ...currentPlan.tasks.slice(0, currentPlan.currentTaskIndex),
              ...result.tasks.map(t => ({ ...t, status: 'pending' as const })),
            ]
          : this.decomposeCurrentTask(currentPlan, result.tasks),
    };

    return {
      plan: revisedPlan,
      reasoning: result.reasoning,
      usage: response.usage,
    };
  }

  private formatHistory(context: SessionContext): string {
    const recent = context.conversationHistory.slice(-5);
    return recent.map(msg => `${msg.role}: ${msg.content}`).join('\n');
  }

  private parsePlanningResponse(content: string): {
    reasoning: string;
    tasks: Array<{ id: string; description: string; dependencies?: string[] }>;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          reasoning: string;
          tasks: Array<{ id: string; description: string; dependencies?: string[] }>;
        };
        return parsed;
      }
    } catch (error) {
      console.error('Failed to parse planning response:', error);
    }

    return {
      reasoning: 'Failed to parse plan',
      tasks: [
        {
          id: 'task_1',
          description: content.slice(0, 200),
        },
      ],
    };
  }

  private decomposeCurrentTask(
    plan: Plan,
    subTasks: Array<{ id: string; description: string; dependencies?: string[] }>,
  ): Task[] {
    const before = plan.tasks.slice(0, plan.currentTaskIndex);
    const after = plan.tasks.slice(plan.currentTaskIndex + 1);

    return [
      ...before,
      ...subTasks.map(t => ({ ...t, status: 'pending' as const })),
      ...after,
    ];
  }
}
