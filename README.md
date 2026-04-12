# Browser Handoff Service

A self-hosted browser handoff service with automation API. Stream a headless browser to your phone/laptop and interact with it via touch/mouse, or control it programmatically.

## Features

- **Human Handoff:** Stream browser to mobile/desktop web UI
- **Automation API:** Control browser programmatically via REST API
- **Hybrid Mode:** Agent sets up, human completes (payment, 2FA)
- **Device Modes:** Mobile (390×844, touch) and Desktop (1280×720, mouse)
- **Persistent Sessions:** Cart state maintained across interactions

## Quick Start

```bash
# Create a session
curl -X POST "https://browser-handoff.petartopic.com/sessions" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "device": "desktop"}'

# Open the handoffUrl on your device to interact with the browser
```

## Automation API

```bash
# Get current URL
curl -X POST "https://browser-handoff.petartopic.com/session/$TOKEN/automation" \
  -H "Content-Type: application/json" \
  -d '{"action":"getUrl"}'

# Fill a form
curl -X POST "https://browser-handoff.petartopic.com/session/$TOKEN/automation" \
  -H "Content-Type: application/json" \
  -d '{"action":"fill","selector":"input[name=email]","value":"user@example.com"}'

# Click a button
curl -X POST "https://browser-handoff.petartopic.com/session/$TOKEN/automation" \
  -H "Content-Type: application/json" \
  -d '{"action":"click","selector":"button.submit"}'

# Run JavaScript
curl -X POST "https://browser-handoff.petartopic.com/session/$TOKEN/automation" \
  -H "Content-Type: application/json" \
  -d '{"action":"evaluate","expression":"document.querySelector(\".price\").innerText"}'
```

## Available Actions

| Action | Description |
|--------|-------------|
| `navigate` | Go to URL |
| `tap` | Tap/click at coordinates |
| `click` | Click element by selector |
| `fill` | Fill input field |
| `type` | Insert text |
| `scroll` | Scroll page |
| `key` | Press key (Enter, Tab, Escape, Backspace) |
| `getUrl` | Get current URL |
| `getTitle` | Get page title |
| `evaluate` | Run JavaScript |
| `snapshot` | Get accessibility tree |
| `back` | Go back |
| `reload` | Reload page |

## Deployment

This service is deployed on Coolify:

- **App:** `live-browser-handoff-stack`
- **UUID:** `scsgsw4wc8ow8c4g0w8so4s0`
- **Domain:** `https://browser-handoff.petartopic.com`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8787 | Server port |
| `CDP_HTTP_URL` | `http://127.0.0.1:9222` | Chrome CDP endpoint |
| `SESSION_SECRET` | `change-me` | JWT signing secret |
| `MOBILE_WIDTH` | 390 | Mobile viewport width |
| `MOBILE_HEIGHT` | 844 | Mobile viewport height |
| `DESKTOP_WIDTH` | 1280 | Desktop viewport width |
| `DESKTOP_HEIGHT` | 720 | Desktop viewport height |
| `SCREENCAST_QUALITY` | 85 | JPEG quality (mobile) |
| `DESKTOP_SCREENCAST_QUALITY` | 70 | JPEG quality (desktop) |

## Architecture

```
┌─────────────────────────────────────┐
│         Single Container            │
│  ┌─────────────────────────────┐   │
│  │      supervisord            │   │
│  │  ┌────────┐  ┌───────────┐  │   │
│  │  │Chrome  │  │  Handoff  │  │   │
│  │  │:9222   │  │  :80      │  │   │
│  │  │headless│  │  Node.js  │  │   │
│  │  └────────┘  └───────────┘  │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

- Chrome runs in headless mode with CDP on localhost:9222
- Handoff service connects to CDP and streams frames via WebSocket
- CDP is NOT exposed publicly - only accessible within the container

## Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Run with custom env
CDP_HTTP_URL=http://localhost:9222 npm start
```

## License

MIT
