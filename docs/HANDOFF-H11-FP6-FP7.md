# HANDOFF — H11 FP6 / FP7

## Base

- Worktree frontend: `feat/agent-A-fp4-fp5`, actualizado con `728e939` mediante cherry-pick (`c948593`).
- Backend revisado: contiene `94c2f9e`, `242ff24` y `42a091c`.
- Para la verificación final se reconstruyó y levantó el stack del worktree
  bajo `/tmp/aria-e2e.lock`; el lock y el puerto 80 quedaron liberados al
  terminar.

## Cambios de frontend

- `src/lib/api/agent.functions.ts`: completa el tipo de paquete con campos ya presentes en la API (`content_hash`, `created_at`, `sealed_at`). No añade tipos para evaluación, auditoría ni lease.
- `src/components/agent/AgentOptimizerPanel.tsx`: conserva la lista como historial de sesiones, muestra creación/última actualización y fecha de registro de experimentos usando respuestas existentes.
- `e2e/agent-optimizer-real.spec.ts`: el flujo E2E real verifica que se presenta el historial y su marca de tiempo. Mantiene llamadas reales a `/api`; no se simulan respuestas.

## Contratos existentes revisados

`/api/v0/agent/sessions`, `/{id}`, `/{id}/iterations`, `/{id}/packages`, `/{id}/budget`, `/{id}/summary` y los controles `start`, `pause`, `resume` y `cancel`. Las respuestas de errores de control incluyen códigos seguros como `SESSION_NOT_FOUND`, `SESSION_STATE` y `BUDGET_RENEWAL_POLICY`.

Los paquetes exponen estado, hash y número de iteración. Iteraciones exponen hipótesis, decisión, motivo, especialista y verificación. El presupuesto expone gasto y límites. `/summary` ya existe, pero su `content` es un diccionario sin esquema de evaluación documentado.

## FP6 — contrato documentado por B; integración frontend pendiente

Las rutas de experimentos ya existen, pero su respuesta actual todavía no publica la evidencia completa para comparar baseline y candidato con métricas globales y por segmento, incertidumbre, restricciones y cobertura/conteo de etiquetas. La API tampoco expone aún resultados y motivos normalizados para conservar o descartar cada cambio. No se debe derivar esto del contenido interno de paquetes.

El contrato está documentado por B en `backend/docs/handoff/HANDOFF-B.md`,
secciones “FP6: baseline y experimento, métricas e incertidumbre” y
“Reconciliación de evidencia y runner B3.3”. Las rutas son
`GET /sessions/{session_id}/experiments?limit=50` y
`GET /sessions/{session_id}/experiments/{experiment_id}`. `global_evaluation`
define `{status, sample, metrics, delta, uncertainty, segments, constraints}`;
incluye snapshot y cobertura madura, métricas globales agregadas de baseline y
candidato, deltas e intervalos bootstrap pareados al 95 %. Los segmentos por
debajo de `max(30, umbral del objetivo)` se omiten sin nombre ni conteo; las
restricciones tienen estado y valores agregados. La API actual aún no completa
la evidencia tipada descrita: B registra pendientes en la respuesta
`global_evaluation`, el runner común y su integración al loop. Por eso la UI no
implementa FP6 hasta que backend publique esas respuestas. No se añadieron tipos
cliente ni se cambiaron rutas.

El runner común y su integración al loop siguen pendientes en B. La propuesta
de tipos del panel deberá respetar el contrato documentado y sólo añadirse
cuando la API esté publicada.

## F7.4 — contrato documentado por B; integración frontend pendiente

- B documentó la lectura paginada de auditoría por sesión, con códigos y
  categorías/estados controlados, sin texto libre ni propietario del lease.
  La ruta backend ya existe (`GET /agent/sessions/{session_id}/audit` con
  `limit` y `cursor`, respuesta `{items, next_cursor}`); el loop aún no escribe
  eventos, así que la ruta no tendrá historial hasta conectar sus productores.
- `AgentSessionResponse` ya expone `lease: {status, expires_at, heartbeat_at}`;
  `heartbeat_at` es `null` hasta que el worker registre esa señal y el dueño
  interno no se serializa. La UI no implementa F7.4 hasta que backend publique
  respuestas con historial operativo. No se añadieron tipos cliente ni se
  cambiaron rutas.

## Validación ejecutada

- `npx tsc --noEmit`: pasó antes de dejar F7.4 en espera.
- `npx eslint src/lib/api/agent.functions.ts src/components/agent/AgentOptimizerPanel.tsx e2e/agent-optimizer-real.spec.ts`: pasó antes de dejar F7.4 en espera.
- `npm run lint`: se inició sobre todo el repositorio y se interrumpió tras quedar ejecutándose sin salida; ESLint focalizado pasó antes de dejar F7.4 en espera.
- No hay pruebas unitarias/componentes existentes específicas del optimizador.
- `npm run build`: pasó en este worktree. Vite 7.3.6 transformó 3.749 módulos
  de cliente en 12,56 s y 249 módulos SSR en 6,43 s; reportó advertencias de
  imports no usados de TanStack.
- Primera ejecución histórica de `make build`: Docker Desktop registró
  `node is not running` y `context deadline exceeded: driver not connecting`;
  la ejecución fue interrumpida con `Error 130`. En la repetición controlada,
  `make build` terminó normalmente y BuildKit reportó `DONE` en 7,4 s; Vite
  transformó 3.759 módulos. La imagen fue
  `aria-wt-a-fp4-fp5-frontend-web`, digest
  `sha256:e9027ac79a17a3348e83014dab4c6b0e9e7879ae5308e30ddb76eccd4f41e084`.
- Se tomó `/tmp/aria-e2e.lock` después de comprobar que no había otros procesos
  `docker compose`, Buildx ni Playwright activos. El nginx previo
  `frontend_mockup-web-1` se detuvo para liberar el puerto 80. `make run` inició
  `aria-wt-a-fp4-fp5-frontend-web-1`, verificado con `docker inspect` usando el
  digest anterior.
- Verificación del proxy antes del E2E: `GET http://localhost/health`
  respondió `{"status":"ok","component":"aria-api","version":"0.1.0"}`;
  `GET http://localhost/api/v0/agent/sessions` respondió `401` con
  `{"detail":"Bearer token required"}` desde nginx, confirmando el proxy al
  API real.
- Se actualizó el escenario para comparar las fechas de creación y última
  actualización visibles con `created_at` y `updated_at` devueltos por el
  `POST /start` real. No se simularon respuestas del API.
- Bajo el lock, `make test-e2e-agent-optimizer` terminó con Playwright **1
  passed (21.7s)**; escenario `FP4/FP5 real: revisión, inicio, presupuesto,
  pausa, conversación y cancelación` pasó en 11,2 s. Salida completa guardada
  en `/private/tmp/aria-h11-playwright-final.log`.
- El target `make test-e2e-agent-optimizer` solo ejecuta Playwright según el
  Makefile actual; la reconstrucción/despliegue se hizo antes con `make build`
  y `make run`.
- `make down` y `rmdir /tmp/aria-e2e.lock` finalizaron la sesión. Verificación
  posterior: `lsof -nP -iTCP:80 -sTCP:LISTEN` no devolvió procesos; `find /tmp
  -maxdepth 1 -name 'aria-e2e*' -print` no encontró locks. El contenedor previo
  `frontend_mockup-web-1` permanece detenido. El backend de API quedó activo.

FP6 y F7.4 ya no están pendientes de acuerdo de contrato: B los documentó en
`backend/docs/handoff/HANDOFF-B.md`. La implementación frontend permanece
pendiente hasta que backend publique la evidencia FP6 completa e integre el
runner al loop, y hasta que el historial F7.4 tenga eventos producidos por el
loop. No se fijaron tipos cliente de evaluación, auditoría o lease.
