FROM oven/bun:1.3.14-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY index.ts db.ts ai.ts tsconfig.json ./

ENV PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]

CMD ["bun", "index.ts"]
