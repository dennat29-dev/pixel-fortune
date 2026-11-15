#!/bin/zsh
cd "$(dirname "$0")" || exit 1

PORT=8123
URL="http://127.0.0.1:$PORT/index.html"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Pixel Fortune is already running at $URL"
  open "$URL"
  exit 0
fi

echo "Starting Pixel Fortune at $URL"
echo "Press Ctrl+C to stop the server."
echo

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
PID=$!

trap 'kill $PID 2>/dev/null' INT TERM EXIT

sleep 0.8
open "$URL"
wait $PID
