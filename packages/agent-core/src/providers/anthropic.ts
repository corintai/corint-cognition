import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMMessage,
  LLMConfig,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from '../types.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private convertMessages(
    messages: LLMMessage[],
  ): { system?: string; messages: Anthropic.MessageParam[] } {
    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    return {
      system: systemMessage?.content,
      messages: nonSystemMessages.map(msg => ({
        role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: msg.content,
      })),
    };
  }

  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const response = await this.client.messages.create({
      model: config.model,
      max_tokens: config.max_tokens || 4096,
      temperature: config.temperature,
      top_p: config.top_p,
      system,
      messages: anthropicMessages,
      stream: false,
    });

    let content = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      }
    }

    return {
      id: response.id,
      content: content || null,
      role: 'assistant',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: 'stop',
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async *stream(
    messages: LLMMessage[],
    config: LLMConfig,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const { system, messages: anthropicMessages } = this.convertMessages(messages);

    const stream = await this.client.messages.create({
      model: config.model,
      max_tokens: config.max_tokens || 4096,
      temperature: config.temperature,
      top_p: config.top_p,
      system,
      messages: anthropicMessages,
      stream: true,
    });

    let messageId = '';

    for await (const event of stream) {
      if (event.type === 'message_start') {
        messageId = event.message.id;
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            id: messageId,
            content: event.delta.text,
          };
        }
      } else if (event.type === 'message_delta') {
        yield {
          id: messageId,
          finish_reason: 'stop',
        };
      }
    }
  }
}