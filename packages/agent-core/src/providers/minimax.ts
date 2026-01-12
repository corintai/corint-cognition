import { OpenAIProvider } from './openai.js';

/**
 * MiniMax 2.1 Provider
 * Compatible with OpenAI API format
 */
export class MiniMaxProvider extends OpenAIProvider {
  name = 'minimax';

  constructor(apiKey: string) {
    super(apiKey, 'https://api.minimax.chat/v1');
  }
}