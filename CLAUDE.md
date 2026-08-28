# frontend_mockup — testing/deploy convention for Claude

TanStack Start (React/Vite) static SPA for ARIA — no SSR, no server
functions. All data calls are plain browser `fetch`s from
`src/lib/api/*.functions.ts` (via `src/lib/api/client.ts`) straight to
the backend API, proxied by nginx. Companion repo: `../backend`
(aria-api), see its `CLAUDE.md` for the API side.

## Always test a frontend change through the real nginx deploy

Before reporting a frontend change done, deploy it and check it in the
browser through the **nginx docker stack** — not a bare `vite dev` /
`bun run dev` process. The user cannot see a plain dev server started
inside a sandboxed shell (its ports aren't reachable from their real
browser), and dev-mode also skips the static-build step (and nginx's
`/api` proxying) that production actually runs on.

```
make build   # docker compose build — nginx image serving dist/client, proxying /api and /health to the backend
make run     # docker compose up -d — web (nginx, :80)
```

Then point the user at `http://localhost/<route>`, e.g.
`http://localhost/configuracion`. Tear down with `make down`; tail logs
with `make logs`; shell in with `make shell`.

`web` (nginx) proxies `/api/*` and `/health` to the backend's `api`
service over the external `aria-net` docker network
(`docker-compose.yml`, see `nginx.conf`) — the backend's compose stack
must be up on that network too. If you only need a fast type/lint check
(not a visual check), `npx tsc --noEmit` / `npx eslint .` are fine as a
pre-check, but they don't replace the `make build && make run` visual
pass before calling a UI change done.

If running any dev-server or docker command via an agent's shell tool,
make sure it isn't sandboxed/network-isolated from the user's machine —
otherwise the deployed port won't actually be reachable to check.
