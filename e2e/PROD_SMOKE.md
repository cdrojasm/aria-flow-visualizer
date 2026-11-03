# Smoke E2E para un entorno desplegado (OKD / prod)

Prueba un despliegue **solo por HTTP**: sin docker, sin acceso al backend ni a la base de datos.
Inicia sesión con cada rol, recorre las pantallas, ejecuta las acciones que cada rol puede hacer
(crear objetos, leerlos, editarlos) y **borra todo al final**.

## Ejecutar

```bash
export ARIA_E2E_BASE_URL=https://<url-del-despliegue>
export E2E_MANAGER_EMAIL=...          E2E_MANAGER_PASSWORD=...
export E2E_CHANNEL_MANAGER_EMAIL=...  E2E_CHANNEL_MANAGER_PASSWORD=...
# también: RELEASE_MANAGER, DATA_ANALYST, FRAUD_ANALYST, OPS_ANALYST, FRAUD_REVIEWER
cd frontend_mockup && make test-e2e-prod-smoke
```

Los roles sin credenciales se saltan; los tests que dependen de ellos también.

## Qué cubre

| Spec | Contenido |
|---|---|
| `prod-smoke-real.spec.ts` | Salud, login/menú/páginas de cada rol (UI), matriz de permisos por rol (200 con permiso, 403 sin él), biblioteca completa (taxonomía → modus operandi → caso similar → flag), watchlist, tag, canal, escenario, plantilla de features. |
| `prod-smoke-features-real.spec.ts` | Catálogos, watchlists (elementos e importación CSV), datasets (vacío, subida por partes, carga directa, splits, extracción), simulación a dataset, modelos, vector stores, asistente (sesión, chat, todos los borradores), optimizador (lecturas, sesión crear/cancelar), lecturas de plataforma, alertas y cola. |

Todo lo creado lleva el prefijo `SMOKE-` (o `smoke_` en datasets). Cada test borra lo suyo en un
`finally`, y un barrido final elimina restos de corridas abortadas. Si algo no se pudo borrar, el
test falla y lista qué borrar a mano.

## Opt-in (apagado por defecto)

| Variable | Qué activa | Por qué es opt-in |
|---|---|---|
| `E2E_SKIP_LLM=1` | *Salta* el asistente | Cada mensaje/borrador consume LLM real. |
| `E2E_ALLOW_OPTIMIZER_RUN=1` | Inicia y pausa una sesión del optimizador | Gasta presupuesto de LLM. |
| `E2E_ALLOW_TRAINING=1` | Crea, entrena, puntúa y borra un modelo pequeño (nunca lo activa) | Usa el worker de entrenamiento. |
| `E2E_ALLOW_RESIDUE=1` | Crea una instancia de vector store y su generación | La API no permite borrar instancias: queda una `SMOKE-…`. |
| `E2E_ALLOW_SETTINGS_WRITE=1` | Reescribe ajustes operativos con los mismos valores | Deja registro en el historial de cambios. |
| `E2E_ALLOW_BACKUP=1` | Crea un respaldo | La API no permite borrarlo. |
| `E2E_ALLOW_TAKE_RELEASE=1` | Toma y libera una alerta real de la cola | Toca una alerta real un instante. |

## Lo que NO prueba (a propósito)

Acciones que cambian datos reales sin forma de deshacerlas por API: crear versiones de
configuración o solicitudes de deploy y aprobarlas, activar un modelo, resolver alertas, marcar
fraude (individual o masivo), aprobar/rechazar versiones del esquema de alertas, crear usuarios o
cambiar contraseñas, importar capacidad de analistas, crear test-runs (`/test-runs`,
`/alerts/test`), curar alertas a dataset, callbacks del voicebot y `/e2e/clean`.

## Supuestos del entorno

- El asistente puede estar deshabilitado; sus tests se saltan solos si los ajustes lo indican
  (solo `MANAGER`/`RELEASE_MANAGER` pueden leer esos ajustes: sin ellos se asume habilitado).
- El simulador necesita un worker activo: el test de escenarios espera hasta 2 minutos a que
  se emitan eventos.
- Corre con un solo worker de Playwright (`E2E_PLAYWRIGHT_WORKERS=1`, ya fijado en el target).

## Validación local

Contra el stack local (`make local-docker-run` en `backend`), con un usuario por rol creado en el
contenedor `aria-api` (ver la memoria `aria-local-auth-test-user`), todos los tests pasan.
