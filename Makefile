.PHONY: build build-ssr build-static run down logs shell

build:
	docker compose build

# SSR deploy: docker image running node server (dist/server + dist/client)
build-ssr:
	docker compose build

# Static deploy (GitHub Pages): SPA shell in dist/client, publish that dir
build-static:
	docker run --rm -v $(PWD):/app -v /app/node_modules -w /app oven/bun:1-alpine \
		sh -c "bun install --frozen-lockfile && bun run build:static"
	cp dist/client/index.html dist/client/404.html

run:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f app

shell:
	docker compose exec app sh
