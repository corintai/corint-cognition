import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  LLMProvider,
  LLMMessage,
  LLMConfig,
  LLMResponse,
  LLMStreamChunk,
} from '../types.js';

/**
 * Google Gemini Provider
 */
export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  private convertMessages(messages: LLMMessage[]): Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }> {
    const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    let systemMessage = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
        continue;
      }

      if (msg.role === 'user' || msg.role === 'assistant') {
        history.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      }
    }

    // If there's a system message, prepend it to the first user message
    if (systemMessage && history.length > 0 && history[0].role === 'user') {
      history[0].parts[0].text = `${systemMessage}\n\n${history[0].parts[0].text}`;
    }

    return history;
  }

  async complete(messages: LLMMessage[], config: LLMConfig): Promise<LLMResponse> {
    const model = this.client.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.max_tokens,
        topP: config.top_p,
      },
    });

    const history = this.convertMessages(messages);
    const lastMessage = history.pop();

    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    const chat = model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const response = result.response;

    const finishReason = response.candidates?.[0]?.finishReason?.toLowerCase() || 'stop';
    const mappedFinishReason =
      finishReason === 'stop'
        ? 'stop'
        : finishReason === 'max_tokens' || finishReason === 'maxtokens'
          ? 'length'
          : finishReason === 'safety' || finishReason === 'recitation'
            ? 'content_filter'
            : 'stop';

    return {
      id: result.responseId || `gemini-${Date.now()}`,
      content: response.text() || null,
      role: 'assistant',
      finish_reason: mappedFinishReason as 'stop' | 'length' | 'content_filter',
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  async *stream(
    messages: LLMMessage[],
    config: LLMConfig,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = this.client.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.max_tokens,
        topP: config.top_p,
      },
    });

    const history = this.convertMessages(messages);
    const lastMessage = history.pop();

    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    const chat = model.startChat({
      history: history,
    });

    const stream = await chat.sendMessageStream(lastMessage.parts[0].text);
    let messageId = `gemini-stream-${Date.now()}`;
    let finishReason: 'stop' | 'length' | 'content_filter' = 'stop';

    for await (const chunk of stream) {
      const text = chunk.text();
      if (text) {
        yield {
          id: messageId,
          content: text,
        };
      }

      // Check for finish reason in the chunk
      const chunkFinishReason = chunk.response?.candidates?.[0]?.finishReason?.toLowerCase();
      if (chunkFinishReason) {
        if (chunkFinishReason === 'max_tokens' || chunkFinishReason === 'maxtokens') {
          finishReason = 'length';
        } else if (chunkFinishReason === 'safety' || chunkFinishReason === 'recitation') {
          finishReason = 'content_filter';
        }
      }
    }

    // Send finish signal
    yield {
      id: messageId,
      finish_reason: finishReason,
    };
  }
}