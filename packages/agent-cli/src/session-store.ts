import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { SessionContext } from '@corint/agent-core';

export interface SessionCheckpoint {
  id: string;
  timestamp: number;
  conversationHistory: SessionContext['conversationHistory'];
  workingMemory: Record<string, unknown>;
}

export interface SessionState {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  conversationHistory: SessionContext['conversationHistory'];
  workingMemory: Record<string, unknown>;
  checkpoints: SessionCheckpoint[];
}

export interface SessionSummary {
  sessionId: string;
  updatedAt: number;
  createdAt: number;
}

export class SessionStore {
  private baseDir: string;
  private lastSessionFile: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.corint', 'sessions');
    this.lastSessionFile = path.join(this.baseDir, 'last-session.txt');
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async listSessions(): Promise<SessionSummary[]> {
    await this.ensureDir();
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    const sessions: SessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const sessionId = entry.name.replace(/\.json$/, '');
      const state = await this.loadSession(sessionId);
      if (state) {
        sessions.push({
          sessionId: state.sessionId,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        });
      }
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadSession(sessionId: string): Promise<SessionState | undefined> {
    await this.ensureDir();
    const filePath = this.getSessionPath(sessionId);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as SessionState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async saveSession(state: SessionState): Promise<void> {
    await this.ensureDir();
    const filePath = this.getSessionPath(state.sessionId);
    const payload = { ...state, updatedAt: Date.now() };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    await this.setLastSessionId(state.sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureDir();
    await fs.rm(this.getSessionPath(sessionId), { force: true });
  }

  async getLastSessionId(): Promise<string | undefined> {
    await this.ensureDir();
    try {
      const content = await fs.readFile(this.lastSessionFile, 'utf8');
      return content.trim() || undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async setLastSessionId(sessionId: string): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.lastSessionFile, sessionId, 'utf8');
  }

  createState(sessionId: string): SessionState {
    const now = Date.now();
    return {
      sessionId,
      createdAt: now,
      updatedAt: now,
      conversationHistory: [],
      workingMemory: {},
      checkpoints: [],
    };
  }

  createCheckpoint(context: SessionContext): SessionCheckpoint {
    return {
      id: `checkpoint-${Date.now()}`,
      timestamp: Date.now(),
      conversationHistory: [...context.conversationHistory],
      workingMemory: serializeWorkingMemory(context.workingMemory),
    };
  }

  applyState(context: SessionContext, state: SessionState): void {
    context.conversationHistory = [...state.conversationHistory];
    context.workingMemory = new Map(Object.entries(state.workingMemory));
    context.currentPlan = undefined;
  }

  updateStateFromContext(state: SessionState, context: SessionContext): SessionState {
    return {
      ...state,
      conversationHistory: [...context.conversationHistory],
      workingMemory: serializeWorkingMemory(context.workingMemory),
      updatedAt: Date.now(),
    };
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}.json`);
  }
}

function serializeWorkingMemory(memory: Map<string, unknown>): Record<string, unknown> {
  const entries = Array.from(memory.entries()).map(([key, value]) => [
    key,
    ensureSerializable(value),
  ]);
  return Object.fromEntries(entries);
}

function ensureSerializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
