import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

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

  sign(session) {
    return jwt.sign({ sid: session.id }, this.secret, { expiresIn: this.ttlSeconds });
  }

  verify(token) {
    const decoded = jwt.verify(token, this.secret);
    const session = this.sessions.get(decoded.sid);
    if (!session) throw new Error('Session not found');
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(decoded.sid);
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
