# OpenClaw Browser Handoff

A self-hosted browser handoff service. Stream a headless Chromium to a web UI for human interaction, or control it programmatically via CDP.

## Purpose

- **Human handoff:** Stream browser to mobile/desktop web UI for manual interaction
- **Automation:** Use [agent-browser](https://github.com/vercel-labs/agent-browser) with `--cdp http://browser:9223` for programmatic control
- **Parallel subagents:** Multiple subagents can share the same Chromium session via CDP for fast parallel automation

## Quick Start

```bash
# 1. Create a session (returns handoffUrl for human, sessionId for automation)
curl -X POST "https://browser-handoff.petartopic.com/sessions" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 2a. Human handoff: open handoffUrl in browser

# 2b. Automation: connect agent-browser to CDP
agent-browser --session my-task --cdp http://browser:9223 open "https://example.com"
agent-browser --session my-task --cdp http://browser:9223 wait --load networkidle
agent-browser --session my-task --cdp http://browser:9223 snapshot -i --json
```

## CDP Endpoint

- **Internal URL:** `http://browser:9223` (from within Coolify container network)
- **Automation:** All browser actions via `agent-browser --cdp http://browser:9223`
- **No REST automation API** — all actions go through agent-browser

## Sessions API

```bash
POST /sessions
Body: {"url": "https://...", "device": "desktop|mobile"}
Response: {"sessionId": "...", "handoffUrl": "...", "expiresAt": ..., "pageUrl": "...", "device": "..."}
```

```bash
GET /session/:sessionId   # Serve handoff viewer HTML
POST /session/:sessionId/complete   # Mark session done
GET /health               # Health check
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Single Container               │
│  ┌──────────────────────────────────┐  │
│  │         supervisord              │  │
│  │  ┌─────────────┐ ┌────────────┐ │  │
│  │  │  Chromium   │ │  Handoff   │ │  │
│  │  │  :9222      │ │  :80       │ │  │
│  │  │  (CDP)      │ │  (sessions)│ │  │
│  │  └─────────────┘ └────────────┘ │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

- Chromium runs headless with CDP on `localhost:9222`
- Handoff service creates sessions and serves the viewer HTML
- CDP is NOT exposed publicly — only accessible as `http://browser:9222` within the container network

## Deployment

Deployed on Coolify:
- **App:** `browser-handoff-desktop` (UUID: `lchptv878crb40xb8mjb41xu`)
- **Repo:** `git@github.com:Ptopic/Openclaw-browser-control.git` (`single-container` branch)
- **Domain:** `https://desktop-handoff.petartopic.com`

## Development

```bash
npm install
npm start
```

## License

MIT
