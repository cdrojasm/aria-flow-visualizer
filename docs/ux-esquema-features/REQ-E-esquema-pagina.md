# REQ-E · Esquema: página limpia, banda clara, solo lectura real y nuevas banderas

Origen: revisión visual del navegador sobre REQ-A + `backend/PENDIENTES.md` §15.
Código: `src/routes/configuracion.tsx` (visibilidad por pestaña) y `src/components/configuracion/schema/`.

## 1. Resumen

- Con la pestaña "Esquema" activa, `/configuracion` NO renderiza nada del versionado de configuraciones (selector de configuración/versión, grafo de versiones, solicitudes de despliegue, banner de solo lectura, spinner "Cargando versión…", avisos de borrador/conflicto/despliegue programado, pie fijo). Solo cambia la visibilidad (`schemaTab = canManageSchema && activeTab === "schema"`); queries y estado de borradores/localStorage no se tocan. Con Esquema activo, la barra de pestañas se pinta justo bajo el encabezado; en cualquier otra pestaña queda en su lugar de siempre (misma instancia de `SectionTabs`, mismo aria-label "Secciones de configuración"). El pie fijo no se pasa a `DashboardLayout` (sin el padding inferior).
- Banda de estado con chips con semáforo (ver RE-3..RE-6).
- Sin borrador, Campo/Nombre/Tipo/Rol son texto plano; solo en borrador son controles.
- Ruido fuera: columna "Usado por" solo si algún campo tiene uso; el título del grupo ya no se duplica; distribución con máx. 3 valores, valores largos recortados.
- Banderas nuevas `is_identifier` y `available_at_decision` (drawer, chips, validación, diff).

## 2. Requisitos (verificables visualmente)

| ID | Dado / Cuando / Entonces |
|---|---|
| RE-1 | Dado un manager con permiso `alert_schema`, cuando abre `/configuracion` y pulsa "Esquema", entonces la barra de pestañas ("Campos esenciales", "Campos", "Propuestas", "Por revisar (m)") y la banda de estado se ven SIN desplazar la página (la barra de pestañas de configuración "Esquema" está arriba, bajo el h1). La página mide ~1 pantalla + la tabla, no ~10.000 px hasta las pestañas. |
| RE-2 | Dado la pestaña Esquema activa, entonces NO se ve: banner naranja "Viendo la versión X — versión guardada, de solo lectura", botón "Crear nueva versión basada en…", spinner "Cargando versión…", selector de configuración/versión de configuración, "Grafo de versiones", "Solicitudes de despliegue", avisos "Tienes cambios sin guardar"/"Hay una versión más nueva"/"Despliegue en ventana programado", ni el pie fijo ("Consultando configuración … Solo lectura", "Restaurar cambios", "Crear versión"). Solo hay un CTA de editar: "Editar borrador" de la banda del esquema. Al volver a otra pestaña todo reaparece igual que antes y el borrador/estado persistido no cambia. |
| RE-3 | Dado el esquema activo v78 con los 7 obligatorios cubiertos y 2 opcionales sin asignar, entonces la banda muestra chips: `Activa v78` (verde), `Esenciales: 7/7 obligatorios ✓` (verde), `Opcionales: 0/2` (gris, sin alarma), `Por revisar: 70` (gris neutro), `Sensibles sin estrategia: 0` (verde). Nunca se ve "7/9". |
| RE-4 | Dado que falta un obligatorio, entonces el chip es `Esenciales: 6/7 obligatorios` (rojo, sin ✓). Los opcionales sin asignar nunca ponen el chip en rojo. |
| RE-5 | Dado s>0 sensibles sin estrategia, entonces `Sensibles sin estrategia: s` va en rojo; con 0, en verde. "Por revisar: m" es siempre gris neutro. |
| RE-6 | Dado un borrador/versión no activa, entonces aparece un chip ámbar con `Borrador con K cambios` / `En revisión con K cambios` / `Archivada v N` junto a `Activa vN`. El primario sigue siendo uno solo (Editar borrador → Guardar borrador → Proponer → Aprobar propuesta). |
| RE-7 | Dado la pestaña "Campos" sin borrador abierto, entonces Campo, Nombre visible, Tipo y Rol se ven como texto plano (sin bordes de input ni flecha de select) y no hay textbox/combobox editables en la tabla. Al pulsar "Editar borrador" pasan a ser inputs/selects editables. |
| RE-8 | Dado ningún campo con consumidores nombrados por el impacto, entonces la tabla NO tiene la columna "Usado por" (ni el selector de columnas la ofrece). Si al menos un campo tiene uso, la columna aparece. |
| RE-9 | Dado un grupo (p. ej. "Dato de la alerta"), entonces el nombre del grupo aparece UNA sola vez como título (encabezado de la tabla), no un h3 más el título del DataTable. |
| RE-10 | Dado el checklist de campos esenciales, entonces "Valores:" lista como máximo 3 valores ordenados por frecuencia, cada valor de más de 24 caracteres se recorta con "…" (nunca un UUID completo en línea), seguido de `+N más` si hay más de 3; formato `valor: frecuencia`. Los datos del API no cambian. |
| RE-11 | Dado el panel lateral de un campo (`Detalles <id>`), entonces hay dos casillas: "Es un identificador" y "Disponible al momento de decidir" (marcada por defecto), cada una con texto de ayuda que explica el efecto en las variables del modelo (identificador: no aporta señal, se excluye; no disponible: filtraría la respuesta, se excluye). Editables solo en borrador. |
| RE-12 | Dado un campo con `is_identifier===true`, la columna Marcas muestra el chip "Identificador"; con `available_at_decision===false`, el chip "Posterior a la decisión", junto a Core/Sensible/Obligatorio. Campos de versiones viejas (banderas ausentes) no muestran ninguno. |
| RE-13 | Dado un campo que es Desenlace (etiqueta) y además identificador, entonces `schema-validation-errors` muestra "<campo>: no puede ser etiqueta e identificador." y Guardar/Proponer quedan deshabilitados. |
| RE-14 | Dado un campo nuevo ("+ Campo"), entonces nace con identificador=no y disponible al decidir=sí; al guardar, el borrador envía ambas banderas al backend. |
| RE-15 | Dado un borrador donde solo cambia una de las banderas, entonces el contador de la banda sube ("Borrador con 1 cambio") y en "Propuestas" el diff lista el campo con `identificador: no → sí` / `disponible al decidir: sí → no`. Una bandera ausente en la versión base se compara como su valor por defecto (no genera cambio falso). |

## 3. Selectores estables

- Banda: `schema-status-band`, `schema-status-summary` (contenedor de chips), `schema-primary-action`; chips `schema-chip-version`, `schema-chip-viewed`, `schema-chip-essentials`, `schema-chip-optional`, `schema-chip-review`, `schema-chip-sensitive` (atributo `data-tone`: `ok|warn|bad|neutral`).
- Textos de la banda: `Activa vN`, `Esenciales: n/m obligatorios ✓`, `Opcionales: n/m`, `Por revisar: m`, `Sensibles sin estrategia: s`.
- Solo lectura: `field-text-<id>` (texto del Campo). Sin borrador no existen `Campo <id>`, `Nombre <id>`, `Tipo <id>`, `Rol <id>`.
- Drawer: aria-labels `Es un identificador <id>` y `Disponible al momento de decidir <id>`.
- Chips de tabla: `chips-<id>` con "Identificador" / "Posterior a la decisión".
- Pestañas de configuración: botón "Esquema" (SectionTabs "Secciones de configuración"); pestañas del esquema: SectionTabs "Secciones del esquema". Ver en `e2e/` los demás selectores de REQ-A (sin cambios).

## 4. Escenario E2E / visual (manager con `alert_schema`, `/configuracion` → Esquema)

1. Abrir `/configuracion`, pulsar "Esquema". Esperado: sin scroll se ven h1, barra de pestañas de configuración (Esquema resaltada), banda con chips y las pestañas del esquema. No hay banner naranja, ni selector de configuración, ni grafo, ni solicitudes de despliegue, ni pie fijo (RE-1, RE-2).
2. Leer la banda. Esperado: `Activa v78`, `Esenciales: 7/7 obligatorios ✓` (verde), `Opcionales: 0/2`, `Por revisar: <m>` gris, `Sensibles sin estrategia: <s>` (verde si 0) (RE-3, RE-5).
3. Pestaña "Campos esenciales". Esperado: distribución sin UUIDs completos, máx. 3 valores (RE-10).
4. Pestaña "Campos". Esperado: texto plano en Campo/Nombre/Tipo/Rol; sin columna "Usado por"; título "Dato de la alerta" una vez; `customer_id` con chip "Sensible" (o "Sensible sin estrategia" en rojo si no tiene estrategia) (RE-7..RE-9).
5. `Detalles customer_id`. Esperado: casillas "Es un identificador" y "Disponible al momento de decidir" deshabilitadas (solo lectura) con su ayuda (RE-11).
6. "Editar borrador" → en Detalles marcar "Es un identificador". Esperado: chip "Identificador" en la fila, banda "Borrador con 1 cambio" (ámbar), "Propuestas" muestra `identificador: no → sí` (RE-6, RE-12, RE-15). Descartar borrador.
7. En un borrador, cambiar una etiqueta a identificador. Esperado: error "no puede ser etiqueta e identificador" y Guardar deshabilitado (RE-13). Descartar.
8. Pulsar otra pestaña de configuración (p. ej. "General"). Esperado: reaparecen selector, grafo, solicitudes y pie como antes (RE-2).

Automatizado: `e2e/alert-schema-real-api.spec.ts` (pasos 1-4: textos de banda, ausencia del contexto, pestañas por encima del alto del viewport, texto plano). No hay E2E que mute el esquema activo.

## 5. Datos necesarios

Esquema activo local v78 con 65 campos, 4 etiquetas (Desenlace), `customer_id` sensible; roles esenciales asignados para los 7 obligatorios. Una versión propuesta candidata con impacto (opcional). El backend (agente D) debe devolver `is_identifier`/`available_at_decision`; si no, el frontend asume false/true.

## 6. Selectores que cambiaron respecto de REQ-A

- Banda: `esenciales n/9`, `por revisar m`, `sensibles sin estrategia s` -> `Esenciales: n/m obligatorios ✓`, `Por revisar: m`, `Sensibles sin estrategia: s` (+ `Opcionales: n/m`). `schema-status-summary` es ahora un contenedor `div` de chips (antes `p`).
- Sin borrador ya NO existen `textbox "Campo <id>"`, `textbox "Nombre <id>"`, `combobox "Tipo <id>"`, `combobox "Rol <id>"` (texto plano; existen solo en borrador). Nuevo `field-text-<id>`.
- Columna "Usado por" ausente salvo uso real (RA-10 ya no la lista siempre).
- Ya no hay `h3` con el nombre del grupo dentro de `fields-role-<rol>`; el título es el `h2` del DataTable.
- En `/configuracion` con Esquema activo desaparecen todos los elementos de versionado de configuración y el pie fijo.
- Distribución: ya no `k: v` x4 sin recorte; ahora orden por frecuencia, máx. 3, `+N más`.

## 7. Decisiones y deuda

- `saveAlertSchemaDraft` envía `data` tal cual (`JSON.stringify`), así que las dos banderas viajan sin cambios; no hizo falta editar `alertSchema.functions.ts`. Depende de que el backend las acepte en el draft.
- Ocultar es visibilidad, no desmontaje de queries: las queries de versionado siguen ejecutándose en segundo plano en Esquema (decisión para no tocar estado ni localStorage). Deuda: pausarlas con `enabled` si el costo importa.
- No hay prueba vitest del route `/configuracion` (2900 líneas, sin harness existente); RE-1/RE-2 los cubren el E2E y la revisión visual del orquestador.
- "Es un identificador" no se bloquea para etiquetas; la validación local lo avisa (mismo texto que usará el backend).
- Con un obligatorio faltante el chip va rojo; los opcionales jamás alarman.
- `distributionText` se exporta desde el checklist (para test); genera un warning react-refresh como los existentes.

## 8. Resultados reales

- `npx vitest run src/test/alert-schema-ux.test.tsx src/test/alert-schema-editor.test.tsx src/test/alert-schema-view.test.tsx src/test/alert-schema-roles.test.ts`: 4 archivos, 41 tests, todos pasan.
- `npx tsc --noEmit`: 7 errores, todos previos y ajenos (AgentPanel x4, ConfigurationVersionGraph, biblioteca.vector-store.test, reasoning-evaluation.test); ninguno en archivos del Esquema ni en `configuracion.tsx`.
- `npx eslint` sobre `schema/`, `alert-schema-ux.test.tsx` y el e2e: 0 errores nuevos; 4 errores previos del e2e (no-empty-pattern línea ~13, no-useless-escape ~560, no-explicit-any ~853) y warnings react-refresh. `configuracion.tsx` no se pasó por prettier (ya no lo cumplía antes).
- E2E real no ejecutado (sin docker/build por instrucción).
