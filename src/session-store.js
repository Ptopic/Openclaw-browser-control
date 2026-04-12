import crypto from 'node:crypto';

export class SessionStore {
  constructor(secret, ttlSeconds) {
    this.secret = secret;
    this.ttlSeconds = ttlSeconds;
    this.sessions = new Map();
  }

  create(payload) {
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlSeconds * 1000;
    const session = {
      id,
      createdAt: Date.now(),
      expiresAt,
      status: 'active',
      ...payload,
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(id);
      throw new Error('Session expired');
    }
    return session;
  }

  complete(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    session.status = 'completed';
    return session;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt < now) this.sessions.delete(id);
    }
  }
}
