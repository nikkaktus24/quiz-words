#!/bin/sh
set -e
API_URL="${API_URL:-}"
API_URL="${API_URL%/}"
ESCAPED=$(printf "%s" "$API_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__API_URL__="%s";\n' "$ESCAPED" > /usr/share/nginx/html/config.js
exec /docker-entrypoint.sh nginx -g "daemon off;"
