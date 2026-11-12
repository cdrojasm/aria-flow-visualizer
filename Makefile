.PHONY: help build build-static deploy refresh-github-token run down logs shell test-web-prepare test-web-component-vector-store test-e2e-vector-store test-e2e-entities-advanced test-e2e-agent test-e2e-agent-optimizer test-e2e-capability-help test-e2e-prod-smoke

.DEFAULT_GOAL := help

# Override with `make CONTAINER_CMD=docker <target>` when needed.
CONTAINER_CMD ?= podman

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# nginx image serving the static SPA build (dist/client), proxying /api and
# /health to the backend api container - see nginx.conf.
build: ## Build static SPA image (nginx)
	$(CONTAINER_CMD) compose build

# Static deploy (GitHub Pages): SPA shell in dist/client, publish that dir
build-static: ## Build static SPA, publish to docs/ (GitHub Pages)
	$(CONTAINER_CMD) run --rm -v $(PWD):/app -v /app/node_modules -w /app oven/bun:1-alpine \
		sh -c "bun install --frozen-lockfile && bun run build:static"
	cp dist/client/index.html dist/client/404.html
	rm -rf docs && cp -R dist/client docs

deploy: build-static ## Build static SPA and push docs/ to GitHub Pages
	git add -A src docs
	git diff --cached --quiet && echo "Nothing to commit." || \
		git commit -m "Publish static build to docs/ for GitHub Pages"
	git push origin main

refresh-github-token: ## Replace the saved GitHub credential with a classic PAT
	@set -eu; \
	branch="$$(git branch --show-current)"; \
	remote="$$(git config --get "branch.$$branch.remote" || printf '%s' origin)"; \
	remote_url="$$(git remote get-url "$$remote")"; \
	case "$$remote_url" in \
		https://*) ;; \
		*) echo "Remote $$remote must use an HTTPS URL (found: $$remote_url)" >&2; exit 2;; \
	esac; \
	host="$${remote_url#https://}"; host="$${host%%/*}"; \
	old_credential="$$(printf 'protocol=https\nhost=%s\n\n' "$$host" | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null || true)"; \
	if [ -n "$$old_credential" ]; then \
		printf '%s\n' "$$old_credential" | git credential reject; \
		echo "Removed the existing credential for $$remote ($$host)."; \
	fi; \
	printf 'GitHub username: '; IFS= read -r username; \
	[ -n "$$username" ] || { echo "Username cannot be empty." >&2; exit 2; }; \
	printf 'New GitHub classic personal access token: '; \
	stty -echo; trap 'stty echo' EXIT HUP INT TERM; IFS= read -r token; stty echo; trap - EXIT HUP INT TERM; printf '\n'; \
	[ -n "$$token" ] || { echo "Token cannot be empty." >&2; exit 2; }; \
	printf 'protocol=https\nhost=%s\nusername=%s\npassword=%s\n\n' "$$host" "$$username" "$$token" | git credential approve; \
	unset token; \
	echo "Saved the new credential for $$username@$$host."

run: ## Start app in background
	$(CONTAINER_CMD) compose up -d

down: ## Stop app
	$(CONTAINER_CMD) compose down

logs: ## Tail app logs
	$(CONTAINER_CMD) compose logs -f web

test-web-prepare: ## Install the locked npm test tooling after a Bun install
	npm ci --legacy-peer-deps

test-web-component-vector-store: test-web-prepare ## Run Vector Store component tests
	npm run test:web:component

test-e2e-vector-store: test-web-prepare ## Run Vector Store browser workflow tests
	npm run test:e2e -- vector-store

test-e2e-entities-advanced: ## Run advanced real API E2E for nested entities and vector stores via nginx localhost
	@test -n "$(E2E_BOOTSTRAP_TOKEN)" || (echo "ERROR: set E2E_BOOTSTRAP_TOKEN for local E2E user provisioning"; exit 1)
	@$(MAKE) -C ../backend local-api-build
	@$(MAKE) down
	@$(MAKE) run
	E2E_BOOTSTRAP_TOKEN=$(E2E_BOOTSTRAP_TOKEN) npm run test:e2e:entities:advanced:real

test-e2e-agent: ## Run the real assistant chat and draft confirmation E2E through nginx localhost
	@set -eu; \
	while ! mkdir /tmp/aria-e2e.lock 2>/dev/null; do sleep 5; done; \
	cleanup() { \
		$(MAKE) down >/dev/null 2>&1 || true; \
		$(MAKE) -C ../frontend_mockup run >/dev/null 2>&1 || true; \
		rmdir /tmp/aria-e2e.lock; \
	}; \
	trap cleanup EXIT INT TERM; \
	$(MAKE) build; \
	$(MAKE) -C ../frontend_mockup down; \
	$(MAKE) run; \
	npm run test:e2e:agent:real

test-e2e-agent-optimizer: ## Run real FP4/FP5 optimizer E2E against nginx localhost
	npm run test:e2e:agent:optimizer:real

test-e2e-capability-help: ## Run contextual capability help E2E through nginx with one Playwright worker
	@set -euo pipefail; \
	lock=/tmp/aria-e2e.lock; \
	while ! mkdir "$$lock" 2>/dev/null; do sleep 2; done; \
	trap 'rmdir "$$lock"' EXIT INT TERM; \
	$(MAKE) build; \
	$(MAKE) run; \
	E2E_PLAYWRIGHT_WORKERS=1 npm run test:e2e -- capability-help-real

shell: ## Shell into running app container
	$(CONTAINER_CMD) compose exec web sh


.PHONY: local-deps local-build local-run local-down
local-deps: ## Install frontend dependencies once into persistent local Docker volumes
	$(CONTAINER_CMD) compose -f docker-compose.local.yml run --rm --no-deps builder "bun install --frozen-lockfile"

local-build: ## Build the local static frontend using cached dependencies
	$(CONTAINER_CMD) compose -f docker-compose.local.yml run --rm --no-deps builder "STATIC=1 STATIC_BASE=/ bun run build:static"

local-run: local-build ## Build changed frontend code and serve the shared dist folder with nginx
	$(CONTAINER_CMD) compose -f docker-compose.local.yml up -d web

local-down: ## Stop the local nginx frontend
	$(CONTAINER_CMD) compose -f docker-compose.local.yml down

test-e2e-prod-smoke: ## Pide credenciales por rol y ejecuta una vez el smoke E2E contra el entorno desplegado
	@bash scripts/test-e2e-prod-smoke.sh
