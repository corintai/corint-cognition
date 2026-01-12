import { OpenAIProvider } from './openai.js';

/**
 * GLM 4.7 Provider (ZhipuAI)
 * Compatible with OpenAI API format
 */
export class GLMProvider extends OpenAIProvider {
  name = 'glm';

  constructor(apiKey: string) {
    super(apiKey, 'https://api.z.ai/api/paas/v4');
  }
}