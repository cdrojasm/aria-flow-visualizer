.PHONY: help build build-static deploy ensure-network run down logs shell

.DEFAULT_GOAL := help

# Podman is the default local runtime. Override both variables for Docker:
# make CONTAINER_ENGINE=docker COMPOSE="docker compose" run
CONTAINER_ENGINE ?= podman
COMPOSE ?= podman-compose
FRONTEND_PORT ?= 8080

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# nginx image serving the static SPA build (dist/client), proxying /api and
# /health to the backend api container - see nginx.conf.
build: ## Build static SPA image (nginx)
	$(COMPOSE) build

# Static deploy (GitHub Pages): SPA shell in dist/client, publish that dir
build-static: ## Build static SPA, publish to docs/ (GitHub Pages)
	$(CONTAINER_ENGINE) run --rm -v $(PWD):/app -v /app/node_modules -w /app oven/bun:1-alpine \
		sh -c "bun install --frozen-lockfile && bun run build:static"
	cp dist/client/index.html dist/client/404.html
	rm -rf docs && cp -R dist/client docs

deploy: build-static ## Build static SPA and push docs/ to GitHub Pages
	git add -A src docs
	git diff --cached --quiet && echo "Nothing to commit." || \
		git commit -m "Publish static build to docs/ for GitHub Pages"
	git push origin main

ensure-network: ## Create the shared backend network when it does not exist
	@$(CONTAINER_ENGINE) network inspect aria-net >/dev/null 2>&1 || $(CONTAINER_ENGINE) network create aria-net

run: ensure-network ## Start app in background
	FRONTEND_PORT=$(FRONTEND_PORT) $(COMPOSE) up -d

down: ## Stop app
	$(COMPOSE) down

logs: ## Tail app logs
	$(COMPOSE) logs -f web

shell: ## Shell into running app container
	$(COMPOSE) exec web sh
