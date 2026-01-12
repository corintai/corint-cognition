export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  id: string;
  content: string | null;
  role: 'assistant';
  tool_calls?: LLMToolCall[];
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMStreamChunk {
  id: string;
  content?: string;
  tool_calls?: Partial<LLMToolCall>[];
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: LLMTool[];
}

export abstract class LLMProvider {
  abstract name: string;
  abstract complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse>;
  abstract stream(
    messages: LLMMessage[],
    config: LLMConfig,
  ): AsyncGenerator<LLMStreamChunk, void, unknown>;
}
