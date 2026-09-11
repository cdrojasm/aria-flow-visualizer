FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
ARG BUN_INSECURE_TLS=0
RUN if [ "$BUN_INSECURE_TLS" = "1" ]; then \
			NODE_TLS_REJECT_UNAUTHORIZED=0 bun install --frozen-lockfile; \
		else \
			bun install --frozen-lockfile; \
		fi
COPY . .
# Static SPA build (no SSR runtime): the built shell in dist/client is
# served directly by nginx below, at the container's own root path.
RUN STATIC=1 STATIC_BASE=/ bun run build:static

FROM nginx:alpine
COPY --from=builder /app/dist/client /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
