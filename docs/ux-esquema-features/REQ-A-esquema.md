# REQ-A · Pestaña "Esquema" (Configuración)

Origen: `backend/PENDIENTES.md` §15 (rápido + medio, solo frontend). Sin cambios de contrato del backend.
Código: `src/components/configuracion/schema/` (`AlertSchemaEditor.tsx` orquesta; `schemaHelpers.ts`, `SchemaStatusBand.tsx`, `SchemaDiff.tsx`, `SchemaFieldsTable.tsx`, `FieldDetailDrawer.tsx`, `EssentialFieldsChecklist.tsx`, `ReviewInbox.tsx`). Usa `src/lib/alertSchemaRoles.ts` (sin modificarlo).

## 1. Resumen

- Terminología en español: `draft/proposed/active/historical/rejected` se muestran como Borrador / En revisión / Activa / Archivada / Rechazada. Los errores no llevan código HTTP.
- Banda de estado siempre visible: `Activa vN · [Borrador con K cambios] · esenciales n/9 · por revisar m · sensibles sin estrategia s`, con UN botón primario contextual (Editar borrador → Guardar borrador → Proponer → Aprobar propuesta). Los errores de validación se ven bajo la banda.
- Diff legible (`+N añadidos · ~N cambian de tipo/rol · −N eliminados`, lista por campo) con "Ver JSON" plegable como fallback.
- Rol único por campo (selector) en lugar de las casillas Alerta/Historial/Etiqueta/origen aria.
- Tabla delgada (Campo · Nombre visible · Tipo · Rol · Usado por · Marcas · Detalles) y panel lateral (SideDrawer) con el resto de atributos.
- "Campos de sistema" pasa a la pestaña inicial "Campos esenciales" (checklist ✓/✗ con la asignación de `field_roles` y la distribución).
- "Sugerencias" pasa a "Por revisar (m)" que unifica campos desconocidos detectados y reportes de analistas.

Pestañas (orden): `Campos esenciales` (por defecto) · `Campos` · `Propuestas` · `Por revisar (m)`.

## 2. Requisitos

| ID | Dado / Cuando / Entonces |
|---|---|
| RA-1 | Dado cualquier versión, cuando se ve el selector "Versión del esquema" o el encabezado, entonces los estados salen como Borrador/En revisión/Activa/Archivada/Rechazada y la página no contiene las palabras `proposed`, `draft`, `historical`. |
| RA-2 | Dado un error 409/422/otro del backend al guardar/proponer/aprobar, cuando se muestra el aviso `schema-action-error`, entonces no contiene "409", "422" ni JSON crudo (409 = "La versión activa cambió…", 422 = "El esquema no cumple las validaciones…"). |
| RA-3 | Dado el editor cargado, entonces `schema-status-band` muestra `Activa vN`, `esenciales n/9`, `por revisar m`, `sensibles sin estrategia s`. |
| RA-4 | Dado una versión activa (sin borrador), entonces el botón primario es "Editar borrador". Al pulsarlo, la banda agrega `Borrador con 0 cambios` y el primario pasa a "Guardar borrador". |
| RA-5 | Dado un borrador con cambios sin guardar, cuando se edita un campo, entonces K sube (`con 1 cambio`) y el primario sigue siendo "Guardar borrador"; tras guardar con éxito pasa a "Proponer"; tras proponer la versión queda "En revisión" y el primario es "Aprobar propuesta". |
| RA-6 | Dado un borrador con errores de validación, entonces `schema-validation-errors` aparece justo bajo la banda (en cualquier pestaña), el primario (Guardar/Proponer) está deshabilitado y la banda muestra una pista "Corrige N validaciones…". |
| RA-7 | Dado una versión "En revisión" propuesta por el usuario actual, entonces "Aprobar propuesta" está deshabilitado y la banda dice "No puedes aprobar tu propia propuesta…". Si el usuario es otro y la versión tiene impacto, está deshabilitado hasta marcar "Entiendo el impacto" (pestaña Propuestas); después queda habilitado. Hay "Rechazar" en la banda solo en versiones En revisión. |
| RA-8 | Dado la pestaña Propuestas, entonces bajo "Comparación con la versión activa" se ven los chips `schema-diff-chips` (`+N añadidos`, `~N cambian de tipo/rol`, `−N eliminados`, más "otros ajustes"/"roles esenciales reasignados" si aplica) y una entrada `schema-diff-entry` por campo con `atributo: antes → después`. `Ver JSON` está plegado. Si `comparison` tiene forma desconocida, se muestra un mensaje y solo el JSON plegable. |
| RA-9 | Dado la pestaña Campos, entonces cada campo tiene un único selector `Rol <id>` (Dato de la alerta / Historial / Desenlace (etiqueta) / Resultado de ARIA) y no existen casillas "Alerta/Historial/Etiqueta". Cambiar el rol escribe las banderas coherentes (flagsForRole); el error "no puede ser etiqueta e historial" no se puede producir desde la UI. Los campos se agrupan por rol (`fields-role-<rol>`). |
| RA-10 | Dado la tabla, entonces las columnas son Campo · Nombre visible · Tipo · Rol · Usado por · Marcas · Detalles. Marcas muestra chips Core / Sensible (o "Sensible sin estrategia", en rojo) / Obligatorio (`chips-<id>`). |
| RA-11 | Dado el botón `Detalles <id>`, entonces se abre el SideDrawer (`side-drawer`, `field-detail`) con Descripción, Ubicación, Origen, Grupo, Core, Obligatorio, Sensible, Locale, Estrategia sensible y Tipo de locale; editables solo en borrador (deshabilitados en versiones no editables). "Cerrar panel" lo cierra. |
| RA-12 | Dado la pestaña inicial "Campos esenciales", entonces `essential-fields` lista los 9 roles con ✓ (`aria-label="Cubierto"`) / ✗ (`Falta`, requeridos) / ○ (opcionales sin asignar), el selector `Campo para <rol>` con la asignación vigente (editable solo en borrador), los consumidores y la distribución/percentiles. |
| RA-13 | Dado "Por revisar (m)", entonces la pestaña muestra m = campos nuevos detectados + reportes de analistas (un reporte y un campo desconocido con la misma ubicación se fusionan en un solo ítem `review-item`), con "Añadir al borrador" e "Ignorar"; ignorar baja m en la pestaña y en la banda. Vacío: "No hay reportes de analistas.". |
| RA-14 | Dado "Añadir al borrador" sin borrador abierto, entonces se crea un borrador a partir de la versión vista (conserva sus campos) con el campo nuevo al final, y se salta a la pestaña Campos. |
| RA-15 | Conservado: guardar, proponer, aprobar (con `impact_acknowledged`), rechazar, cambiar de versión, validaciones, ignorar, añadir al borrador, filtro de origen, `aria-label` de edición (`Campo <id>`, `Nombre <id>`, `Tipo <id>`). |

## 3. Selectores estables

- Banda: `data-testid="schema-status-band"`, texto en `schema-status-summary`, botón primario `data-testid="schema-primary-action"` (aria-label = "Editar borrador" | "Guardar borrador" | "Proponer" | "Aprobar propuesta"; solo uno visible), "Descartar borrador", "Rechazar".
- Errores: `schema-action-error` (API), `schema-validation-errors` (validación local).
- Selector de versión: combobox "Versión del esquema" (opciones `vN · <Estado en español>`).
- Pestañas (botones): "Campos esenciales", "Campos" (usar `exact: true`: "Campos esenciales" también contiene "Campos"), "Propuestas", `Por revisar (m)`.
- Checklist: `essential-fields`, `essential-<rol>`, `img` con nombre "Cubierto"/"Falta", combobox `Campo para <rol>`.
- Tabla: textbox `Campo <id>`, `Nombre <id>`, combobox `Tipo <id>`, `Rol <id>`, `chips-<id>`, botón `Detalles <id>`, contenedor `fields-role-<alert|history|label|agent_result>`, combobox "Filtrar origen", botón "Campo" (añadir, solo en borrador).
- Drawer: `side-drawer`, `field-detail`, labels `Descripción|Ubicación|Origen|Grupo|Core|Obligatorio|Sensible|Locale <id>`, `Estrategia sensible <id>`, `Tipo de locale <id>`; cierre "Cerrar panel".
- Diff: `schema-diff`, `schema-diff-chips`, `schema-diff-chip-{added,changed,removed,other,roles}`, `schema-diff-entry`; texto "Comparación con la versión activa", "Impacto en uso", checkbox "Entiendo el impacto".
- Inbox: `review-inbox`, `review-item`, botones "Añadir al borrador" / "Ignorar", texto "Último análisis:", "Campo nuevo · <loc>", `<field> · <loc>`.

## 4. Escenario E2E (UI real, `/configuracion` → pestaña "Esquema", rol manager; release_manager para el paso 12)

Ya implementado en `e2e/alert-schema-real-api.spec.ts` (tests 1 y "release manager aprueba…"). Pasos y resultado esperado:

1. Entrar a `/configuracion`, botón "Esquema". → Banda visible con `Activa v<activa>`, `esenciales n/9`, `por revisar m`, `sensibles sin estrategia s`; primario visible.
2. Pestaña por defecto "Campos esenciales". → `essential-fields` visible; cada `Campo para <rol>` tiene el valor de `field_roles` del API; aparece "Workflow, perfilado e historial".
3. Pestaña "Campos" (exact). → `Campo event-id` vale `event_id`; existe `Rol event-id`; no hay checkboxes Etiqueta/Historial.
4. `Detalles event-id`. → Drawer con `Ubicación event-id`; "Cerrar panel" lo cierra.
5. Pestaña `Por revisar (m)`. → "Último análisis:"; cada ubicación desconocida del API y cada sugerencia (si se sembró una como fraud_analyst, `e2e_review_signal · <loc>` y su comentario) aparece; si no hay nada, "No hay reportes de analistas.".
6. Selector de versión → versión candidata. → "Propuso: …"; ninguna palabra `proposed/draft/historical` en la página.
7. Pestaña "Propuestas". → "Comparación con la versión activa" + chips `+N añadidos`/`eliminados`; el `<pre>` JSON está oculto (plegado).
8. Si el candidato tiene impacto → "Impacto en uso" con etiquetas tipo "Configuración · v7" / "Modelo · tag".
9. Si el candidato lo propuso el mismo manager → "Aprobar propuesta" (en la banda) deshabilitado + "No puedes aprobar tu propia propuesta"; si no, habilitado (tras marcar el impacto si existe).
10. (Opcional manual) "Editar borrador" → cambiar `Rol <id>` de un campo → la banda pasa a `Borrador con 1 cambio`, primario "Guardar borrador"; en "Propuestas" el diff muestra `~1 cambian de tipo/rol`.
11. (Opcional manual) Dejar un sensible sin estrategia → `schema-validation-errors` bajo la banda y primario deshabilitado.
12. release_manager (test aprobación): versión candidata → Propuestas → marcar "Entiendo el impacto" si hay → "Aprobar propuesta" → el API `/active` queda con esa versión.
13. fraud_analyst en `/api/v0/alert-schema/versions` → 403.

## 5. Datos / fixtures

Los de `authenticateAndSeed` del spec: manager y release_manager (`E2E_MANAGER_*`, `E2E_RELEASE_MANAGER_*`), esquema activo con roles esenciales, una versión `proposed` candidata (idealmente con impacto), opcional fraud_analyst (`E2E_FRAUD_ANALYST_*`) para sembrar una sugerencia. No hacen falta datos nuevos.

## 6. Decisiones, límites y deuda

- Rol único solo derivado en frontend (`deriveFieldRole`/`flagsForRole`). Al cambiar a rol distinto de "Resultado de ARIA" un campo con origen `aria` pasa a origen `aric`; al elegir "Resultado de ARIA" se fuerza `aria` y se quita Obligatorio. Los datos con banderas contradictorias del backend (p. ej. etiqueta+historial) se muestran como "Historial" (precedencia de `deriveFieldRole`) y la validación local sigue avisando.
- "Usado por": el `impact` del backend es por versión (kind/id/version/tag), no por campo. La columna solo muestra consumidores si un ítem de `impact` nombra el campo (`fields[]`, `field` o `field_id`); en caso contrario "—". Hoy el backend no los nombra, así que la columna normalmente muestra "—"; el impacto sigue visible en Propuestas. Atribuirlo por campo requeriría un cambio de backend o consulta nueva (decisión pendiente del §15).
- Cambio de comportamiento: solo las versiones en `Borrador` abiertas con "Editar borrador" son editables; antes una versión En revisión también aparecía editable. El botón "Guardar" y "Proponer" de la pestaña Propuestas se movieron a la banda (un solo "Aprobar propuesta", sin duplicados); "Rechazar" también está en la banda.
- Bug corregido de paso: "Añadir al borrador" sin borrador previo creaba un borrador solo con el campo nuevo; ahora parte de la versión vista.
- La "Distribución" sigue leyendo `presence`; sin datos muestra "sin datos".
- Sin gate de permisos extra en el botón "Editar borrador" (la pestaña ya está limitada por rol/permiso `alert_schema`; el backend responde 403).
- No cubre: terminología "Variable", FeatureRecipeWorkspace, Segmento→Perfilado, asistente de modelos (otros agentes). No hay E2E automatizado del flujo completo editar→guardar→proponer (mutaría el esquema activo del stack); cubierto por vitest.
- Deuda lint: 6 avisos `react-refresh/only-export-components` (helpers exportados junto a componentes) en archivos nuevos; no son errores. Errores previos de eslint en el spec (líneas 13, 549, 842) no son de estos cambios.
- Cambios de texto que rompen E2E antiguos: "Activo: vN" → banda `Activa vN`; "Campos de sistema" → "Campos esenciales"; "Sugerencias" → "Por revisar (m)"; ya actualizados en `alert-schema-real-api.spec.ts`. Si otro spec usa esos textos hay que actualizarlo.

## 7. Pruebas unitarias ejecutadas

- `npx vitest run src/test/alert-schema` → 3 archivos, 14 tests, todos pasan (`alert-schema-editor.test.tsx` sin cambios + `alert-schema-ux.test.tsx` nuevo, 8 tests: banda, flujo del primario con validación y error 409 humano, rol único, drawer, checklist + bandeja, diff + impacto, helpers).
- `npx tsc --noEmit`: sin errores en archivos de esquema (persisten errores previos en AgentPanel y otros ajenos). `npx eslint` sobre los archivos nuevos: 0 errores, 6 avisos react-refresh.
- El E2E real (Playwright) NO se ejecutó aquí (lo hace el orquestador contra el stack).
