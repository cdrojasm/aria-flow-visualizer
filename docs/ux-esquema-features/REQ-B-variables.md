# REQ-B: Workspace de variables (ingeniería de características)

Agente B. Archivos: `src/components/modelos/FeatureRecipeWorkspace.tsx`, `src/components/modelos/feature/{schemaFields.ts,generation.ts,FieldPicker.tsx}`, `src/components/configuracion/SegmentProfilingSection.tsx`, `src/test/feature-workspace-schema.test.tsx`.

## 1. Resumen

El workspace pasa a llamarse "Variables" en todo texto visible. Se muestra como un banner informativo neutro ("Variables activas: n · versión V[ · esquema vN]") en vez de una advertencia, con la versión real de la configuración (`schema_version`, antes "1" fijo) y la del esquema activo cuando existe. La lista izquierda se agrupa por origen (Operación actual / Historial) con ✓/⚠ por variable. Cada variable tiene una prueba incrustada ("ejemplo → resultado" por paso y "Valor final" siempre visible) que usa el mismo endpoint de preview que antes. Prueba con más filas, JSON avanzado y Plantillas dejan de ser pestañas: viven en un menú "⋯" (Más opciones) junto con "Descargar JSON".

Nueva prop opcional `schema?: AlertSchemaVersion | null`. Con esquema: el selector "Campo de la alerta" se alimenta del esquema (agrupado por rol, con tipo), los campos excluidos (etiqueta, resultado de ARIA) no se ofrecen y se listan con su motivo, los sensibles avisan, y "Generar variables de todos los campos" decide por tipo. Sin esquema (null/undefined) todo funciona como antes (muestra de dataset y rutas libres). `SegmentProfilingSection` obtiene el esquema activo con react-query (`["alertSchema","active"]`, misma clave que el editor del esquema) y lo pasa.

Bug previo corregido: `value` se reconstruía en cada render y el efecto que limpia `preview` depende de él, por lo que el resultado de la prueba se borraba apenas llegaba. Ahora `value` está memoizado sobre `rawValue`. Efecto colateral: `onValidity` ya no se invoca en cada render, solo cuando cambia la configuración, las muestras, el objetivo o el dataset.

## 2. Requisitos

| ID | Dado / Cuando / Entonces |
|---|---|
| RB-1 | Dado el workspace, cuando se renderiza, entonces ningún texto visible ni aria-label usa "receta", "mapeo", "característica" ni "señal"; usa "variable". |
| RB-2 | Dado una configuración con `schema_version` V y n variables activas, cuando se renderiza, entonces `fe-active-banner` dice "Variables activas: n · versión V" (no es un WarningAlert, sin icono de advertencia). Si hay `schema`, añade " · esquema vN". |
| RB-3 | Dado el workspace, cuando se abre, entonces no hay pestañas de primer nivel; existe el botón "Más opciones" (`fe-menu-button`) con los ítems JSON avanzado, Plantillas, Descargar JSON y Probar con más filas. |
| RB-4 | Dado el menú, cuando se elige JSON avanzado / Plantillas / Probar con más filas, entonces se muestra ese panel con el botón "← Volver a variables"; todas las funciones previas siguen (aplicar/importar/exportar JSON, guardar/usar/eliminar plantilla, muestras y "Validar y calcular"). "Descargar JSON" descarga `feature-recipes-v{schema_version}.json` sin cambiar de panel. |
| RB-5 | Dado varias variables, cuando se ve la lista, entonces aparecen en grupos `fe-group-current` ("Operación actual") y `fe-group-history` ("Historial"), solo los grupos no vacíos, con el filtro de búsqueda aplicado. |
| RB-6 | Dado una variable, cuando es inválida (nombre fuera de `^[A-Za-z][A-Za-z0-9_]{0,79}$`, origen actual sin campo, historial sin campo de historial, usa un campo excluido, o la última prueba dio error) entonces su `fe-validity-<nombre>` muestra ⚠ con motivo en aria-label; si no, ✓. |
| RB-7 | Dado una variable seleccionada, cuando se pulsa "Probar variable" (`fe-inline-run`), entonces se llama a `previewFeatures` (mismo endpoint) con hasta 5 filas (muestra real del dataset si hay, si no ficticias), y tras el polling `fe-inline-final` muestra el valor final y cada paso `fe-step-result-<i>` muestra "ejemplo → resultado: entrada → salida". Antes de probar `fe-inline-final` dice "Sin probar" y `fe-inline-example` muestra el valor de la fila de muestra. Cualquier edición vuelve a "Sin probar". |
| RB-8 | Dado `schema`, cuando se edita una variable de origen "Operación actual", entonces `fe-field-picker-select` lista los campos del esquema agrupados por rol ("Dato de la alerta") con el tipo (número, texto, booleano, fecha, fecha y hora, lista) y " · sensible" cuando aplica. Lo mismo para los campos de alerta de los pasos (`fe-step-<i>-current`, `-reference`, `-condition-<j>`). |
| RB-9 | Dado `schema` con campo etiqueta (`is_label`) o de origen `aria`, cuando se despliega el selector, entonces NO están como opción; aparecen en `fe-excluded-fields` (`fe-excluded-<campo>`) con el motivo de `featureGuard`. |
| RB-10 | Dado una variable cuya ruta resuelve (por `field_ds_loc`, nombre o alias de dataset) a un campo excluido, entonces se ve `fe-excluded-in-use` (rol alert) y la variable tiene ⚠. |
| RB-11 | Dado una variable cuya ruta o referencias resuelven a un campo `is_sensible`, entonces se ve `fe-sensitive-warning` (WarningAlert) con la estrategia ("Dato sensible (hash)" o "sin estrategia definida"). |
| RB-12 | Dado una ruta que no está en el esquema, cuando se escribe en "Otra ruta (no está en el esquema)…", entonces se muestra `fe-propose-schema` con el enlace "Proponer al esquema" (`/configuracion`) y la ruta libre sigue funcionando. |
| RB-13 | Dado `schema`, cuando se pulsa "Generar variables de todos los campos" (`fe-generate`), entonces por cada campo de rol "alerta" no excluido y aún sin variable se crea: number → salida número, sin pasos; bool → salida booleano, paso `to_boolean`; string → salida texto, sin pasos (categoría); date/datetime → `<campo>_hora` (paso `hour`) y `<campo>_dia_semana` (paso `weekday`); list → `<campo>_conteo` (paso `count`). No se generan etiqueta, resultado de ARIA ni historial. Re-pulsar no duplica (el botón queda deshabilitado) y no se supera el límite de 200 (alerta "límite de 200 variables"). |
| RB-14 | Dado `schema` ausente (null/undefined), entonces el campo "Campo de la alerta" es el input con datalist `fe-paths`, la generación crea los campos simples de la muestra del dataset como texto y no hay aviso de esquema. |
| RB-15 | Dado `schema` con campos `is_history`, cuando el campo de historial se edita (solo con `showHistorySettings`), entonces el datalist de arrays ofrece solo esos campos; sin campos `is_history` en el esquema, cae a los arrays detectados del dataset. |
| RB-16 | Dado `/configuracion` → Segmento → Perfilado, entonces el workspace recibe el esquema activo (consulta `["alertSchema","active"]`); si la consulta falla funciona sin esquema. |

## 3. Selectores estables

data-testid:
- `fe-active-banner`, `fe-menu-button`, `fe-menu` (role=menu), `fe-menu-json`, `fe-menu-templates`, `fe-menu-download`, `fe-menu-preview`, `fe-back-to-variables`, `fe-panel-title`
- `fe-generate`, `fe-add-variable`, `fe-variable-list`, `fe-group-current`, `fe-group-history`, `fe-variable-item-<nombre>`, `fe-validity-<nombre>`
- `fe-field-picker` (contenedor), `fe-field-picker-select`, `fe-field-picker-free`, `fe-propose-schema`, `fe-excluded-fields`, `fe-excluded-<campo>`, `fe-excluded-in-use`, `fe-sensitive-warning`
- `fe-step-<i>-current`, `fe-step-<i>-reference`, `fe-step-<i>-condition-<j>` (pickers de pasos, con sufijos `-select` y `-free`)
- `fe-inline-test`, `fe-inline-run`, `fe-inline-example`, `fe-inline-final`, `fe-inline-error`, `fe-step-result-<i>`

aria-label / textos: "Más opciones", "Más opciones de variables", "Buscar variable", región "Variables definidas", "Nombre de variable", "Duplicar variable", "Eliminar variable", "Descripción de la variable", "Campo de la alerta", "Operación del paso N", "Configuración JSON", "Muestras JSON", "Nombre de plantilla", botones "Añadir variable", "Variable del historial", "Probar variable", "Validar y calcular", "Generar variables de todos los campos (n)", "Incluir esta variable en el modelo".

## 4. Escenario E2E (UI real, sin mocks de API)

Prerrequisito: stack local por nginx (`http://localhost`), esquema activo con al menos: un número, un booleano, un texto, un datetime, una lista, un campo sensible, la etiqueta y un campo de origen `aria`. Usuario con permiso de configuración (si no hay credenciales, crear usuario de prueba local).

A. `/configuracion` → Segmento (uno existente en borrador) → pestaña Agente/Perfilado.
1. Ver el workspace "Ingeniería de variables". Esperado: banner `fe-active-banner` neutro con "Variables activas: n · versión 2 · esquema v<activa>" (no 1 fijo salvo que la configuración sea v1).
2. Pulsar `fe-generate`. Esperado: se crean variables por tipo (RB-13), sin etiqueta ni campo ARIA; lista agrupada en "Operación actual" con ✓.
3. Abrir `fe-variable-item-<campo sensible>`. Esperado: `fe-sensitive-warning` visible.
4. En `fe-field-picker-select` abrir las opciones. Esperado: la etiqueta y el campo ARIA no están; sí aparecen en `fe-excluded-fields` con motivo.
5. Elegir "Otra ruta…" y escribir `no.existe`. Esperado: `fe-propose-schema` con enlace "Proponer al esquema"; ⚠ en la lista (sin campo válido no, solo si ruta vacía).
6. Pulsar `fe-inline-run` en una variable. Esperado: tras unos segundos `fe-inline-final` muestra un valor distinto de "Sin probar"; `fe-step-result-0` si hay pasos. Editar el nombre: vuelve a "Sin probar".
7. Pulsar `fe-menu-button`. Esperado: 4 ítems; `fe-menu-json` abre el JSON con las variables; "Volver a variables" regresa.
8. Re-pulsar `fe-generate`. Esperado: botón deshabilitado, sin duplicados.

B. Asistente de modelos, paso "Características" (depende de que el agente C pase `schema`).
1. Con dataset y objetivo elegidos, entrar al paso. Esperado: mismos comportamientos 1-8; el campo objetivo no aparece como opción.
2. En "Probar con más filas" (menú ⋯): "Cargar muestra del dataset" y "Validar y calcular". Esperado: tabla con valores por fila y mensajes de errores como antes; el wizard sigue exigiendo validar antes de avanzar.
3. Sin esquema activo (esquema null): el campo "Campo de la alerta" es input libre con sugerencias del dataset.

## 5. Datos/fixtures

- Esquema activo con campos de los tipos indicados; campos alert con `field_ds_loc` igual a la ruta del dataset (la UI resuelve la ruta por `field_ds_loc || field` y por alias `fieldAliases`).
- Dataset con filas reales para la prueba incrustada (si no hay, se usan ejemplos ficticios `Ejemplo <ruta>`, que dan resultados de error para pasos numéricos: es esperado).
- Un segmento editable para la ruta de configuración.

## 6. Selectores de specs E2E que cambiaron

Revisados `e2e/*.spec.ts` y `e2e/support`: ningún spec usa los textos del workspace (se buscaron "Mapeo y transformaciones", "Prueba de configuración", "JSON avanzado", "Plantillas reutilizables", "Mapeos activos", "Generar mapeos", etc.; solo `side-drawer-real.spec.ts` tiene "Mapeo de alertas", que es otra pestaña). No edité ningún spec. Para `models-training-real.spec.ts` (no tocado), estos selectores/textos del workspace cambiaron si en el futuro se usan:

| Antes | Ahora |
|---|---|
| Pestañas "Mapeo y transformaciones", "Prueba de configuración", "JSON avanzado", "Plantillas reutilizables" (nav "Ingeniería de características") | Sin pestañas; menú `fe-menu-button` → `fe-menu-preview` / `fe-menu-json` / `fe-menu-templates`; "← Volver a variables" |
| "Mapeos activos: n · versión 1" | `fe-active-banner`: "Variables activas: n · versión V" |
| "Generar mapeos de todos los campos (n)" | `fe-generate`: "Generar variables de todos los campos (n)" |
| aria-label "Buscar mapeo" / región "Campos mapeados" | "Buscar variable" / región "Variables definidas" |
| "Añadir mapeo", "Característica del historial" | "Añadir variable", "Variable del historial" |
| aria-label "Nombre de característica", "Duplicar receta", "Eliminar receta" | "Nombre de variable", "Duplicar variable", "Eliminar variable" |
| placeholder "Descripción de la señal" | aria-label/placeholder "Descripción de la variable" |
| "Incluir esta característica en el modelo" | "Incluir esta variable en el modelo" |
| "Revisar mapping “x”" | "Revisar variable “x”" |
| Título "Ingeniería de características" | "Ingeniería de variables" (el texto de `ModelTrainingWizard.tsx` línea ~279 "Ingeniería de características tiene cambios sin validar…" es del agente C) |
| Con esquema: input "Campo de la alerta" | `fe-field-picker-select` (select) + `fe-field-picker-free` para ruta libre |

## 7. Decisiones y deuda

- Doble configuración de historial: NO es doble en pantalla. El wizard muestra `HistoryMappingControls` en el paso de datos y el workspace con `showHistorySettings={false}` en el paso de características; en Segmento solo el panel del workspace (por defecto `true`). Son dos copias del mismo formulario (campo de historial + zona horaria) en contextos excluyentes. No lo unifiqué para no tocar el wizard (agente C); deuda: que el wizard use el panel del workspace o que ambos compartan un componente. El bloque `hidden` legacy del paso 1 sigue en el wizard (agente C).
- Mapeo ruta ↔ campo del esquema: se asume `field_ds_loc || field`, más nombre y alias del dataset (`fieldAliases`). Si el dataset usa otras rutas, esas rutas aparecen como "Otra ruta" con "Proponer al esquema".
- Operaciones por tipo con las existentes (`DEFAULT_OPERATION_CAPABILITIES`): no existe una operación "partes de fecha" ni "categoría directa". Fecha → dos variables (`hour`, `weekday`); texto → salida `string` sin pasos (categoría); bool → `to_boolean`; number → sin pasos (el motor convierte a número); list → `count`. Verificado contra `backend/src/domain/models/feature_recipe.py`.
- Con esquema, "Generar" parte de los campos del esquema (rol alerta), no de la muestra del dataset: en Segmento (sin dataset) también funciona; si un campo no existe en el dataset la variable quedará ausente.
- "Proponer al esquema" es solo un enlace a `/configuracion` (crear sugerencias requiere un alertId).
- Validez ✓/⚠ es local (no llama al backend); la autoridad sigue siendo la prueba. La prueba incrustada evalúa toda la configuración con hasta 5 filas (un solo endpoint) y actualiza `onValidity`/`onDiagnostic` igual que "Validar y calcular".
- Un campo sensible no bloquea: solo avisa. "Usado por" y bloqueo por versión de esquema fuera de alcance.
- Pendiente de decisión: si la variable de origen "Historial" debe validar campos de evento contra algún esquema (hoy son rutas relativas libres).

## 8. Pruebas ejecutadas

- `npx vitest run src/test/feature-workspace-schema.test.tsx`: 10/10 pasan (banner con versión real, menú ⋯ sin perder paneles, selector por esquema, exclusión de etiqueta/ARIA, "Proponer al esquema", aviso sensible, excluido en uso, agrupación, generación por tipo + idempotencia + límite 200, fallback sin esquema, prueba incrustada).
- `npx vitest run src` (todo `src`): 96 de 98 pasan; fallan 2 en `src/test/metrics.pages.test.tsx` (/monitor y /historico-fraude), archivos que no toqué. (`npx vitest run` sin filtro además recoge los specs Playwright de `e2e/` y los marca como fallidos: ruido.)
- `npx tsc --noEmit`: sin errores en mis archivos; quedan los errores previos del repo (AgentPanel, ConfigurationVersionGraph, tests de otras áreas).
- `npx eslint` sobre mis archivos: 0 errores, 5 warnings `react-hooks/exhaustive-deps` que ya existían en el workspace.
- No se ejecutó la UI real (sin docker/make por instrucción): el escenario E2E de la sección 4 queda para el orquestador.
