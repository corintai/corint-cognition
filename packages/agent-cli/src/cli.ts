#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import dotenv from 'dotenv';
import { runChat, runOnce } from './chat.js';

const program = new Command();

loadEnv();

program
  .name('corint-agent')
  .description('CORINT Risk Agent - AI-native assistant for risk management')
  .version('1.0.0');

program
  .command('chat')
  .description('Start interactive chat session')
  .option('--session <id>', 'Session id')
  .option('--provider <name>', 'LLM provider: openai | anthropic | deepseek')
  .option('--model <name>', 'LLM model name')
  .option('--temperature <value>', 'Sampling temperature', parseFloat)
  .option('--max-tokens <value>', 'Token budget limit', parseInt)
  .option('--max-queries <value>', 'Query limit per session', parseInt)
  .option('--timeout <value>', 'Session timeout in ms', parseInt)
  .option('--ui <mode>', 'UI mode: auto | tui | plain')
  .option('--yes', 'Auto-approve destructive actions', false)
  .action(async options => {
    await runChat(options);
  });

program
  .command('run')
  .description('Run a single prompt')
  .argument('<prompt>', 'Command prompt')
  .option('--session <id>', 'Session id')
  .option('--provider <name>', 'LLM provider: openai | anthropic | deepseek')
  .option('--model <name>', 'LLM model name')
  .option('--temperature <value>', 'Sampling temperature', parseFloat)
  .option('--max-tokens <value>', 'Token budget limit', parseInt)
  .option('--max-queries <value>', 'Query limit per session', parseInt)
  .option('--timeout <value>', 'Session timeout in ms', parseInt)
  .option('--yes', 'Auto-approve destructive actions', false)
  .action(async (prompt: string, options) => {
    await runOnce(prompt, options);
  });

void program.parseAsync(process.argv).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function loadEnv(): void {
  const envPath = process.env.CORINT_ENV_PATH || path.resolve(process.cwd(), '.env');
  dotenv.config({ path: envPath });
  dotenv.config();
}
