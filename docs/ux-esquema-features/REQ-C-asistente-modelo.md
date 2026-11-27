# REQ-C: Asistente de entrenamiento de modelos (puente Variables → Modelo)

Origen: `backend/PENDIENTES.md` §15. Frontend-only; no cambia el contrato con el backend.
Archivos: `src/components/modelos/ModelTrainingWizard.tsx`, `ModelTrainingResults.tsx`,
`src/components/modelos/wizard/{trainingContract.ts,TrainingContractSummary.tsx}`,
`src/test/model-wizard-{contract,ui}.test.ts(x)`, `e2e/models-training-real.spec.ts`.

## 1. Resumen

- Se eliminó el bloque `hidden`/`aria-hidden` del paso "Variables" (panel antiguo de campos e
  historial, ~230 líneas) y sus handlers/estado huérfanos (`updateRecipe`, `addHistory`,
  `chooseField`, `query`, imports `Plus`/`Trash2`).
- **Se conservan** `features` e `history` (estado, validación y payload `feature_transforms` /
  `historical_features` de `createModel`): un borrador antiguo puede traerlos y el backend los
  sigue aceptando. Ya no se pueden crear ni editar desde la UI; la revisión los muestra como
  "Heredado de un borrador anterior" y, si hay agregados de importes, ofrece la confirmación de
  moneda (antes estaba oculta en el bloque legacy, lo que bloqueaba sin salida).
- **Historial configurado dos veces: NO es real dentro del asistente.** El paso 0 usa
  `HistoryMappingControls` y el paso 1 monta `FeatureRecipeWorkspace` con
  `showHistorySettings={false}`, por lo que el historial se configura una sola vez (paso 0). Nada
  que unificar en el asistente.
- Terminología: pasos "Datos y objetivo / **Variables** / XGBoost / Revisión"; mensajes y
  resultados dicen "variable" (no "característica/receta/mapping").
- Paso 0: el "Campo objetivo" sugiere (agrupa primero, no impone) las columnas que corresponden a
  campos del esquema activo con rol etiqueta, y avisa si el elegido no es etiqueta.
- Paso 3: resumen tipo contrato (N variables activas, pipeline por variable en chips, "Esquema vN",
  fugas y sensibles). Una fuga es un bloqueo en `blockers` (no se puede entrenar).
- Borrador local (`aria.model-training.draft.v1`) guarda `schemaVersion`; compatible con
  borradores sin ese campo. El asistente obtiene el esquema activo (react-query
  `["alertSchema","active"]`) y lo pasa a `FeatureRecipeWorkspace` como `schema={schema}`.

## 2. Requisitos

| ID | Dado / Cuando / Entonces |
|----|--------------------------|
| RC-1 | Dado el asistente abierto en el paso Variables, cuando se inspecciona el DOM, entonces no existe ningún nodo `aria-hidden` con "Buscar campos" ni "Características históricas" (panel legacy eliminado). |
| RC-2 | Dado que el paso Variables no es válido, cuando se muestra, entonces aparece `data-testid="wizard-variables-hint"` explicando qué falta (antes ese texto estaba oculto). |
| RC-3 | Dado un esquema activo con campos de rol etiqueta y un dataset elegido, cuando se abre "Campo objetivo", entonces las columnas equivalentes (por nombre, `field_name`, `field_ds_loc` o alias de mapeo) aparecen primero en el grupo "Sugeridos por el esquema (etiqueta)" como `N · etiqueta del esquema`, y el resto sigue disponible. |
| RC-4 | Dado un objetivo elegido que no es etiqueta en el esquema activo, cuando se selecciona, entonces aparece `target-not-label` ("… no es un campo de rol etiqueta en el esquema activo (vN)") sin bloquear. Con objetivo etiqueta, o sin esquema/sin etiquetas, no aparece. |
| RC-5 | Dado el paso Revisión, entonces se ve `contract-count` ("N variables de entrada activas"), una fila `contract-variable` por variable activa con chips de pasos en español (Seleccionar → Categorizar…) y `contract-schema-version` ("Esquema vN"). Variables desactivadas no cuentan. |
| RC-6 | Dado una variable activa de origen "current" cuyo paso/ruta resuelve a un campo del esquema con `featureGuard` = exclude (etiqueta o resultado de ARIA), cuando se revisa, entonces aparece `contract-leaks`, el texto "Fuga de datos: la variable “X” usa el campo “Y”…" figura en la lista de "No se puede entrenar todavía", y "Guardar borrador" / "Guardar y entrenar" quedan deshabilitados. |
| RC-7 | Dado una variable que usa un campo sensible (guard "warn"), entonces aparece `contract-sensitive` (aviso, no bloquea). |
| RC-8 | Dado un borrador guardado con `schemaVersion` distinto del esquema activo, entonces la revisión muestra el pin (p. ej. "Esquema v6"), `contract-schema-outdated` y el botón "Usar el esquema vigente" que actualiza el pin. |
| RC-9 | Dado un borrador antiguo sin `schemaVersion`, cuando carga, entonces se restaura sin error y adopta la versión activa (se persiste en el siguiente guardado local). |
| RC-10 | Se mantiene: guardar borrador, guardar y entrenar, reintentar entrenamiento, split temporal/estratificado, validación de parámetros, "Reiniciar" (limpia también el pin). |

## 3. Selectores estables

- Pasos: `nav[aria-label="Pasos del entrenamiento"]` con botones "Datos y objetivo", "Variables", "XGBoost", "Revisión" (`aria-current="page"` en el activo; no son `role=tab`).
- Nombre: placeholder `xgboost-historico-v1`. Dataset: `select` con opción "Selecciona un dataset".
- Objetivo: `data-testid="target-select"` / `aria-label="Campo objetivo"`; opciones sugeridas `data-testid="target-suggested"`; aviso `data-testid="target-not-label"`.
- Variables: `data-testid="wizard-variables-hint"`.
- Revisión: `training-contract`, `contract-count`, `contract-schema-version`, `contract-schema-outdated`, `contract-variable`, `contract-leaks`, `contract-sensitive`, `contract-legacy`; bloque de bloqueos `role=alert` con "No se puede entrenar todavía".
- Botones: "Continuar", "Anterior", "Reiniciar", "Guardar borrador", "Guardar y entrenar", "Volver a modelos", "Reintentar entrenamiento".
- Resultados (`ModelTrainingResults`): pestañas "Variables" y "Ejecución y configuración", título "Configuración persistida" (antes "Características", "Ejecución y receta", "Receta persistida").

## 4. Escenario E2E (UI real, `/modelos`)

1. Login data_analyst, `/modelos` → "Nuevo modelo". Esperado: drawer "Crear y entrenar modelo" con los 4 pasos nombrados arriba; paso 1 de 4.
2. Paso 1: escribir nombre; elegir dataset subido. Esperado: "Campo objetivo" lista `marcacion_final`; si el esquema activo tiene etiqueta, `target-suggested` presente y "channel" sigue en la lista.
3. Elegir "channel". Esperado (si hay etiqueta en el esquema): `target-not-label` con `vN` del esquema activo. Elegir `marcacion_final`: el aviso desaparece, aparecen las clases (`risk`, `risk-suspected`).
4. (Implementado en el spec hasta aquí; el spec no guarda ni entrena desde la UI.) Marcar positivos y "Continuar". Esperado: paso Variables con el workspace de B; mientras no haya variable activa validada, "Continuar" deshabilitado y `wizard-variables-hint` visible.
5. Crear una variable (UI de B, ver REQ-B) y "Validar y calcular"; "Continuar" → XGBoost; confirmar fechas y "Continuar" → Revisión. Esperado: `contract-count` = nº de variables activas, chips de pasos, "Esquema vN" = versión activa.
6. Crear una variable sobre el campo etiqueta (p. ej. ruta `marcacion_final`). Esperado: `contract-leaks`, bloqueo listado, botones de guardado deshabilitados. Quitarla: se habilitan.
7. Cerrar (el borrador queda en localStorage con `schemaVersion`); reabrir: se restaura en el mismo paso.

Los pasos 4-7 **no están automatizados en el spec**: dependen de la UI de B (crear/validar una variable) y de un entrenamiento largo que el spec actual hace por API. Los cubre vitest (`src/test/model-wizard-ui.test.tsx`) con el workspace simulado; el orquestador debe ejecutarlos manualmente o ampliar el spec cuando existan los selectores de B.

## 5. Datos / fixtures

- Dataset: `scripts/prepare_e04_dataset_partitions.py` genera `/private/tmp/aria-e04-partitions/e04_actual_sanitized_100.csv` (campos `marcacion_final`, `eventtype`, `channel`, `amount_value`, `biocatch_score`; positivos `risk`, `risk-suspected`). Ejecutar con `npm run test:e2e:models:real` (reconstruye `web`, prepara el CSV).
- Esquema activo en el backend local: para ver RC-3/RC-4 debe tener un campo con `is_label` y sin `is_history` (el spec lee `/api/v0/alert-schema/active` y solo aserta lo dependiente del esquema si hay etiqueta).
- Usuario: el spec aprovisiona `e05-models-e2e@example.com` (data_analyst) con `make local-auth-up`; manager opcional (`E2E_MANAGER_EMAIL/PASSWORD`).

## 6. Fuera de alcance, decisiones y deuda

- **Pendiente de integración con B:** la prop `schema?: AlertSchemaVersion | null` ya existe en `FeatureRecipeWorkspace` (B la añadió) y se pasa como `schema={schema}`; tsc limpio para mi archivo. Selectores del workspace (menú ⋯, banner neutro) **pendientes de reconciliar por el orquestador** cuando exista `REQ-B-variables.md`; el spec actual no los usa.
- **"Requiere revisión" cuando cambia el esquema: deuda (necesita backend).** Hoy el pin vive solo en el borrador local; el modelo guardado NO persiste la versión del esquema (no hay campo en `createModel`). Falta: persistir `schema_version` en el modelo, marcar "requiere revisión" cuando una versión aprobada cambie un campo usado y decidir aviso vs. bloqueo (pregunta abierta de §15).
- La detección de fuga es heurística de frontend: compara rutas de pasos `select`/condiciones de variables de origen "current" con `field`/`field_name`/`field_ds_loc` del esquema (y alias de mapeo del dataset). Variables de historial no se evalúan (sus rutas son relativas al evento). No sustituye una validación del backend.
- Un borrador sin `schemaVersion` adopta la versión activa al cargar: no se puede saber con qué esquema se armó.
- Se mantiene el warning preexistente de `react-hooks/exhaustive-deps` (línea ~230) y el `Revisar mapping` de `FeatureRecipeWorkspace` (archivo de B).
- No se tocó `alertSchemaRoles.ts`, `FeatureRecipeWorkspace`, `SegmentProfilingSection`, `AlertSchemaEditor`.

## 7. Pruebas ejecutadas

- `npx vitest run src/test/model-wizard` → 2 archivos, 10 tests pasan (7 de contrato puro; 3 de UI: objetivo sugerido, bloqueo por fuga con resumen y pin desactualizado, borrador antiguo compatible).
- `npx tsc --noEmit` → 8 errores, ninguno en `ModelTraining*`, `wizard/` ni `e2e/models-training-real.spec.ts` (el resto es preexistente: AgentPanel, ConfigurationVersionGraph, tests ajenos).
- `npx eslint` sobre mis archivos → 0 errores, 1 warning preexistente (exhaustive-deps).
- `playwright test e2e/models-training-real.spec.ts --list` compila y lista el test. **No se ejecutó el E2E real** (sin docker/stack por instrucción): pendiente de correr por el orquestador.
