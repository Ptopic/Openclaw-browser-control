import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSIONS_DIR = join(__dirname, '..', 'data', 'sessions');

// Ensure sessions directory exists
if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export class SessionStore {
  constructor() {
    this.sessions = new Map();
    this._loadFromDisk();
  }

  _sessionPath(sessionId) {
    return join(SESSIONS_DIR, `${sessionId}.json`);
  }

  _loadFromDisk() {
    if (!existsSync(SESSIONS_DIR)) return;
    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(SESSIONS_DIR, file), 'utf8'));
        if (data.expiresAt > Date.now()) {
          this.sessions.set(data.id, data);
        } else {
          unlinkSync(join(SESSIONS_DIR, file));
        }
      } catch (e) {
        // Ignore corrupt files
      }
    }
    console.log(`[SessionStore] Loaded ${this.sessions.size} sessions from disk`);
  }

  save(sessionId, sessionData) {
    const data = { ...sessionData, id: sessionId, savedAt: Date.now() };
    this.sessions.set(sessionId, data);
    try {
      writeFileSync(this._sessionPath(sessionId), JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`[SessionStore] Failed to save session ${sessionId}:`, e.message);
    }
  }

  get(sessionId) {
    const data = this.sessions.get(sessionId);
    if (!data) return null;
    if (data.expiresAt && data.expiresAt < Date.now()) {
      this.delete(sessionId);
      return null;
    }
    return data;
  }

  delete(sessionId) {
    this.sessions.delete(sessionId);
    try {
      const path = this._sessionPath(sessionId);
      if (existsSync(path)) unlinkSync(path);
    } catch (e) {
      // Ignore
    }
  }

  clearAll() {
    for (const id of this.sessions.keys()) {
      this.delete(id);
    }
    this.sessions.clear();
    console.log(`[SessionStore] All sessions cleared`);
  }

  list() {
    // Remove expired sessions first
    for (const [id, data] of this.sessions) {
      if (data.expiresAt && data.expiresAt < Date.now()) {
        this.delete(id);
      }
    }
    return Array.from(this.sessions.entries()).map(([id, data]) => ({
      id,
      device: data.device,
      url: data.url,
      expiresAt: data.expiresAt,
      handoffUrl: data.handoffUrl,
    }));
  }
}