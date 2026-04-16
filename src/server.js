import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { SessionStore } from './session-store.js';
import { probeCdpHttp, getBrowserWebSocketDebuggerUrl } from './cdp.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const store = new SessionStore(config.sessionSecret, config.sessionTtlSeconds);

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Debug: check CDP connection status
app.get('/debug/cdp', async (_req, res) => {
  const candidates = [config.cdpHttpUrl, ...config.cdpHttpUrlCandidates].filter(Boolean);
  const results = [];
  for (const candidate of candidates) {
    const probe = await probeCdpHttp(candidate);
    try {
      probe.browserWsUrl = await getBrowserWebSocketDebuggerUrl(candidate);
    } catch (error) {
      probe.browserWsError = error.message || String(error);
    }
    results.push(probe);
  }
  res.json({ results });
});

// Create a new handoff session
// Returns { sessionId, handoffUrl, expiresAt, pageUrl, device }
// The actual browser automation is done via agent-browser --cdp http://browser:9223
app.post('/sessions', async (req, res) => {
  try {
    const pageUrl = req.body?.url || 'https://example.com';
    // Determine device type from (1) DEFAULT_DEVICE env, (2) domain name, (3) request parameter
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    let device;
    if (config.defaultDevice) {
      device = config.defaultDevice;
    } else if (host.includes('mobile-handoff')) {
      device = 'mobile';
    } else if (host.includes('desktop-handoff')) {
      device = 'desktop';
    } else {
      device = req.body?.device === 'desktop' ? 'desktop' : 'mobile';
    }
    const session = store.create({ pageUrl, device });
    // Use forwarded headers from Traefik/proxy
    const proto = req.get('x-forwarded-proto') || 'https';
    const handoffUrl = `${proto}://${host}/session/${session.id}`;
    res.json({ sessionId: session.id, handoffUrl, expiresAt: session.expiresAt, pageUrl, device });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Serve the handoff HTML page for human interaction
app.get('/session/:sessionId', (req, res) => {
  try {
    store.get(req.params.sessionId);
    res.sendFile(path.resolve(process.cwd(), 'public/index.html'));
  } catch (error) {
    res.status(404).send(`Session not found or expired: ${error.message || String(error)}`);
  }
});

// Mark session complete (optional — signals done to watchers)
app.post('/session/:sessionId/complete', (req, res) => {
  try {
    const session = store.get(req.params.sessionId);
    store.complete(session.id);
    res.json({ ok: true, sessionId: session.id });
  } catch (error) {
    res.status(404).json({ error: error.message || String(error) });
  }
});

// WebSocket upgrade for the handoff viewer
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/ws/')) return socket.destroy();
  const sessionId = url.pathname.split('/').pop();
  let session;
  try {
    session = store.get(sessionId);
  } catch {
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.session = session;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  // Minimal WS handler — real browser control is via agent-browser --cdp
  // This only exists to serve the handoff viewer HTML which uses WebSocket for live frames
  ws.on('message', () => {}); // ignore
  ws.on('close', () => {});
});

setInterval(() => store.cleanup(), 60_000).unref();

server.listen(config.port, () => {
  console.log(`openclaw-browser-handoff listening on :${config.port}`);
});
