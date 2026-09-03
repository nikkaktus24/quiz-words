#!/bin/sh
set -e
API_URL="${API_URL:-}"
API_URL="${API_URL%/}"
ESCAPED=$(printf "%s" "$API_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__API_URL__="%s";\n' "$ESCAPED" > /usr/share/nginx/html/config.js
if [ -z "$API_URL" ]; then
  echo "[quiz-words] warning: API_URL is empty; the UI will call /api on this same host" >&2
else
  echo "[quiz-words] UI API_URL=${API_URL}"
fi
exec /docker-entrypoint.sh nginx -g "daemon off;"
