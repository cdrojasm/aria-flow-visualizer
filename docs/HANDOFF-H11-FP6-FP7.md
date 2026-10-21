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

## FP6 / F7.4 — UI implementada según contrato documentado

- `src/lib/api/agent.functions.ts` consume `GET /api/v0/agent/sessions/{id}/experiments?limit=50`, detalle `.../experiments/{experiment_id}`, y `.../audit?limit=50&cursor=...`. Tipos de experimento: ids de sesión/experimento, iteración, kind/status, pins `components` y `baseline_components` (component/entity_id/version/content_sha256), snapshot id/hash, objetivo/version, timestamps, `global_evaluation` (status/sample/metrics/delta/uncertainty/segments/constraints) y `error_code`. Auditoría: `items` con event_id/occurred_at/category/status/reason_code/duration_ms/cost_micros/specialist/tool y `next_cursor`. Sesión consume `lease.status/expires_at/heartbeat_at`.
- `AgentOptimizerPanel` presenta estado/expiración/heartbeat del lease, comparación de pins baseline/candidato y los agregados disponibles, eventos de auditoría y botón de paginación. La UI no expone datos libres ni filas de evaluación; la evidencia FP6 ausente se muestra como pendiente.
- `e2e/agent-optimizer-real.spec.ts` consulta las rutas de experimentos y auditoría con el usuario real y valida la estructura de la página, además del lease de la sesión iniciada y la presencia de las secciones UI. API requests del browser permanecen same-origin por `/api`; no hay mocks ni fulfill.

### Dependencias y verificación

- FP6 y F7.4 quedan **verificados contra el backend B conectado en el loop**. `make e2e-agent-global-pipeline-local` sembró una muestra madura local, entrenó baseline/candidato y evaluó la partición final; `make e2e-agent-h9-local` se amplió para abrir en el navegador la misma sesión optimizada y comprobar el experimento real y los eventos de auditoría que el loop persistió. La muestra era fixture sintético local, no datos productivos.
- Evidencia final del runner: estado `SUCCEEDED`; snapshot `0ad91115097e0b95582d328d04ddee23`, SHA-256 `2a7561e317d05f2b258984191ed0fac13fefb3721d73af028075948b2e602609`, partición `final`, política `evidence_only_v1`; baseline y candidato contienen pins de `configuration`, `library`, `model` y `vector_store`. El E2E valida métricas baseline/candidato, delta y `paired_bootstrap` con confianza 0.95; la UI presenta el status, ambos stacks, snapshot/hash y bootstrap pareado. El candidato sigue inactivo.
- La auditoría real devolvió y la UI presentó categorías `experiment`, `iteration`, `lease`, `session`, `specialist` y `tool`; la aserción visual cubre `session`, `iteration`, `tool`, `lease` y `experiment`. La lectura usa `GET /api/v0/agent/sessions/{id}/audit?limit=50&cursor=...` y la comparación `GET /api/v0/agent/sessions/{id}/experiments?limit=50`, same-origin por nginx, sin mocks/fulfill.
- Verificaciones exactas: `npx eslint --fix` y ESLint focalizado de `agent.functions.ts`, `AgentOptimizerPanel.tsx` y `agent-optimizer-real.spec.ts` pasaron; `npx tsc --noEmit` pasó; `python -m py_compile scripts/e2e_global_pipeline_local.py`, `node --check scripts/e2e_agent_h9_local.mjs` y `git diff --check` pasaron; `make e2e-agent-global-pipeline-local` pasó (3.000 elegibles, 286 filas etiquetadas en `final`); tras reconstruir frontend/API/workers con `make e2e-agent-h9-local`, la ejecución final `node scripts/e2e_agent_h9_local.mjs` pasó por nginx `http://localhost:80`. Comprobó comparación visible `SUCCEEDED`, ambos stacks y snapshot/hash/bootstrap pareado; lease real visible; auditoría real visible y dos páginas API distintas (`limit=1` con cursor); el resumen reportó `ui_experiment_rendered: true`, categorías reales y `candidate_active: false`. El target Make previo alcanzó el browser pero no concluyó por una espera prematura de UI; se ajustó la espera y se corrió el mismo script contra el stack ya reconstruido.
- El fixture no publicó segmentos protegidos (`published_segment_count: 0`); por tanto esta corrida verifica comparación global pareada, pins y auditoría, pero no ejercita el render por segmento ni el umbral específico 29/30. La unidad de evaluador cubre supresión bajo el mínimo. H11 puede considerarse integrado/verificado para la comparación global y la auditoría real solicitadas; esa limitación queda abierta para cobertura segmentada.
