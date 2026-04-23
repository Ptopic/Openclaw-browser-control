# Openclaw Browser — Stealth

Stealth Chrome variant for [Openclaw-browser-control](https://github.com/Ptopic/Openclaw-browser-control).
Uses `puppeteer-extra` + `puppeteer-extra-plugin-stealth` to launch a Chromium instance
with anti-detection patches applied automatically.

## Quick Start

```bash
# Build
cd browser
docker build -t openclaw-stealth .

# Run (CDP on port 9222)
docker run -d --name openclaw-stealth \
  -p 9222:9222 \
  openclaw-stealth

# Verify
curl http://localhost:9222/json/version
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CDP_PORT` | `9222` | CDP debugging port |
| `VIEWPORT_WIDTH` | `1920` | Browser viewport width |
| `VIEWPORT_HEIGHT` | `1080` | Browser viewport height |
| `START_URL` | `about:blank` | Page to load on startup |
| `USER_AGENT` | *(browser default)* | Custom User-Agent string |

## Attaching agent-browser

Once running, attach the Openclaw agent-browser CLI:

```bash
agent-browser --cdp http://localhost:9222 <command>
```

## Stealth Features

- `puppeteer-extra-plugin-stealth` — patches navigator.webdriver, chrome.runtime, permissions, iframe ContentWindow, media codecs, and more
- Extra Chrome flags: `--disable-blink-features=AutomationControlled`, `--blink-settings=isOnHeadlessHistoricalMode=true`
- Randomized viewport and platform spoofing

## Comparing with Standard Chrome

| | Standard (supervisord) | Stealth (this) |
|---|---|---|
| Base | chrome-headless-shell | node + puppeteer-extra |
| Stealth patches | ❌ | ✅ via stealth plugin |
| Automation flags | ❌ | ✅ `--disable-blink-features=AutomationControlled` |
| CDN/npm deps | ❌ | ✅ puppeteer + stealth plugin |
| Coolify integration | Via existing container | New separate deployment |
