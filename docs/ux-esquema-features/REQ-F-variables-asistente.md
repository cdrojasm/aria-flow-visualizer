# REQ-F: Variables y asistente de modelos tras la revisión visual

Agente F. Archivos: `src/components/modelos/FeatureRecipeWorkspace.tsx`, `src/components/modelos/feature/{generation.ts,GenerationReview.tsx,FieldPicker.tsx,schemaFields.ts}`, `src/components/modelos/ModelTrainingWizard.tsx`, `src/components/modelos/wizard/{trainingContract.ts,TrainingContractSummary.tsx}`, tests `src/test/feature-workspace-schema.test.tsx`, `src/test/model-wizard-{contract.test.ts,ui.test.tsx}`, `e2e/models-training-real.spec.ts`.

## 1. Resumen

La revisión visual (esquema v78, 65 campos, `planner_sample_200`) mostró que "Generar variables de todos los campos" creaba 62 variables dañinas (identificadores como categoría, campos posteriores a la decisión) y que todas aparecían con ✓ sin validarse. Cambios:

- **Generar es una propuesta que el analista confirma.** `fe-generate` (ahora "Revisar campos y generar variables (n)", botón primario) abre `fe-generate-review` con casillas. Pre-marcados: los que pasan las reglas (los sensibles `warn` también, con "Aviso"). Sin marcar y con el motivo visible: los `suspect` (heurística por nombre) con botón "Incluir de todos modos"; y los `exclude` (etiqueta, resultado de ARIA, `is_identifier`, `available_at_decision=false`, campo objetivo) que no se pueden marcar. "Crear N variables" materializa solo lo marcado. Abrir la revisión no crea nada.
- Campos del dataset que no están en el esquema (o sin esquema) se juzgan con `suspectGuardForName`; el campo objetivo aparece como excluido.
- El selector de campo (`FieldPicker`) y el panel de la variable muestran el motivo cuando el campo es sospechoso/excluido.
- **Estados reales de la lista**: "Sin validar" (○ neutro) hasta que el evaluador calcula la variable ("Probar variable" o "Validar y calcular"); ✓ solo si el cálculo salió bien; ⚠ si hay error del evaluador o usa un campo excluido/sospechoso. Cualquier edición vuelve a "Sin validar" (el preview se limpia). `onValidity`/`onDiagnostic` no cambiaron: el gating del asistente es el mismo.
- **Asistente**: estado vacío correcto (si hay historial dice que ya está configurado; si no, que se define en "Datos y objetivo"), los botones "Variable del historial / + Ratio de importe / + Categoría de importe" solo aparecen con historial configurado, y el paso 1 muestra `wizard-step0-hint` ("Falta: …").
- **Revisión (paso 4)**: las variables con campos `suspect` salen en `contract-suspects` ("Revisa estas variables", no bloquea); las `exclude` bloquean (`contract-leaks`) con título según el motivo: "Fuga de datos" (etiqueta/ARIA), "Identificador", "Dato posterior a la decisión".

## 2. Requisitos

| ID | Dado / Cuando / Entonces |
|---|---|
| RF-1 | Dado el paso Variables con campos por generar, cuando se pulsa `fe-generate`, entonces aparece `fe-generate-review` y la lista de variables no cambia (no se crea nada). El botón es primario (azul) y "Añadir variable" secundario. |
| RF-2 | Dado la revisión, cuando se ve, entonces los campos que pasan las reglas están marcados en la sección "Se proponen"; los sospechosos en "Sospechosas" sin marcar; los excluidos en "No se pueden usar" sin marcar y con la casilla deshabilitada. Cada fila con regla muestra su motivo (`fe-gen-reason-<campo>`). |
| RF-3 | Dado un campo cuyo nombre parece identificador (eventid, customerid, deviceid, transactionid, session_sessionId) o posterior a la decisión (fecha_primer_marcacion_hora, reviewstatus_first) y que el esquema no marca, entonces está sin marcar, con motivo ("parece un identificador…" / "se genera después de decidir…") y botón "Incluir de todos modos" (`fe-gen-force-<campo>`). |
| RF-4 | Dado una etiqueta (marcacion_final y demás `is_label`), un campo de ARIA, uno `is_identifier` o `available_at_decision=false` en el esquema, o el campo objetivo, entonces su casilla está deshabilitada, sin sección de "Incluir de todos modos" y con "No se puede usar". |
| RF-5 | Dado un sospechoso, cuando se pulsa "Incluir de todos modos", entonces su casilla queda marcada, el botón dice "No incluir" y el contador de "Crear N variables" sube; pulsar "No incluir" lo revierte. |
| RF-6 | Dado un campo sensible (`is_sensible`), entonces llega marcado con el aviso "Aviso: Dato sensible (…)". |
| RF-7 | Dado marcados M campos (un fecha/fecha y hora cuenta 2: hora y día de la semana), cuando se lee `fe-gen-confirm`, entonces dice "Crear N variables" con N = variables que se crearán; al pulsarlo se crean solo esas (number directo; bool `to_boolean`; texto categoría; fecha `_hora`/`_dia_semana`; lista `_conteo`) y la revisión se cierra. "Cancelar" (`fe-gen-cancel`) cierra sin crear. |
| RF-8 | Dado que ya existen variables de un campo (por ruta o por campo del esquema), entonces ese campo no se propone: confirmar dos veces no duplica. `fe-generate` queda deshabilitado cuando no queda ningún campo proponible. |
| RF-9 | Dado el límite de 200: con 200 variables `fe-generate` está deshabilitado y se ve la alerta "límite de 200"; si lo marcado superaría 200, `fe-gen-limit` (alerta) aparece y `fe-gen-confirm` queda deshabilitado. |
| RF-10 | Dado una variable recién creada o editada, cuando se ve la lista, entonces `fe-validity-<nombre>` tiene `data-state="unvalidated"`, muestra ○ y aria-label "Sin validar". Tras "Probar variable" / "Validar y calcular" con éxito: `data-state="valid"`, ✓, "Variable validada". Con error del evaluador o uso de un campo excluido/sospechoso: `data-state="warning"`, ⚠ y el motivo en aria-label/title. |
| RF-11 | Dado una variable cuyo campo es sospechoso o excluido, cuando se selecciona, entonces `fe-field-guard` (data-level `suspect`/`exclude`) muestra el motivo bajo el selector, y para sospechosos aparece además `fe-suspect-in-use`. En las opciones del selector los sospechosos llevan " · sospechoso". |
| RF-12 | Dado el workspace sin esquema, entonces la revisión se arma con los campos simples del dataset; los que parecen identificadores/posteriores a la decisión quedan sin marcar con motivo y el campo objetivo se lista como no usable ("Es el campo objetivo del modelo…"). |
| RF-13 | Dado el paso Variables sin variables y con historial configurado, el estado vacío (`fe-empty-state`) dice que el historial ya está configurado y aparecen `fe-add-history`, `fe-add-ratio`, `fe-add-category`; sin historial, el estado vacío dice que se define en el paso "Datos y objetivo" y esos tres botones no existen. Ya no aparece "selecciona primero el campo de historial". |
| RF-14 | Dado el paso 1 con "Continuar" deshabilitado, entonces `wizard-step0-hint` dice "Falta: nombre del modelo, dataset." / "Falta: campo objetivo." / "Falta: clase positiva." según corresponda (también "un objetivo con al menos dos clases", "esperar a que carguen los campos"), y desaparece al completar. |
| RF-15 | Dado el paso Revisión con variables sobre campos `suspect`, entonces `contract-suspects` ("Revisa estas variables") las lista con su motivo, no bloquea el entrenamiento y no aparece si no hay ninguna. |
| RF-16 | Dado variables sobre etiqueta/ARIA/`is_identifier`/`available_at_decision=false`, entonces `contract-leaks` las lista con el título "Fuga de datos" / "Identificador" / "Dato posterior a la decisión" y "Guardar y entrenar" queda deshabilitado. Sin esquema, las rutas se juzgan por nombre (solo `suspect`). |

## 3. Selectores estables

- Revisión: `fe-generate-review` (región, aria-label "Revisión de variables propuestas"), `fe-gen-section-ok|suspect|exclude`, `fe-gen-item-<ruta>` (atributos `data-level` = ok|warn|suspect|exclude y `data-checked`), `fe-gen-check-<ruta>` (aria-label "Incluir <campo>"), `fe-gen-reason-<ruta>`, `fe-gen-locked-<ruta>`, `fe-gen-force-<ruta>` (aria-pressed), `fe-gen-confirm`, `fe-gen-cancel`, `fe-gen-summary`, `fe-gen-limit`. `<ruta>` es la ruta del campo (`field_ds_loc` o `field` del esquema; la columna del dataset si no está en el esquema).
- Lista: `fe-variable-item-<nombre>`, `fe-validity-<nombre>` con `data-state` = unvalidated|valid|warning.
- Panel de variable: `fe-field-guard` (+ `data-level`), `fe-suspect-in-use`, `fe-excluded-in-use`, `fe-sensitive-warning`, `fe-empty-state`, `fe-history-starters`, `fe-add-history`, `fe-add-ratio`, `fe-add-category`.
- Asistente: `wizard-step0-hint`, `contract-suspects`, `contract-leaks`, `contract-sensitive`.

## 4. Escenario E2E / visual

Prerrequisito: stack local por nginx, esquema activo v78 (65 campos), dataset `planner_sample_200`. Usuario con permiso para entrenar modelos (si no hay credenciales, crear usuario de prueba local).

1. `/modelos` → "Nuevo modelo". Esperado: `wizard-step0-hint` = "Falta: nombre del modelo, dataset." y "Continuar" deshabilitado.
2. Nombre `e2e-rf-<ts>`, dataset `planner_sample_200`, objetivo `marcacion_final`. Esperado: el hint pasa a "Falta: clase positiva.".
3. Marcar la clase positiva `risk`. Esperado: el hint desaparece y "Continuar" se habilita. Continuar.
4. Paso "Variables": el botón `fe-generate` es azul ("Revisar campos y generar variables (n)") y "Añadir variable" es secundario. El estado vacío NO dice "selecciona primero el campo de historial": si el paso 1 configuró historial dice que ya está configurado; si no, que se define en "Datos y objetivo".
5. Pulsar `fe-generate`. Esperado: aparece `fe-generate-review`; la lista de variables sigue vacía.
6. En la revisión, estos campos están SIN marcar y con motivo visible: `eventid`, `customerid`, `deviceid`, `transactionid`, `session_sessionId` (sospechosos, con "Incluir de todos modos"); `fecha_primer_marcacion_hora`, `reviewstatus_first` (sospechosos, "después de decidir"); `marcacion_final` y las demás etiquetas del esquema (`is_label`) y los campos de origen ARIA (excluidos, casilla deshabilitada, "No se puede usar"). Mientras el esquema no marque `is_identifier`/`available_at_decision`, las exclusiones duras son solo etiquetas/ARIA/objetivo; el resto sale de la heurística (sospechosos).
7. Cantidad marcada: aproximadamente 62 − (identificadores y posteriores a la decisión) − etiquetas: se espera una cifra en el orden de 40 a 50 variables (cada fecha cuenta 2), no 62. Verificar que `fe-gen-confirm` dice "Crear N variables" con N coherente con las casillas.
8. Pulsar "Incluir de todos modos" en `eventid`: se marca, N sube en 1. Pulsar "No incluir": vuelve.
9. Desmarcar un campo normal y pulsar "Crear N variables". Esperado: la lista contiene solo lo marcado (ni `eventid`, ni `reviewstatus_first`, ni `marcacion_final`) y todas las variables muestran ○ "Sin validar".
10. Seleccionar una variable y "Probar variable". Esperado: su estado pasa a ✓ solo si el cálculo salió bien; las demás siguen en ○. Con "Validar y calcular" (menú ⋯ → Probar con más filas) pasan a ✓ las calculadas.
11. Añadir manualmente una variable con el campo `eventid`: `fe-field-guard` y `fe-suspect-in-use` muestran el motivo y su estado es ⚠.
12. Re-pulsar `fe-generate`: la revisión ya no ofrece los campos creados (solo los que quedaron sin marcar y los no usables).
13. Continuar hasta "Revisión": la variable con `eventid` aparece en `contract-suspects` ("Revisa estas variables") sin bloquear; una variable sobre `marcacion_final` aparece en `contract-leaks` y bloquea "Guardar y entrenar".

## 5. Datos / fixtures

- Esquema activo v78 con 65 campos (hoy sin `is_identifier` ni `available_at_decision`: las exclusiones por identificador/posterior salen de la heurística por nombre). Si el orquestador marca esos flags en el esquema, los campos pasan de "Sospechosas" a "No se pueden usar".
- Dataset `planner_sample_200` con columnas `marcacion_final` (positiva `risk`), `eventid`, `customerid`, `deviceid`, `transactionid`, `session_sessionId`, `fecha_primer_marcacion_hora`, `reviewstatus_first`.
- Heurística (en `src/lib/alertSchemaRoles.ts`): identificador = nombre que termina en `id`/`_id`/`Id`/uuid (salvo valid/paid/android…); posterior a la decisión = contiene marcacion/review/revision/desenlace/outcome/resolucion/analista/etiqueta/feedback/chargeback/label/output_.

## 6. Selectores que cambiaron respecto de REQ-B / REQ-C

| Antes | Ahora |
|---|---|
| `fe-generate`: "Generar variables de todos los campos (n)" creaba variables al pulsar | `fe-generate` (mismo testid): "Revisar campos y generar variables (n)"; abre `fe-generate-review`; la creación es `fe-gen-confirm` ("Crear N variables"). Queda deshabilitado sin campos proponibles o con 200 variables |
| Alerta "límite de 200" al generar | Alerta con 200 variables ya creadas y `fe-gen-limit` dentro de la revisión |
| `fe-validity-<nombre>`: ✓ por defecto, ⚠ con problemas | Mismo testid con `data-state` unvalidated (○, "Sin validar") / valid (✓) / warning (⚠) |
| Estado vacío "Para trabajar con eventos, selecciona primero el campo de historial" | `fe-empty-state` con el texto según haya historial o no |
| Botones "Variable del historial", "+ Ratio de importe", "+ Categoría de importe" siempre visibles sin variables | Solo con historial configurado (`fe-history-starters`, `fe-add-history/-ratio/-category`) |
| Paso 1 sin explicación | `wizard-step0-hint` |
| Revisión: solo `contract-leaks`/`contract-sensitive` | + `contract-suspects`; el texto de `contract-leaks` lleva el título por motivo ("Fuga de datos", "Identificador", "Dato posterior a la decisión") |
| Ya no existe: la creación directa desde `fe-generate`, el texto "Generar variables de todos los campos" y la nota "Omite la etiqueta y el resultado de ARIA…" |
| Specs que usaban el flujo antiguo: `e2e/ux-esquema-features-integrated-real.spec.ts` (orquestador) pulsa `fe-generate` y espera variables; debe pulsar además `fe-gen-confirm` y ya no puede esperar que `fe-generate` quede deshabilitado solo por haber generado (queda habilitado si hay campos sin marcar). Con esquema, los sensibles siguen llegando marcados. |

## 7. Decisiones y deuda

- Los campos del dataset que el esquema no conoce se proponen igual que sin esquema (marcados si pasan la heurística, con la etiqueta "fuera del esquema"). Antes, con esquema se ignoraban.
- Un campo `warn` (sensible) llega marcado con aviso, no bloqueado, según el contrato.
- Los campos de historial (`is_history`) no se proponen. Las variables de historial siguen creándose a mano.
- "Validar" usa el estado del preview vigente: al editar cualquier variable el preview se limpia y todas vuelven a "Sin validar" (comportamiento existente de `useEffect` sobre `value`). Los estados no se persisten en el borrador.
- `recipeGuards` ahora también evalúa rutas sin esquema por nombre, por lo que en `/configuracion` (sin esquema) una variable sobre `*id` muestra ⚠.
- No se ejecutó el E2E contra el stack local (sin docker en esta tarea): `e2e/models-training-real.spec.ts` está actualizado y compila, pero NO fue ejecutado.
- Deuda: el e2e del orquestador debe actualizarse (ver sección 6). Los warnings de `react-hooks/exhaustive-deps` del workspace ya existían.

## 8. Resultados reales

Ver el reporte final del agente; al momento de escribir:

- `npx vitest run src/test/feature-workspace-schema.test.tsx src/test/model-wizard-ui.test.tsx src/test/model-wizard-contract.test.ts`: 3 archivos, 36 tests, todos pasan.
- `npx vitest run src`: 140 pasan, 1 falla ajeno (`metrics.pages.test.tsx` > /monitor tabs).
- `npx tsc --noEmit`: solo los errores previos (AgentPanel, ConfigurationVersionGraph, biblioteca.vector-store.test, reasoning-evaluation.test); ninguno nuevo.
- `npx eslint` sobre los archivos propios: 0 errores, 6 warnings `react-hooks/exhaustive-deps` preexistentes.
- E2E real: no ejecutado.
