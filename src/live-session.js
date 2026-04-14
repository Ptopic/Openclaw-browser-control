import { attachToPageAny } from './cdp.js';
import { config } from './config.js';

export class LiveSession {
  constructor({ pageUrl, device = 'mobile' }) {
    this.pageUrl = pageUrl;
    this.device = device;
    this.connection = null;
    this.sessionId = null;
    this.target = null;
    this.clients = new Set();
    this.lastFrame = null;
    this.lastMetadata = null;
  }

  getViewportSettings() {
    if (this.device === 'desktop') {
      return {
        width: config.desktopWidth,
        height: config.desktopHeight,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: config.desktopWidth,
        screenHeight: config.desktopHeight,
      };
    }
    return {
      width: config.mobileWidth,
      height: config.mobileHeight,
      deviceScaleFactor: config.deviceScaleFactor,
      mobile: true,
      screenWidth: config.mobileWidth,
      screenHeight: config.mobileHeight,
    };
  }

  async start() {
    const candidates = [
      config.cdpHttpUrl,
      ...config.cdpHttpUrlCandidates,
    ].filter(Boolean);
    const uniqueCandidates = [...new Set(candidates)];
    
    console.log(`[LiveSession] Starting session for ${this.pageUrl} (device: ${this.device})`);
    console.log(`[LiveSession] CDP candidates: ${uniqueCandidates.join(', ')}`);
    
    // Retry logic - browser CDP may not be immediately available
    let lastError;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const { connection, sessionId, target, cdpHttpUrl } = await attachToPageAny(uniqueCandidates, this.pageUrl);
        this.connection = connection;
        this.sessionId = sessionId;
        this.target = target;
        this.cdpHttpUrl = cdpHttpUrl;
        console.log(`[LiveSession] Successfully attached to page on attempt ${attempt + 1}`);
        break;
      } catch (err) {
        lastError = err;
        console.error(`[LiveSession] Attempt ${attempt + 1}/30 failed: ${err.message}`);
        if (attempt < 29) {
          console.log(`[LiveSession] Retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    if (!this.connection) {
      console.error(`[LiveSession] All attempts failed, throwing error`);
      throw lastError;
    }

    this.connection.on('Page.screencastFrame', async (params, evtSessionId) => {
      // When connected directly to a page, sessionId is undefined — accept all events
      if (this.sessionId !== undefined && evtSessionId !== this.sessionId) return;
      this.lastFrame = params.data;
      this.lastMetadata = params.metadata;
      this.broadcast({ type: 'frame', data: params.data, metadata: params.metadata });
      await this.connection.send('Page.screencastFrameAck', { sessionId: params.sessionId }, this.sessionId).catch(() => {});
    });

    console.log(`[LiveSession ${this.device}] Enabling CDP domains...`);
    try {
      await this.connection.send('Page.enable', {}, this.sessionId);
      console.log(`[LiveSession ${this.device}] Page.enable OK`);
      await this.connection.send('Runtime.enable', {}, this.sessionId);
      console.log(`[LiveSession ${this.device}] Runtime.enable OK`);
      await this.connection.send('DOM.enable', {}, this.sessionId);
      console.log(`[LiveSession ${this.device}] DOM.enable OK`);
      await this.connection.send('Accessibility.enable', {}, this.sessionId);
      console.log(`[LiveSession ${this.device}] Accessibility.enable OK`);
      const viewport = this.getViewportSettings();
      await this.connection.send('Emulation.setDeviceMetricsOverride', viewport, this.sessionId);
      console.log(`[LiveSession ${this.device}] Emulation.setDeviceMetricsOverride OK`);
      await this.connection.send('Page.navigate', { url: this.pageUrl }, this.sessionId).catch(() => {});
      console.log(`[LiveSession ${this.device}] Page.navigate OK`);
    } catch (err) {
      console.error(`[LiveSession ${this.device}] CDP command failed: ${err.message}`);
      throw err;
    }
    
    // Use device-specific screencast settings
    const screencastSettings = this.device === 'desktop' ? {
      format: config.screencastFormat,
      quality: config.desktopScreencastQuality,
      maxWidth: config.desktopScreencastMaxWidth,
      maxHeight: config.desktopScreencastMaxHeight,
      everyNthFrame: config.screencastEveryNthFrame,
    } : {
      format: config.screencastFormat,
      quality: config.screencastQuality,
      maxWidth: config.screencastMaxWidth,
      maxHeight: config.screencastMaxHeight,
      everyNthFrame: config.screencastEveryNthFrame,
    };
    console.log(`[LiveSession ${this.device}] Starting screencast with settings:`, JSON.stringify(screencastSettings));
    let screencastOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.connection.send('Page.startScreencast', screencastSettings, this.sessionId);
        console.log(`[LiveSession ${this.device}] Page.startScreencast OK (attempt ${attempt + 1})`);
        screencastOk = true;
        break;
      } catch (err) {
        console.error(`[LiveSession ${this.device}] Page.startScreencast FAILED (attempt ${attempt + 1}): ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!screencastOk) {
      console.log(`[LiveSession ${this.device}] Continuing without screencast`);
    }
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
    if (this.device === 'desktop') {
      // Use mouse events for desktop
      await this.connection.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      }, this.sessionId);
      await this.connection.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      }, this.sessionId);
    } else {
      // Use touch events for mobile
      await this.connection.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
      }, this.sessionId);
      await this.connection.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      }, this.sessionId);
    }
  }

  async dispatchScroll(deltaY, x, y, deltaX = 0) {
    await this.connection.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaY,
      deltaX,
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

  // Automation methods for agent control
  async navigate(url) {
    await this.connection.send('Page.navigate', { url }, this.sessionId);
    await this.waitForLoad();
  }

  async waitForLoad(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('waitForLoad timeout')), timeout);
      const handler = (params, sid) => {
        if (this.sessionId !== undefined && sid !== this.sessionId) return;
        if (params.name === 'load') {
          clearTimeout(timer);
          this.connection.off('Page.loadEventFired', handler);
          resolve();
        }
      };
      this.connection.on('Page.loadEventFired', handler);
    });
  }

  async evaluate(expression) {
    const { result } = await this.connection.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    }, this.sessionId);
    return result.value;
  }

  async getUrl() {
    return this.evaluate('window.location.href');
  }

  async getTitle() {
    return this.evaluate('document.title');
  }

  async snapshot() {
    // Get accessibility tree like agent-browser
    const { root } = await this.connection.send('Accessibility.getFullAXTree', {}, this.sessionId);
    return this._parseAccessibilityTree(root);
  }

  _parseAccessibilityTree(node, depth = 0) {
    const result = [];
    const indent = '  '.repeat(depth);
    const role = node.role?.value || 'unknown';
    const name = node.name?.value || '';
    const value = node.value?.value || '';
    
    if (name || role) {
      let line = `${indent}- ${role}`;
      if (name) line += ` "${name}"`;
      if (value && value !== name) line += ` [value: "${value}"]`;
      if (node.nodeId) line += ` [nodeId: ${node.nodeId}]`;
      result.push(line);
    }
    
    if (node.children) {
      for (const child of node.children) {
        result.push(...this._parseAccessibilityTree(child, depth + 1));
      }
    }
    return result.join('\n');
  }

  async click(selector) {
    // Get document node
    const { root } = await this.connection.send('DOM.getDocument', {}, this.sessionId);
    
    // Find element by selector
    const { nodeId } = await this.connection.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    }, this.sessionId);
    
    if (!nodeId) throw new Error(`Element not found: ${selector}`);
    
    // Get box model for coordinates
    const { model } = await this.connection.send('DOM.getBoxModel', { nodeId }, this.sessionId);
    const x = (model.content[0] + model.content[2]) / 2;
    const y = (model.content[1] + model.content[5]) / 2;
    
    await this.dispatchTap(x, y);
  }

  async fill(selector, value) {
    // Get document node
    const { root } = await this.connection.send('DOM.getDocument', {}, this.sessionId);
    
    // Find element by selector
    const { nodeId } = await this.connection.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    }, this.sessionId);
    
    if (!nodeId) throw new Error(`Element not found: ${selector}`);
    
    // Get box model for coordinates
    const { model } = await this.connection.send('DOM.getBoxModel', { nodeId }, this.sessionId);
    const x = (model.content[0] + model.content[2]) / 2;
    const y = (model.content[1] + model.content[5]) / 2;
    
    // Click to focus
    await this.dispatchTap(x, y);
    
    // Select all and type
    await this.connection.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 }, this.sessionId);
    await this.connection.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }, this.sessionId);
    await this.insertText(value);
  }

  async stop() {
    await this.connection.send('Page.stopScreencast', {}, this.sessionId).catch(() => {});
    this.connection?.close();
  }
}
