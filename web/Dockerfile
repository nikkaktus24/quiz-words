FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN bun run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /quiz-entrypoint.sh
RUN chmod +x /quiz-entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["/quiz-entrypoint.sh"]
