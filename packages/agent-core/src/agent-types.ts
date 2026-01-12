export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  dependencies?: string[];
  result?: unknown;
  error?: string;
  retryCount?: number;
}

export interface Plan {
  goal: string;
  tasks: Task[];
  currentTaskIndex: number;
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  workingMemory: Map<string, unknown>;
  currentPlan?: Plan;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  maxTokens?: number;
  maxQueries?: number;
  timeout?: number;
  temperature?: number;
  model?: string;
}

export interface AgentResponse {
  content: string;
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
  suggestions?: string[];
  requiresUserInput?: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
