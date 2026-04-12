import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { SessionStore } from './session-store.js';
import { LiveSession } from './live-session.js';
import { probeCdpHttp, getBrowserWebSocketDebuggerUrl } from './cdp.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const store = new SessionStore(config.sessionSecret, config.sessionTtlSeconds);
const liveSessions = new Map();

app.use(express.json({ limit: '1mb' }));
app.use('/static', express.static(path.resolve(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/debug/config', (_req, res) => {
  res.json({
    cdpHttpUrl: config.cdpHttpUrl,
    cdpHttpUrlCandidates: config.cdpHttpUrlCandidates,
  });
});

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

app.post('/sessions', async (req, res) => {
  try {
    const pageUrl = req.body?.url || 'https://example.com';
    const live = new LiveSession({ pageUrl });
    await live.start();
    const session = store.create({ pageUrl });
    liveSessions.set(session.id, live);
    const token = store.sign(session);
    // Use forwarded headers from Traefik/proxy
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = (config.publicBaseUrl && !config.publicBaseUrl.includes('localhost'))
      ? config.publicBaseUrl.replace(/\/$/, '')
      : `${proto}://${host}`;
    const handoffUrl = `${baseUrl}/session/${token}`;
    res.json({ sessionId: session.id, handoffUrl, expiresAt: session.expiresAt, pageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post('/session/:token/complete', (req, res) => {
  try {
    const session = store.verify(req.params.token);
    store.complete(session.id);
    const live = liveSessions.get(session.id);
    live?.broadcast({ type: 'status', status: 'completed' });
    res.json({ ok: true, sessionId: session.id });
  } catch (error) {
    res.status(401).json({ error: error.message || String(error) });
  }
});

app.get('/session/:token', (req, res) => {
  try {
    store.verify(req.params.token);
    res.sendFile(path.resolve(process.cwd(), 'public/index.html'));
  } catch (error) {
    res.status(401).send(`Invalid session: ${error.message || String(error)}`);
  }
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith('/ws/')) return socket.destroy();
  const token = url.pathname.split('/').pop();
  let session;
  try {
    session = store.verify(token);
  } catch {
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.session = session;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const session = ws.session;
  const live = liveSessions.get(session.id);
  if (!live) {
    ws.send(JSON.stringify({ type: 'error', message: 'Live session unavailable' }));
    ws.close();
    return;
  }
  live.addClient(ws);
  ws.send(JSON.stringify({ type: 'ready', width: config.mobileWidth, height: config.mobileHeight }));

  ws.on('message', async (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.type === 'tap') await live.dispatchTap(msg.x, msg.y);
      else if (msg.type === 'scroll') await live.dispatchScroll(msg.deltaY, msg.x, msg.y);
      else if (msg.type === 'text') await live.insertText(msg.text || '');
      else if (msg.type === 'key') await live.key(msg.key);
      else if (msg.type === 'back') await live.navigateBack();
      else if (msg.type === 'reload') await live.reload();
      else if (msg.type === 'complete') {
        store.complete(session.id);
        live.broadcast({ type: 'status', status: 'completed' });
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message || String(error) }));
    }
  });

  ws.on('close', () => live.removeClient(ws));
});

setInterval(() => store.cleanup(), 60_000).unref();

server.listen(config.port, () => {
  console.log(`live-browser-handoff listening on :${config.port}`);
});
