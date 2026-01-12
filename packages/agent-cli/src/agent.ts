import {
  Tool,
  ToolRegistry,
  type ToolExecutionContext,
  Orchestrator,
  LLMClient,
  OpenAIProvider,
  AnthropicProvider,
  DeepSeekProvider,
  type AgentConfig,
} from '@corint/agent-core';
import {
  QuerySQLTool,
  ExploreSchemaTool,
  CallApiTool,
  ReadFileTool,
  WriteFileTool,
  ListFilesTool,
  ExecuteCodeTool,
  RunShellTool,
  ListDataSourcesTool,
} from '@corint/agent-tools';
import type { CliReporter } from './reporter.js';

export interface AgentRuntimeOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxQueries?: number;
  timeout?: number;
  autoApprove?: boolean;
}

export type ConfirmFn = (message: string) => Promise<boolean>;

export function createAgent(
  options: AgentRuntimeOptions,
  reporter: CliReporter,
  confirm: ConfirmFn,
): Orchestrator {
  const client = buildClient(options);
  const registry = buildToolRegistry(options, reporter, confirm);
  const config: AgentConfig = {
    maxTokens: options.maxTokens,
    maxQueries: options.maxQueries,
    timeout: options.timeout,
  };

  return new Orchestrator(client, registry, config);
}

function buildClient(options: AgentRuntimeOptions): LLMClient {
  const providerName = resolveProvider(options.provider);
  const { model, temperature } = resolveModelAndTemp(providerName, options);

  if (providerName === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider.');
    }
    return new LLMClient(new OpenAIProvider(apiKey), { model, temperature });
  }

  if (providerName === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Anthropic provider.');
    }
    return new LLMClient(new AnthropicProvider(apiKey), { model, temperature });
  }

  if (providerName === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required for DeepSeek provider.');
    }
    return new LLMClient(new DeepSeekProvider(apiKey), { model, temperature });
  }

  throw new Error(`Unsupported provider: ${providerName}`);
}

function resolveProvider(input?: string): 'openai' | 'anthropic' | 'deepseek' {
  const normalized =
    input ||
    process.env.DEFAULT_LLM_PROVIDER 
    '';
  if (normalized) {
    const value = normalized.toLowerCase();
    if (value.includes('deepseek')) {
      return 'deepseek';
    }
    if (value.includes('anthropic') || value.includes('claude')) {
      return 'anthropic';
    }
    return 'openai';
  }
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return 'deepseek';
  }
  return 'openai';
}

function resolveModelAndTemp(
  providerName: string,
  options: AgentRuntimeOptions,
): { model: string; temperature?: number } {
  const envModel = process.env.CORINT_MODEL;
  const envTemp = process.env.CORINT_TEMPERATURE;
  const providerPrefix = providerName.toUpperCase();
  const providerModel = process.env[`${providerPrefix}_MODEL`];
  const providerTemp = process.env[`${providerPrefix}_TEMPERATURE`];
  const parsedEnvTemp = envTemp ? Number(envTemp) : undefined;
  const parsedProviderTemp = providerTemp ? Number(providerTemp) : undefined;
  const envTemperature = Number.isFinite(parsedEnvTemp)
    ? parsedEnvTemp
    : Number.isFinite(parsedProviderTemp)
      ? parsedProviderTemp
      : undefined;

  const modelDefaults: Record<string, string> = {
    openai: 'gpt-4-turbo',
    anthropic: 'claude-3-5-sonnet-20241022',
    deepseek: 'deepseek-chat',
  };

  return {
    model: options.model || envModel || providerModel || modelDefaults[providerName],
    temperature: options.temperature ?? envTemperature,
  };
}

function buildToolRegistry(
  options: AgentRuntimeOptions,
  reporter: CliReporter,
  confirm: ConfirmFn,
): ToolRegistry {
  const registry = new ToolRegistry();

  const tools: Tool[] = [
    new QuerySQLTool(),
    new ExploreSchemaTool(),
    new CallApiTool(),
    new ReadFileTool(),
    new WriteFileTool(),
    new ListFilesTool(),
    new ExecuteCodeTool(),
    new RunShellTool(),
    new ListDataSourcesTool(),
  ];

  for (const tool of tools) {
    registry.register(new ConfirmingTool(tool, options, reporter, confirm));
  }

  return registry;
}

class ConfirmingTool<TInput = unknown, TOutput = unknown> extends Tool<TInput, TOutput> {
  name: string;
  description: string;
  parameters: Tool<TInput, TOutput>['parameters'];

  constructor(
    private tool: Tool<TInput, TOutput>,
    private options: AgentRuntimeOptions,
    private reporter: CliReporter,
    private confirm: ConfirmFn,
  ) {
    super();
    this.name = tool.name;
    this.description = tool.description;
    this.parameters = tool.parameters;
  }

  async execute(input: TInput, context: ToolExecutionContext): Promise<TOutput> {
    this.reporter.toolCall(this.name, input);

    if (shouldConfirmTool(this.name, input)) {
      const approved = this.options.autoApprove ? true : await this.confirm(buildConfirmMessage(this.name, input));
      if (!approved) {
        this.reporter.toolResult(this.name, false, 'cancelled');
        throw new Error(`Tool execution cancelled: ${this.name}`);
      }
    }

    try {
      const result = await this.tool.execute(input, context);
      this.reporter.toolResult(this.name, true);
      return result;
    } catch (error) {
      this.reporter.toolResult(this.name, false);
      throw error;
    }
  }
}

function shouldConfirmTool(name: string, input: unknown): boolean {
  if (name === 'write_file' || name === 'run_shell' || name === 'execute_code') {
    return true;
  }
  if (name === 'call_api') {
    const method = getStringField(input, 'method') || 'GET';
    return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }
  if (name === 'query_sql') {
    const sql = getStringField(input, 'sql');
    if (!sql) {
      return false;
    }
    const statement = sql.trim().split(/\s+/)[0]?.toLowerCase();
    return ['insert', 'update', 'delete', 'alter', 'drop', 'truncate'].includes(statement);
  }
  if (name === 'list_data_sources') {
    return false;
  }
  return false;
}

function buildConfirmMessage(name: string, input: unknown): string {
  if (name === 'write_file') {
    const target = getStringField(input, 'path') || 'unknown path';
    return `Write file to ${target}?`;
  }
  if (name === 'run_shell') {
    const cmd = getStringField(input, 'command') || 'command';
    return `Run shell command: ${cmd}?`;
  }
  if (name === 'execute_code') {
    return 'Execute code in local sandbox?';
  }
  if (name === 'call_api') {
    const method = getStringField(input, 'method') || 'GET';
    const url = getStringField(input, 'url') || 'unknown url';
    return `Call API ${method.toUpperCase()} ${url}?`;
  }
  if (name === 'query_sql') {
    return 'Run a potentially destructive SQL statement?';
  }
  return `Run tool ${name}?`;
}

function getStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
