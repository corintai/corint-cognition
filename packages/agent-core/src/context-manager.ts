import type { SessionContext } from './agent-types.js';

export class ContextManager {
  private sessions = new Map<string, SessionContext>();

  createSession(sessionId: string, userId?: string): SessionContext {
    const context: SessionContext = {
      sessionId,
      userId,
      conversationHistory: [],
      workingMemory: new Map(),
      metadata: {},
    };
    this.sessions.set(sessionId, context);
    return context;
  }

  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
  }

  getConversationHistory(sessionId: string, limit?: number): SessionContext['conversationHistory'] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }
    const history = session.conversationHistory;
    return limit ? history.slice(-limit) : history;
  }

  setWorkingMemory(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.workingMemory.set(key, value);
  }

  getWorkingMemory(sessionId: string, key: string): unknown {
    const session = this.sessions.get(sessionId);
    return session?.workingMemory.get(key);
  }

  clearWorkingMemory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.workingMemory.clear();
    }
  }
}
