import { SessionData, SessionStore } from './types';

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionData>();

  async createSession(token: string, username: string, maxAgeMs: number): Promise<void> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxAgeMs).toISOString();
    this.sessions.set(token, {
      username,
      createdAt,
      expiresAt
    });
  }

  async getSession(token: string): Promise<SessionData | null> {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  isExpired(session: SessionData): boolean {
    return new Date(session.expiresAt).getTime() < Date.now();
  }
}
