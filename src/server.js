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

app.get('/debug/headers', (req, res) => {
  res.json({
    host: req.get('host'),
    xForwardedHost: req.get('x-forwarded-host'),
    xForwardedProto: req.get('x-forwarded-proto'),
    protocol: req.protocol,
    allHeaders: req.headers
  });
});

app.get('/debug/config', (_req, res) => {
  res.json({
    cdpHttpUrl: config.cdpHttpUrl,
    cdpHttpUrlCandidates: config.cdpHttpUrlCandidates,
    publicBaseUrl: config.publicBaseUrl,
    screencast: {
      format: config.screencastFormat,
      quality: config.screencastQuality,
      maxWidth: config.screencastMaxWidth,
      maxHeight: config.screencastMaxHeight,
    },
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
    const device = req.body?.device === 'desktop' ? 'desktop' : 'mobile';
    const live = new LiveSession({ pageUrl, device });
    await live.start();
    const session = store.create({ pageUrl, device });
    liveSessions.set(session.id, live);
    // Always use forwarded headers from Traefik/proxy
    const proto = req.get('x-forwarded-proto') || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    const handoffUrl = `${proto}://${host}/session/${session.id}`;
    res.json({ sessionId: session.id, handoffUrl, expiresAt: session.expiresAt, pageUrl, device });
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.post('/session/:sessionId/complete', (req, res) => {
  try {
    const session = store.get(req.params.sessionId);
    store.complete(session.id);
    const live = liveSessions.get(session.id);
    live?.broadcast({ type: 'status', status: 'completed' });
    res.json({ ok: true, sessionId: session.id });
  } catch (error) {
    res.status(404).json({ error: error.message || String(error) });
  }
});

app.get('/session/:sessionId', (req, res) => {
  try {
    store.get(req.params.sessionId);
    res.sendFile(path.resolve(process.cwd(), 'public/index.html'));
  } catch (error) {
    res.status(404).send(`Session not found: ${error.message || String(error)}`);
  }
});

// Automation endpoint for agent control
app.post('/session/:sessionId/automation', async (req, res) => {
  try {
    const session = store.get(req.params.sessionId);
    const live = liveSessions.get(session.id);
    if (!live) {
      return res.status(404).json({ error: 'Live session not found' });
    }
    
    const { action, ...params } = req.body;
    
    switch (action) {
      case 'navigate':
        await live.navigate(params.url);
        res.json({ ok: true, url: params.url });
        break;
      case 'tap':
        await live.dispatchTap(params.x, params.y);
        res.json({ ok: true });
        break;
      case 'click':
        await live.click(params.selector);
        res.json({ ok: true });
        break;
      case 'fill':
        await live.fill(params.selector, params.value);
        res.json({ ok: true });
        break;
      case 'scroll':
        await live.dispatchScroll(params.deltaY || 0, params.x, params.y, params.deltaX || 0);
        res.json({ ok: true });
        break;
      case 'type':
        await live.insertText(params.text);
        res.json({ ok: true });
        break;
      case 'key':
        await live.key(params.key);
        res.json({ ok: true });
        break;
      case 'back':
        await live.navigateBack();
        res.json({ ok: true });
        break;
      case 'reload':
        await live.reload();
        res.json({ ok: true });
        break;
      case 'getUrl':
        const url = await live.getUrl();
        res.json({ url });
        break;
      case 'getTitle':
        const title = await live.getTitle();
        res.json({ title });
        break;
      case 'evaluate':
        const result = await live.evaluate(params.expression);
        res.json({ result });
        break;
      case 'snapshot':
        const snapshot = await live.snapshot();
        res.json({ snapshot });
        break;
      case 'waitForLoad':
        await live.waitForLoad(params.timeout || 10000);
        res.json({ ok: true });
        break;
      default:
        res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

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
  const session = ws.session;
  const live = liveSessions.get(session.id);
  if (!live) {
    ws.send(JSON.stringify({ type: 'error', message: 'Live session unavailable' }));
    ws.close();
    return;
  }
  live.addClient(ws);
  const viewport = live.getViewportSettings();
  ws.send(JSON.stringify({ type: 'ready', device: live.device, ...viewport }));

  ws.on('message', async (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.type === 'tap') await live.dispatchTap(msg.x, msg.y);
      else if (msg.type === 'scroll') await live.dispatchScroll(msg.deltaY, msg.x, msg.y, msg.deltaX || 0);
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
