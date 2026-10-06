FROM oven/bun:1.3.14-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.ts db.ts ai.ts import.ts tsconfig.json ./

ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000

CMD ["bun", "index.ts"]
