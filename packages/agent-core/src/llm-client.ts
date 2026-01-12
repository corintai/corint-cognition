import type {
  LLMProvider,
  LLMMessage,
  LLMConfig,
  LLMResponse,
  LLMStreamChunk,
} from './types.js';

export class LLMClient {
  private provider: LLMProvider;
  private defaultConfig: Partial<LLMConfig>;

  constructor(provider: LLMProvider, defaultConfig?: Partial<LLMConfig>) {
    this.provider = provider;
    this.defaultConfig = defaultConfig || {};
  }

  async complete(messages: LLMMessage[], config?: Partial<LLMConfig>): Promise<LLMResponse> {
    const mergedConfig: LLMConfig = {
      model: this.defaultConfig.model || 'gpt-4-turbo',
      temperature: config?.temperature ?? this.defaultConfig.temperature ?? 0.7,
      max_tokens: config?.max_tokens ?? this.defaultConfig.max_tokens ?? 4096,
      top_p: config?.top_p ?? this.defaultConfig.top_p ?? 1.0,
      stream: false,
      tools: config?.tools ?? this.defaultConfig.tools,
    };

    return this.provider.complete(messages, mergedConfig);
  }

  async *stream(
    messages: LLMMessage[],
    config?: Partial<LLMConfig>,
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const mergedConfig: LLMConfig = {
      model: this.defaultConfig.model || 'gpt-4-turbo',
      temperature: config?.temperature ?? this.defaultConfig.temperature ?? 0.7,
      max_tokens: config?.max_tokens ?? this.defaultConfig.max_tokens ?? 4096,
      top_p: config?.top_p ?? this.defaultConfig.top_p ?? 1.0,
      stream: true,
      tools: config?.tools ?? this.defaultConfig.tools,
    };

    yield* this.provider.stream(messages, mergedConfig);
  }

  getProviderName(): string {
    return this.provider.name;
  }
}
