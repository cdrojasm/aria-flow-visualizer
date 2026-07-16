FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json .
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY server-node.mjs .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server-node.mjs"]
