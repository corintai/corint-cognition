import inquirer from 'inquirer';
import chalk from 'chalk';
import { createAgent, getRuntimeInfo, type AgentRuntimeOptions, type ConfirmFn } from './agent.js';
import { CliReporter } from './reporter.js';
import { TerminalUI } from './terminal-ui.js';
import { SessionStore, type SessionState, type SessionCheckpoint } from './session-store.js';
import type { SessionContext } from '@corint/agent-core';

export interface ChatOptions extends AgentRuntimeOptions {
  session?: string;
  userId?: string;
  yes?: boolean;
  ui?: string;
}

export async function runChat(options: ChatOptions): Promise<void> {
  const uiMode = resolveUiMode(options);
  const canUseTui = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const useTui = uiMode === 'tui' && canUseTui;
  const ui = useTui
    ? new TerminalUI({
        prompt: chalk.cyan('> '),
        echoPrefix: chalk.cyan('> '),
        showDivider: true,
      })
    : null;
  ui?.start();
  const reporter = new CliReporter({ useSpinner: process.stdout.isTTY && !useTui, output: ui ?? undefined });
  if (uiMode === 'tui' && !useTui) {
    reporter.warn('TUI requires an interactive terminal; falling back to plain UI.');
  }
  const confirm = createConfirm(options, reporter, ui ?? undefined);
  const orchestrator = createAgent(
    { ...options, autoApprove: options.yes || !process.stdin.isTTY },
    reporter,
    confirm,
  );
  const store = new SessionStore();

  let activeSessionId = await resolveSessionId(options, store);
  let context = ensureSession(orchestrator, activeSessionId, options.userId);
  let state = await loadSessionState(store, activeSessionId, context);

  const runtimeInfo = getRuntimeInfo(options);
  reporter.banner({
    mode: 'chat',
    provider: runtimeInfo.provider,
    model: runtimeInfo.model,
    temperature: runtimeInfo.temperature,
    sessionId: activeSessionId,
    ui: uiMode,
  });
  reporter.info('Type /help for commands.');

  try {
    while (true) {
      const input = await promptInput(ui);

      const trimmed = String(input || '').trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('/')) {
        const shouldExit = await handleCommand(
          trimmed,
          reporter,
          store,
          orchestrator,
          context,
          state,
          newState => {
            state = newState;
          },
          newContext => {
            context = newContext;
          },
          newSessionId => {
            activeSessionId = newSessionId;
          },
          options,
        );
        if (shouldExit) {
          break;
        }
        continue;
      }

      const checkpoint = store.createCheckpoint(context);
      state.checkpoints.push(checkpoint);
      await store.saveSession(state);

      await runMessage(orchestrator, reporter, activeSessionId, trimmed);

      state = store.updateStateFromContext(state, context);
      await store.saveSession(state);
    }
  } finally {
    ui?.close();
  }
}

export async function runOnce(prompt: string, options: ChatOptions): Promise<void> {
  const reporter = new CliReporter({ useSpinner: process.stdout.isTTY });
  const confirm = createConfirm(options, reporter);
  const orchestrator = createAgent(
    { ...options, autoApprove: options.yes || !process.stdin.isTTY },
    reporter,
    confirm,
  );
  const store = new SessionStore();

  const sessionId = await resolveSessionId(options, store);
  const context = ensureSession(orchestrator, sessionId, options.userId);
  const runtimeInfo = getRuntimeInfo(options);
  reporter.banner({
    mode: 'run',
    provider: runtimeInfo.provider,
    model: runtimeInfo.model,
    temperature: runtimeInfo.temperature,
    sessionId,
    ui: 'plain',
  });
  let state = await loadSessionState(store, sessionId, context);

  const checkpoint = store.createCheckpoint(context);
  state.checkpoints.push(checkpoint);
  await store.saveSession(state);

  await runMessage(orchestrator, reporter, sessionId, prompt);

  state = store.updateStateFromContext(state, context);
  await store.saveSession(state);
}

async function runMessage(
  orchestrator: ReturnType<typeof createAgent>,
  reporter: CliReporter,
  sessionId: string,
  message: string,
): Promise<void> {
  try {
    for await (const chunk of orchestrator.processMessageStream(sessionId, message)) {
      if (chunk.type === 'status') {
        reporter.status(chunk.content);
      } else if (chunk.type === 'response') {
        reporter.response(chunk.content);
      } else {
        reporter.info(chunk.content);
      }
    }
  } catch (error) {
    reporter.error(`Error: ${(error as Error).message}`);
  } finally {
    reporter.clearStatus();
  }
}

function createConfirm(options: ChatOptions, reporter: CliReporter, ui?: TerminalUI): ConfirmFn {
  return async (message: string) => {
    if (options.yes || !process.stdin.isTTY) {
      return true;
    }
    if (ui) {
      return ui.confirm(message);
    }
    reporter.pauseStatus();
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'approved',
        message,
        default: false,
      },
    ]);
    reporter.resumeStatus();
    return Boolean(answer.approved);
  };
}

async function promptInput(ui: TerminalUI | null): Promise<string> {
  if (ui) {
    return ui.readLine();
  }
  const { input } = await inquirer.prompt([
    {
      type: 'input',
      name: 'input',
      message: chalk.cyan('>'),
    },
  ]);
  return String(input || '');
}

function resolveUiMode(options: ChatOptions): 'tui' | 'plain' {
  const raw = (options.ui || process.env.CORINT_UI || 'auto').toLowerCase();
  if (raw === 'tui' || raw === 'plain') {
    return raw;
  }
  return process.stdout.isTTY && process.stdin.isTTY ? 'tui' : 'plain';
}

async function resolveSessionId(options: ChatOptions, store: SessionStore): Promise<string> {
  if (options.session) {
    return options.session;
  }
  const lastSession = await store.getLastSessionId();
  return lastSession || `session-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function ensureSession(
  orchestrator: ReturnType<typeof createAgent>,
  sessionId: string,
  userId?: string,
): SessionContext {
  const existing = orchestrator.getSession(sessionId);
  if (existing) {
    return existing;
  }
  return orchestrator.createSession(sessionId, userId);
}

async function loadSessionState(
  store: SessionStore,
  sessionId: string,
  context: SessionContext,
): Promise<SessionState> {
  const stored = await store.loadSession(sessionId);
  if (stored) {
    store.applyState(context, stored);
    return stored;
  }

  const state = store.createState(sessionId);
  await store.saveSession(state);
  return state;
}

async function handleCommand(
  input: string,
  reporter: CliReporter,
  store: SessionStore,
  orchestrator: ReturnType<typeof createAgent>,
  context: SessionContext,
  state: SessionState,
  setState: (state: SessionState) => void,
  setContext: (context: SessionContext) => void,
  setSessionId: (sessionId: string) => void,
  options: ChatOptions,
): Promise<boolean> {
  const [command, ...args] = input.slice(1).trim().split(/\s+/);

  switch (command) {
    case 'exit':
    case 'quit':
      reporter.info('Bye.');
      return true;
    case 'help':
      reporter.info(renderHelp());
      return false;
    case 'history':
      printHistory(context, reporter, parseCount(args[0]));
      return false;
    case 'sessions':
      await listSessions(store, reporter);
      return false;
    case 'session':
      await switchSession(
        args[0],
        reporter,
        store,
        orchestrator,
        context,
        state,
        setState,
        setContext,
        setSessionId,
        options,
      );
      return false;
    case 'restore':
      await restoreCheckpoint(reporter, store, context, state, setState);
      return false;
    case 'clear':
      {
        const updated = clearSession(context, state, setState);
        await store.saveSession(updated);
      }
      reporter.success('Session cleared.');
      return false;
    default:
      reporter.warn(`Unknown command: /${command}`);
      reporter.info('Type /help for available commands.');
      return false;
  }
}

function renderHelp(): string {
  return [
    'Commands:',
    '/help                 Show this help',
    '/history [n]          Show recent messages',
    '/sessions             List saved sessions',
    '/session <id>         Switch/create session',
    '/restore              Roll back to last checkpoint',
    '/clear                Clear current session memory',
    '/exit                 Quit',
  ].join('\n');
}

function printHistory(context: SessionContext, reporter: CliReporter, count: number): void {
  const items = context.conversationHistory.slice(-count);
  if (items.length === 0) {
    reporter.info('No history yet.');
    return;
  }
  reporter.pauseStatus();
  for (const item of items) {
    const stamp = new Date(item.timestamp).toLocaleTimeString();
    const label = item.role.padEnd(9);
    reporter.line(`${chalk.gray(`[${stamp}]`)} ${chalk.cyan(label)} ${item.content}`);
  }
  reporter.resumeStatus();
}

async function listSessions(store: SessionStore, reporter: CliReporter): Promise<void> {
  const sessions = await store.listSessions();
  if (sessions.length === 0) {
    reporter.info('No saved sessions.');
    return;
  }
  reporter.pauseStatus();
  for (const session of sessions) {
    const updated = new Date(session.updatedAt).toLocaleString();
    reporter.line(`${chalk.cyan(session.sessionId)} ${chalk.gray(updated)}`);
  }
  reporter.resumeStatus();
}

async function switchSession(
  targetId: string | undefined,
  reporter: CliReporter,
  store: SessionStore,
  orchestrator: ReturnType<typeof createAgent>,
  context: SessionContext,
  state: SessionState,
  setState: (state: SessionState) => void,
  setContext: (context: SessionContext) => void,
  setSessionId: (sessionId: string) => void,
  options: ChatOptions,
): Promise<void> {
  if (!targetId) {
    reporter.warn('Usage: /session <id>');
    return;
  }

  const currentState = store.updateStateFromContext(state, context);
  await store.saveSession(currentState);

  const nextContext = ensureSession(orchestrator, targetId, options.userId);
  const nextState = await loadSessionState(store, targetId, nextContext);

  setState(nextState);
  setContext(nextContext);
  setSessionId(targetId);
  await store.saveSession(nextState);
  reporter.success(`Switched to session ${targetId}`);
}

async function restoreCheckpoint(
  reporter: CliReporter,
  store: SessionStore,
  context: SessionContext,
  state: SessionState,
  setState: (state: SessionState) => void,
): Promise<void> {
  const checkpoint = state.checkpoints.pop();
  if (!checkpoint) {
    reporter.warn('No checkpoints to restore.');
    return;
  }
  applyCheckpoint(context, checkpoint);
  const updated = {
    ...state,
    conversationHistory: checkpoint.conversationHistory,
    workingMemory: checkpoint.workingMemory,
    updatedAt: Date.now(),
  };
  setState(updated);
  await store.saveSession(updated);
  reporter.success('Restored last checkpoint.');
}

function applyCheckpoint(context: SessionContext, checkpoint: SessionCheckpoint): void {
  context.conversationHistory = [...checkpoint.conversationHistory];
  context.workingMemory = new Map(Object.entries(checkpoint.workingMemory));
  context.currentPlan = undefined;
}

function clearSession(
  context: SessionContext,
  state: SessionState,
  setState: (state: SessionState) => void,
): SessionState {
  context.conversationHistory = [];
  context.workingMemory = new Map();
  context.currentPlan = undefined;
  const updated = {
    ...state,
    conversationHistory: [],
    workingMemory: {},
    updatedAt: Date.now(),
  };
  setState(updated);
  return updated;
}

function parseCount(value?: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.floor(parsed);
}
