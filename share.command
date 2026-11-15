#!/bin/zsh
# ============================================================
#  PIXEL FORTUNE — public share launcher
#
#  Double-click this file to start the game and publish it to a
#  public https link you can send to anyone on the internet.
#
#  Leave the Terminal window open while people are playing.
#  Press Ctrl+C (or close the window) to take it offline.
# ============================================================

set -u
cd "$(dirname "$0")" || exit 1

PORT=8123
LOCAL_URL="http://127.0.0.1:$PORT"
TOOLS_DIR="$HOME/.pixel-fortune"
CF="$TOOLS_DIR/cloudflared"
SERVER_PID=""
TUNNEL_PID=""

cleanup() {
  echo ""
  echo "• Shutting down Pixel Fortune's public link..."
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -f "$LOG" 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# ---------- 1. Local web server ----------
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "• Local web server already running on port $PORT"
else
  echo "• Starting local web server on port $PORT"
  ruby -rwebrick -e '
    root = Dir.pwd
    server = WEBrick::HTTPServer.new(
      Port: 8123,
      BindAddress: "127.0.0.1",
      Logger: WEBrick::Log.new(File::NULL),
      AccessLog: []
    )
    server.mount_proc("/") do |req, res|
      path = File.join(root, req.path)
      path = File.join(path, "index.html") if File.directory?(path)
      if File.file?(path)
        res.status = 200
        res["Content-Type"] = WEBrick::HTTPUtils.mime_type(path, WEBrick::HTTPUtils::DefaultMimeTypes)
        res["Cache-Control"] = "no-store, no-cache, must-revalidate"
        res.body = File.binread(path)
      else
        res.status = 404
        res.body = "not found"
      end
    end
    trap("INT") { server.shutdown }
    server.start
  ' &
  SERVER_PID=$!
  sleep 1
fi

# ---------- 2. Cloudflare tunnel client ----------
if [ ! -x "$CF" ]; then
  mkdir -p "$TOOLS_DIR"
  case "$(uname -m)" in
    arm64)  PKG="cloudflared-darwin-arm64.tgz" ;;
    x86_64) PKG="cloudflared-darwin-amd64.tgz" ;;
    *) echo "✗ Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
  esac
  echo "• Downloading the tunnel client (first run only, ~40 MB)..."
  if ! curl -fsSL --max-time 180 -o "$TOOLS_DIR/cf.tgz" \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/$PKG"; then
    echo "✗ Download failed. Check your internet connection and try again."
    cleanup
  fi
  tar xzf "$TOOLS_DIR/cf.tgz" -C "$TOOLS_DIR" || { echo "✗ Could not unpack the tunnel client."; cleanup; }
  rm -f "$TOOLS_DIR/cf.tgz"
  chmod +x "$CF"
fi

# ---------- 3. Publish ----------
LOG="$(mktemp -t pf-tunnel)"
echo "• Opening a public link..."
"$CF" tunnel --url "$LOCAL_URL" --no-autoupdate > "$LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in {1..60}; do
  PUBLIC_URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$PUBLIC_URL" ] && break
  sleep 0.5
done

if [ -z "$PUBLIC_URL" ]; then
  echo "✗ Could not get a public link. See the log below:"
  tail -20 "$LOG"
  cleanup
fi

printf '%s\n' "$PUBLIC_URL" > .share-url.txt

echo ""
echo "============================================================"
echo "   PIXEL FORTUNE IS LIVE"
echo ""
echo "   $PUBLIC_URL"
echo ""
echo "   Send that link to anyone — any device, any network."
echo "   Keep this window open while they play."
echo "   Press Ctrl+C to take it offline."
echo "============================================================"
echo ""

wait "$TUNNEL_PID"
cleanup
