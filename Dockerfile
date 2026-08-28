FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
# Static SPA build (no SSR runtime): the built shell in dist/client is
# served directly by nginx below, at the container's own root path.
RUN STATIC=1 STATIC_BASE=/ bun run build:static

FROM nginx:alpine
COPY --from=builder /app/dist/client /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
