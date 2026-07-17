import { Firestore } from '@google-cloud/firestore';
import { SessionData, SessionStore } from './types';
import { hashToken } from './hashUtils';

export class FirestoreSessionStore implements SessionStore {
  private db: Firestore;
  private collectionName = 'sessions';

  constructor(db: Firestore) {
    this.db = db;
  }

  async createSession(token: string, username: string, maxAgeMs: number): Promise<void> {
    try {
      const hashed = hashToken(token);
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + maxAgeMs).toISOString();

      const docRef = this.db.collection(this.collectionName).doc(hashed);
      await docRef.set({
        username,
        createdAt,
        expiresAt
      });
    } catch (e: any) {
      console.error('FirestoreSessionStore.createSession connection failure:', e.message || e);
      throw e;
    }
  }

  async getSession(token: string): Promise<SessionData | null> {
    try {
      const hashed = hashToken(token);
      const docRef = this.db.collection(this.collectionName).doc(hashed);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      if (!data) {
        return null;
      }

      // Safely handle malformed or missing session records
      if (typeof data.username !== 'string' || typeof data.createdAt !== 'string' || typeof data.expiresAt !== 'string') {
        console.warn('FirestoreSessionStore.getSession: Found malformed session data:', data);
        return null;
      }

      return {
        username: data.username,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt
      };
    } catch (e: any) {
      console.error('FirestoreSessionStore.getSession connection failure:', e.message || e);
      throw e;
    }
  }

  async deleteSession(token: string): Promise<void> {
    try {
      const hashed = hashToken(token);
      const docRef = this.db.collection(this.collectionName).doc(hashed);
      await docRef.delete();
    } catch (e: any) {
      console.error('FirestoreSessionStore.deleteSession connection failure:', e.message || e);
      throw e;
    }
  }

  isExpired(session: SessionData): boolean {
    return new Date(session.expiresAt).getTime() < Date.now();
  }
}
