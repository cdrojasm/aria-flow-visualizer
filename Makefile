.PHONY: help build build-ssr build-static run down logs shell

.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build SSR image
	docker compose build

# SSR deploy: docker image running node server (dist/server + dist/client)
build-ssr: ## Build SSR image (same as build)
	docker compose build

# Static deploy (GitHub Pages): SPA shell in dist/client, publish that dir
build-static: ## Build static SPA, publish to docs/ (GitHub Pages)
	docker run --rm -v $(PWD):/app -v /app/node_modules -w /app oven/bun:1-alpine \
		sh -c "bun install --frozen-lockfile && bun run build:static"
	cp dist/client/index.html dist/client/404.html
	rm -rf docs && cp -R dist/client docs

run: ## Start app in background
	docker compose up -d

down: ## Stop app
	docker compose down

logs: ## Tail app logs
	docker compose logs -f app

shell: ## Shell into running app container
	docker compose exec app sh
