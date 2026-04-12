import { attachToPageAny } from './cdp.js';
import { config } from './config.js';

export class LiveSession {
  constructor({ pageUrl }) {
    this.pageUrl = pageUrl;
    this.connection = null;
    this.sessionId = null;
    this.target = null;
    this.clients = new Set();
    this.lastFrame = null;
    this.lastMetadata = null;
  }

  async start() {
    const candidates = [
      config.cdpHttpUrl,
      ...config.cdpHttpUrlCandidates,
      'http://browser:9223',
      'http://q48c48csscs848kggkgs0sgg:9222',
      'http://remote-shopping-browser:9222',
      'http://shared-shopping-browser:9222',
      'http://q48c48csscs848kggkgs0sgg-013553337612:9222',
      'http://host.docker.internal:39222',
      'http://172.17.0.1:39222',
      'http://172.18.0.1:39222',
      'http://172.19.0.1:39222',
      'http://46.225.128.142:49222',
      'http://46.225.128.142:39222',
    ].filter(Boolean);
    const uniqueCandidates = [...new Set(candidates)];
    
    // Retry logic - browser CDP may not be immediately available
    let lastError;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const { connection, sessionId, target, cdpHttpUrl } = await attachToPageAny(uniqueCandidates, this.pageUrl);
        this.connection = connection;
        this.sessionId = sessionId;
        this.target = target;
        this.cdpHttpUrl = cdpHttpUrl;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 29) {
          console.log(`CDP connection attempt ${attempt + 1}/30 failed, retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    if (!this.connection) throw lastError;

    this.connection.on('Page.screencastFrame', async (params, evtSessionId) => {
      if (evtSessionId !== this.sessionId) return;
      this.lastFrame = params.data;
      this.lastMetadata = params.metadata;
      this.broadcast({ type: 'frame', data: params.data, metadata: params.metadata });
      await this.connection.send('Page.screencastFrameAck', { sessionId: params.sessionId }, this.sessionId).catch(() => {});
    });

    await this.connection.send('Page.enable', {}, this.sessionId);
    await this.connection.send('Runtime.enable', {}, this.sessionId);
    await this.connection.send('Emulation.setDeviceMetricsOverride', {
      width: config.mobileWidth,
      height: config.mobileHeight,
      deviceScaleFactor: config.deviceScaleFactor,
      mobile: true,
      screenWidth: config.mobileWidth,
      screenHeight: config.mobileHeight,
    }, this.sessionId);
    await this.connection.send('Page.navigate', { url: this.pageUrl }, this.sessionId).catch(() => {});
    await this.connection.send('Page.startScreencast', {
      format: config.screencastFormat,
      quality: config.screencastQuality,
      maxWidth: config.screencastMaxWidth,
      maxHeight: config.screencastMaxHeight,
      everyNthFrame: config.screencastEveryNthFrame,
    }, this.sessionId);
  }

  addClient(ws) {
    this.clients.add(ws);
    if (this.lastFrame) ws.send(JSON.stringify({ type: 'frame', data: this.lastFrame, metadata: this.lastMetadata }));
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(raw);
    }
  }

  async dispatchTap(x, y) {
    await this.connection.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
    }, this.sessionId);
    await this.connection.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    }, this.sessionId);
  }

  async dispatchScroll(deltaY, x, y) {
    await this.connection.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaY,
      deltaX: 0,
      modifiers: 0,
      pointerType: 'mouse',
    }, this.sessionId);
  }

  async insertText(text) {
    await this.connection.send('Input.insertText', { text }, this.sessionId);
  }

  async key(name) {
    const keyMap = {
      Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
      Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    };
    const key = keyMap[name];
    if (!key) return;
    await this.connection.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key }, this.sessionId);
    await this.connection.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key }, this.sessionId);
  }

  async navigateBack() {
    await this.connection.send('Page.getNavigationHistory', {}, this.sessionId).then(async ({ currentIndex, entries }) => {
      const prev = entries[currentIndex - 1];
      if (prev) await this.connection.send('Page.navigateToHistoryEntry', { entryId: prev.id }, this.sessionId);
    }).catch(() => {});
  }

  async reload() {
    await this.connection.send('Page.reload', { ignoreCache: true }, this.sessionId).catch(() => {});
  }

  async stop() {
    await this.connection.send('Page.stopScreencast', {}, this.sessionId).catch(() => {});
    this.connection?.close();
  }
}
