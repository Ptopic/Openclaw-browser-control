#!/bin/bash
# Browser Handoff Automation Helper
# Usage: ./browser-automation.sh <token> <action> [args...]

TOKEN="$1"
ACTION="$2"
shift 2

BASE_URL="https://browser-handoff.petartopic.com"

case "$ACTION" in
  navigate)
    URL="$1"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"navigate\",\"url\":\"$URL\"}"
    ;;
  tap)
    X="$1"
    Y="$2"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"tap\",\"x\":$X,\"y\":$Y}"
    ;;
  click)
    SELECTOR="$1"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"click\",\"selector\":\"$SELECTOR\"}"
    ;;
  fill)
    SELECTOR="$1"
    VALUE="$2"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"fill\",\"selector\":\"$SELECTOR\",\"value\":\"$VALUE\"}"
    ;;
  type)
    TEXT="$1"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"type\",\"text\":\"$TEXT\"}"
    ;;
  scroll)
    X="$1"
    Y="$2"
    DELTAY="${3:-0}"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"scroll\",\"x\":$X,\"y\":$Y,\"deltaY\":$DELTAY}"
    ;;
  snapshot)
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"snapshot"}'
    ;;
  url)
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"getUrl"}'
    ;;
  title)
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"getTitle"}'
    ;;
  reload)
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"reload"}'
    ;;
  back)
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"back"}'
    ;;
  wait)
    TIMEOUT="${1:-10000}"
    curl -s -X POST "$BASE_URL/session/$TOKEN/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"waitForLoad\",\"timeout\":$TIMEOUT}"
    ;;
  create)
    URL="$1"
    DEVICE="${2:-desktop}"
    curl -s -X POST "$BASE_URL/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"$URL\",\"device\":\"$DEVICE\"}"
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Available actions: navigate, tap, click, fill, type, scroll, snapshot, url, title, reload, back, wait, create"
    exit 1
    ;;
esac
