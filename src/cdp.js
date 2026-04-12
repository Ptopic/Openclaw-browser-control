import { WebSocket } from 'ws';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function probeCdpHttp(cdpHttpUrl) {
  const base = cdpHttpUrl.replace(/\/$/, '');
  const out = { base };
  try {
    out.version = await fetchJson(`${base}/json/version`);
  } catch (error) {
    out.versionError = error.message || String(error);
    return out;
  }
  try {
    out.targets = await fetchJson(`${base}/json/list`);
  } catch (error) {
    out.targetsError = error.message || String(error);
  }
  return out;
}

export async function getBrowserWebSocketDebuggerUrl(cdpHttpUrl) {
  const base = cdpHttpUrl.replace(/\/$/, '');
  const json = await fetchJson(`${base}/json/version`);
  const ws = new URL(json.webSocketDebuggerUrl);
  const httpBase = new URL(base);
  if (!ws.port) ws.port = httpBase.port || (httpBase.protocol === 'https:' ? '443' : '80');
  if (ws.hostname === 'localhost' || ws.hostname === '127.0.0.1') ws.hostname = httpBase.hostname;
  ws.protocol = httpBase.protocol === 'https:' ? 'wss:' : 'ws:';
  return ws.toString();
}

export async function listTargets(cdpHttpUrl) {
  return fetchJson(`${cdpHttpUrl.replace(/\/$/, '')}/json/list`);
}

export async function getOrCreatePageTarget(cdpHttpUrl, preferredUrl) {
  const newUrl = `${cdpHttpUrl.replace(/\/$/, '')}/json/new?${encodeURIComponent(preferredUrl || 'https://example.com')}`;
  console.log(`[CDP] Attempting to create new page: ${newUrl}`);
  const res = await fetch(newUrl, { method: 'PUT' });
  if (res.ok) {
    const target = await res.json();
    console.log(`[CDP] Created new page: ${target.id}`);
    return target;
  }
  console.log(`[CDP] Failed to create new page: HTTP ${res.status}, falling back to existing page`);

  const targets = await listTargets(cdpHttpUrl);
  const pageTarget = targets.find((t) => t.type === 'page' && !t.parentId);
  if (pageTarget) {
    console.log(`[CDP] Using existing page: ${pageTarget.id}`);
    return pageTarget;
  }

  throw new Error(`Failed creating target: HTTP ${res.status}`);
}

export class CDPConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (buf) => this.#onMessage(buf.toString()));
    this.ws.on('close', () => {
      console.log(`[CDP] WebSocket closed for ${this.wsUrl}`);
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
      this.pending.clear();
    });
    this.ws.on('error', (err) => {
      console.error(`[CDP] WebSocket error: ${err.message}`);
    });
    return this;
  }

  on(method, handler) {
    const arr = this.eventHandlers.get(method) || [];
    arr.push(handler);
    this.eventHandlers.set(method, arr);
  }

  async send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify(payload));
    return p;
  }

  #onMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else pending.resolve(msg.result);
      return;
    }
    const handlers = this.eventHandlers.get(msg.method) || [];
    for (const h of handlers) h(msg.params, msg.sessionId);
  }

  close() {
    this.ws?.close();
  }
}

export async function attachToPage(cdpHttpUrl, preferredUrl) {
  const browserWsUrl = await getBrowserWebSocketDebuggerUrl(cdpHttpUrl);
  
  // Always create a NEW page for each session to avoid conflicts
  const newUrl = `${cdpHttpUrl.replace(/\/$/, '')}/json/new?${encodeURIComponent(preferredUrl || 'https://example.com')}`;
  console.log(`[CDP] Creating new page: ${newUrl}`);
  const res = await fetch(newUrl, { method: 'PUT' });
  
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    console.error(`[CDP] Failed to create new page: HTTP ${res.status} - ${errorText}`);
    throw new Error(`Failed to create new page: HTTP ${res.status}`);
  }
  
  const target = await res.json();
  console.log(`[CDP] Created new page: ${target.id} - ${target.url}`);
  
  console.log(`[CDP] Connecting to browser WebSocket: ${browserWsUrl}`);
  const connection = await new CDPConnection(browserWsUrl).connect();
  console.log(`[CDP] Connected to browser, sending Target.attachToTarget for ${target.id}...`);
  
  try {
    const result = await connection.send('Target.attachToTarget', {
      targetId: target.id,
      flatten: true,
    });
    console.log(`[CDP] Attached to target, sessionId: ${result.sessionId}`);
    return { connection, sessionId: result.sessionId, target, cdpHttpUrl, browserWsUrl };
  } catch (error) {
    console.error(`[CDP] Failed to attach to target ${target.id}: ${error.message}`);
    connection.close();
    throw error;
  }
}

export async function attachToPageAny(candidates, preferredUrl) {
  const errors = [];
  for (const candidate of candidates) {
    try {
      console.log(`[CDP] Trying candidate: ${candidate}`);
      const result = await attachToPage(candidate, preferredUrl);
      console.log(`[CDP] Successfully attached using: ${candidate}`);
      return result;
    } catch (error) {
      console.error(`[CDP] Candidate ${candidate} failed: ${error.message}`);
      errors.push({ candidate, error: error.message || String(error) });
    }
  }
  const summary = errors.map((e) => `${e.candidate}: ${e.error}`).join(' | ');
  throw new Error(`Unable to reach CDP target. Tried: ${summary}`);
}
