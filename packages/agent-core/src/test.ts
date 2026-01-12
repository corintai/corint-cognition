import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAIProvider, AnthropicProvider, DeepSeekProvider } from '@corint/agent-core';
import { LLMClient } from '@corint/agent-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });
dotenv.config();

async function testOpenAI() {
  console.log('Testing OpenAI Provider...');
  
  const provider = new OpenAIProvider(process.env.OPENAI_API_KEY || 'test-key');
  const client = new LLMClient(provider, { model: 'gpt-4-turbo' });

  try {
    const response = await client.complete([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say hello in one word.' },
    ]);

    console.log('✓ OpenAI Response:', response.content);
    console.log('✓ Tokens used:', response.usage?.total_tokens);
  } catch (error) {
    console.error('✗ OpenAI Error:', (error as Error).message);
  }
}

async function testAnthropic() {
  console.log('\nTesting Anthropic Provider...');
  
  const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'test-key');
  const client = new LLMClient(provider, { model: 'claude-3-5-sonnet-20241022' });

  try {
    const response = await client.complete([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say hello in one word.' },
    ]);

    console.log('✓ Anthropic Response:', response.content);
    console.log('✓ Tokens used:', response.usage?.total_tokens);
  } catch (error) {
    console.error('✗ Anthropic Error:', (error as Error).message);
  }
}

async function testDeepSeek() {
  console.log('\nTesting DeepSeek Provider...');
  
  const provider = new DeepSeekProvider(process.env.DEEPSEEK_API_KEY || 'test-key');
  const client = new LLMClient(provider, { model: 'deepseek-chat' });

  try {
    const response = await client.complete([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say hello in one word.' },
    ]);

    console.log('✓ DeepSeek Response:', response.content);
    console.log('✓ Tokens used:', response.usage?.total_tokens);
  } catch (error) {
    console.error('✗ DeepSeek Error:', (error as Error).message);
  }
}

async function testStreaming() {
  console.log('\nTesting Streaming...');
  
  const provider = new OpenAIProvider(process.env.OPENAI_API_KEY || 'test-key');
  const client = new LLMClient(provider, { model: 'gpt-4-turbo' });

  try {
    let fullContent = '';
    const stream = client.stream([
      { role: 'user', content: 'Count from 1 to 5.' },
    ]);

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content;
        process.stdout.write(chunk.content);
      }
    }
    console.log('\n✓ Streaming completed');
  } catch (error) {
    console.error('✗ Streaming Error:', (error as Error).message);
  }
}

async function testTools() {
  console.log('\nTesting Tool Calling...');
  
  const provider = new OpenAIProvider(process.env.OPENAI_API_KEY || 'test-key');
  const client = new LLMClient(provider, { 
    model: 'gpt-4-turbo',
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather in a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        },
      },
    ],
  });

  try {
    const response = await client.complete([
      { role: 'user', content: 'What is the weather in Beijing?' },
    ]);

    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log('✓ Tool called:', response.tool_calls[0].function.name);
      console.log('✓ Arguments:', response.tool_calls[0].function.arguments);
    } else {
      console.log('✗ No tool calls detected');
    }
  } catch (error) {
    console.error('✗ Tool calling Error:', (error as Error).message);
  }
}

async function main() {
  console.log('=== CORINT Agent Core - Phase 1 Testing ===\n');

  await testOpenAI();
  await testAnthropic();
  await testDeepSeek();
  await testStreaming();
  await testTools();

  console.log('\n=== Testing Complete ===');
}

main().catch(console.error);
