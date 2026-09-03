#!/bin/sh
# Runs from the nginx image entrypoint (before nginx starts), even when
# Portainer leaves the default command as `nginx`.
API_URL="${API_URL:-}"
API_URL="${API_URL%/}"
ESCAPED=$(printf "%s" "$API_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__API_URL__="%s";\n' "$ESCAPED" > /usr/share/nginx/html/config.js
echo "[quiz-words] wrote config.js API_URL='${API_URL}'"
