import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMMessage,
  LLMConfig,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from '../types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  private convertMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.tool_call_id!,
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: config.model,
      messages: this.convertMessages(messages),
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      top_p: config.top_p,
      tools: config.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
      stream: false,
    });

    const choice = response.choices[0];
    const message = choice.message;

    return {
      id: response.id,
      content: message.content,
      role: 'assistant',
      tool_calls: message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })) as LLMToolCall[] | undefined,
      finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter',
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *stream(
    messages: LLMMessage[],
    config: LLMConfig,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: config.model,
      messages: this.convertMessages(messages),
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      top_p: config.top_p,
      tools: config.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      yield {
        id: chunk.id,
        content: delta.content || undefined,
        tool_calls: delta.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '',
          },
        })),
        finish_reason: chunk.choices[0]?.finish_reason as
          | 'stop'
          | 'length'
          | 'tool_calls'
          | 'content_filter'
          | undefined,
      };
    }
  }
}