#!/bin/bash
# Browser Handoff Automation Helper
# Usage: ./browser-automation.sh <sessionId> <action> [args...]
#
# All JSON is written to a temp file and passed to curl --data-json
# to avoid shell quoting issues with special characters in selectors/values.

set -e

SESSION="$1"
ACTION="$2"
shift 2

BASE_URL="https://browser-handoff.petartopic.com"

# Build JSON payload via heredoc to avoid all shell escaping issues
build_json() {
  cat
}

case "$ACTION" in
  # ── Session management ────────────────────────────────────────
  create)
    URL="${1:-https://example.com}"
    DEVICE="${2:-desktop}"
    curl -s -X POST "$BASE_URL/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"url\":\"$URL\",\"device\":\"$DEVICE\"}"
    ;;

  # ── Navigation ────────────────────────────────────────────────
  navigate)
    URL="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg url "$URL" '{action: "navigate", url: $url}')"
    ;;

  back)
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"back"}'
    ;;

  reload)
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"reload"}'
    ;;

  # ── Search ─────────────────────────────────────────────────────
  search)
    QUERY="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg query "$QUERY" '{action: "search", query: $query}')"
    ;;

  # ── Interaction ────────────────────────────────────────────────
  click)
    SELECTOR="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" '{action: "click", selector: $sel}')"
    ;;

  fill)
    SELECTOR="$1"
    VALUE="$2"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" --arg val "$VALUE" '{action: "fill", selector: $sel, value: $val}')"
    ;;

  type)
    TEXT="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg txt "$TEXT" '{action: "type", text: $txt}')"
    ;;

  tap)
    X="$1"
    Y="$2"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"tap\",\"x\":$X,\"y\":$Y}"
    ;;

  scroll)
    X="${1:-0}"
    Y="${2:-0}"
    DELTAY="${3:-100}"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"scroll\",\"x\":$X,\"y\":$Y,\"deltaY\":$DELTAY}"
    ;;

  scrollIntoView)
    SELECTOR="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" '{action: "scrollIntoView", selector: $sel}')"
    ;;

  key)
    KEY_NAME="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg key "$KEY_NAME" '{action: "key", key: $key}')"
    ;;

  # ── Query ──────────────────────────────────────────────────────
  url)
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"getUrl"}'
    ;;

  title)
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"getTitle"}'
    ;;

  getText)
    SELECTOR="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" '{action: "getText", selector: $sel}')"
    ;;

  getAttribute)
    SELECTOR="$1"
    ATTR="$2"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" --arg attr "$ATTR" '{action: "getAttribute", selector: $sel, attr: $attr}')"
    ;;

  isVisible)
    SELECTOR="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" '{action: "isVisible", selector: $sel}')"
    ;;

  evaluate)
    EXPRESSION="$1"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg expr "$EXPRESSION" '{action: "evaluate", expression: $expr}')"
    ;;

  snapshot)
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"snapshot"}'
    ;;

  # ── Waiting ────────────────────────────────────────────────────
  wait)
    TIMEOUT="${1:-10000}"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --argjson timeout "$TIMEOUT" '{action: "waitForLoad", timeout: $timeout}')"
    ;;

  waitForSelector)
    SELECTOR="$1"
    TIMEOUT="${2:-15000}"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" --argjson timeout "$TIMEOUT" '{action: "waitForSelector", selector: $sel, timeout: $timeout}')"
    ;;

  waitForElementClickable)
    SELECTOR="$1"
    TIMEOUT="${2:-15000}"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" --argjson timeout "$TIMEOUT" '{action: "waitForElementClickable", selector: $sel, timeout: $timeout}')"
    ;;

  # ── Convenience / multi-step ───────────────────────────────────
  "addToCart")
    # Click add-to-cart button using common selectors
    SELECTOR="${1:-button.add-to-cart, .add-to-cart, [class*=add-to-cart], .btn-add-cart, .cart-btn, .u-kosaricu}"
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg sel "$SELECTOR" '{action: "click", selector: $sel}')"
    ;;

  "getProductInfo")
    # Evaluate to get product name and price from common selectors
    curl -s -X POST "$BASE_URL/session/$SESSION/automation" \
      -H "Content-Type: application/json" \
      -d '{"action":"evaluate","expression":"JSON.stringify({name: document.querySelector(\"h1, .product-name, .product-title\")?.textContent?.trim() || \"\", price: document.querySelector(\".price, .product-price, [class*=price]\")?.textContent?.trim() || \"\"})"}'
    ;;

  *)
    echo "Unknown action: $ACTION" >&2
    echo "" >&2
    echo "Usage: $0 <sessionId> <action> [args...]" >&2
    echo "" >&2
    echo "Session management:" >&2
    echo "  create <url> [desktop|mobile]  Create a new session" >&2
    echo "" >&2
    echo "Navigation:" >&2
    echo "  navigate <url>                Navigate to URL" >&2
    echo "  back                          Go back" >&2
    echo "  reload                         Reload page" >&2
    echo "  search <query>                 Search using site search" >&2
    echo "" >&2
    echo "Interaction:" >&2
    echo "  click <selector>              Click element by CSS selector" >&2
    echo "  fill <selector> <value>       Fill input field" >&2
    echo "  type <text>                   Type text at cursor" >&2
    echo "  tap <x> <y>                   Tap at coordinates" >&2
    echo "  scroll [x] [y] [deltaY]       Scroll page" >&2
    echo "  scrollIntoView <selector>     Scroll element into view" >&2
    echo "  key <name>                    Press key (Enter|Tab|Escape|Backspace)" >&2
    echo "" >&2
    echo "Query:" >&2
    echo "  url                           Get current URL" >&2
    echo "  title                         Get page title" >&2
    echo "  getText <selector>            Get element text content" >&2
    echo "  getAttribute <selector> <attr> Get element attribute" >&2
    echo "  isVisible <selector>          Check if element is visible" >&2
    echo "  evaluate <expression>         Run JavaScript" >&2
    echo "  snapshot                      Get accessibility tree" >&2
    echo "" >&2
    echo "Waiting:" >&2
    echo "  wait [timeout]                Wait for page load (default 10000ms)" >&2
    echo "  waitForSelector <selector> [timeout] Wait for element (default 15000ms)" >&2
    echo "  waitForElementClickable <selector> [timeout] Wait for clickable (default 15000ms)" >&2
    echo "" >&2
    echo "Convenience:" >&2
    echo "  addToCart [selector]          Click add-to-cart button" >&2
    echo "  getProductInfo                Get product name and price" >&2
    exit 1
    ;;
esac
