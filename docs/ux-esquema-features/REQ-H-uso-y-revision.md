# REQ-H: Uso de campos del esquema y revisión de modelos

## 1. Resumen

Cierra dos deudas del esquema de alerta:

1. La columna "Usado por" de la tabla de campos (Configuración -> Esquema -> Campos) ahora se alimenta de `GET /api/v0/alert-schema/usage?version=<n>` (modelos y configuraciones que usan cada campo). Antes se derivaba solo de `impact` y nunca tenía datos, así que la columna estaba siempre oculta.
2. Un modelo muestra con qué versión del esquema se entrenó ("Esquema vN") y, si un esquema aprobado cambió un campo que usa, un chip ámbar "Requiere revisión" (`schema_review.required`). El asistente envía `alert_schema_version` al crear el modelo.

Contrato backend (agente G): A) `usage` -> `{version, fields:{<field.id>:[{kind:"model"|"configuration", name, ref}]}}`; B) modelo con `alert_schema_version` y `schema_review{required, trained_version, active_version, changed_fields}`; creación acepta `alert_schema_version`. El front tolera su ausencia (null / `required=false`; endpoint caído => columna oculta, sin error).

## 2. Requisitos verificables visualmente

| ID | Dado | Cuando | Entonces |
|----|------|--------|----------|
| RH-1 | Manager, esquema activo con al menos un campo usado por un modelo/configuración | Abre `/configuracion` -> Esquema -> Campos | Aparece la columna "Usado por"; el campo usado muestra chips `Modelo · <tag>` / `Configuración · <nombre>`; los demás muestran "—" |
| RH-2 | Un campo con 3 o más consumidores | Mira su celda "Usado por" | Se ven 2 chips y un chip "+N"; al pasar el cursor, `title` con el detalle (tipo, nombre y ref) |
| RH-3 | Ningún campo tiene consumidores (o el endpoint falla) | Abre Campos | La columna "Usado por" no aparece y no hay mensaje de error |
| RH-4 | Campo con consumidores | Pulsa "Detalles" del campo | El panel lateral muestra un aviso ámbar "Lo usan: ... Cambiar este campo puede requerir revisar esos modelos o configuraciones." |
| RH-5 | Campo sin consumidores | Abre su "Detalles" | No hay aviso de impacto; "Usado por: —" |
| RH-6 | Analista, modelo con `alert_schema_version` | Abre `/modelos` | En la columna Tag, bajo la descripción, se ve "Esquema vN" |
| RH-7 | Modelo con `schema_review.required=true` | Abre `/modelos` | Junto a "Esquema vN" hay un chip ámbar "Requiere revisión"; su `title` lista los campos cambiados |
| RH-8 | Modelo con `required=false` o sin pin (modelo antiguo) | Abre `/modelos` | No hay chip; sin pin tampoco hay "Esquema vN" |
| RH-9 | Cualquiera de los anteriores | Abre el detalle/resultados del modelo (diálogo) | En la cabecera se repite "Esquema vN" y el chip si aplica |
| RH-10 | Asistente de modelos con esquema vigente vN | Pulsa "Guardar borrador" o "Guardar y entrenar" | La petición `POST /api/v0/models` lleva `alert_schema_version = N`; el modelo creado muestra "Esquema vN" en `/modelos` |

## 3. Selectores estables

- `usage-<fieldId>`: contenedor de chips "Usado por" de la fila (solo si hay consumidores).
- Encabezado de columna con texto "Usado por" (dentro de `fields-role-<role>`).
- `field-usage-warning`: aviso en el panel lateral (`field-detail`, dentro de `side-drawer`).
- `model-schema-version`: texto "Esquema vN".
- `model-schema-review`: chip "Requiere revisión" (atributo `title` = campos cambiados).
- Existentes que se mantienen: `fields-role-*`, `chips-<id>`, `field-text-<id>`, botón "Detalles <id>".

## 4. Escenario E2E / visual (stack local, vía `http://localhost`, API real por `/api/...`)

Preparación: stack reconstruido con el backend del agente G. Crear usuario de prueba manager y analista (ver memoria `aria-local-auth-test-user`).

Parte 1 (manager, `/configuracion` -> Esquema -> Campos):
1. Asegurar que existe un modelo entrenado/creado con el esquema activo que use un campo (por ejemplo `monto`), o una configuración que lo referencie.
2. Abrir Campos. Esperado: columna "Usado por"; la fila del campo usado tiene `usage-<id>` con `Modelo · <tag>` (RH-1). Con 3+ consumidores aparece "+N" (RH-2).
3. Pulsar "Detalles" de ese campo. Esperado: `field-usage-warning` (RH-4). Abrir el de un campo sin uso: sin aviso (RH-5).
4. Si en un esquema sin consumidores (instancia limpia) no hay datos: la columna no aparece (RH-3).

Parte 2 (analista, `/modelos`):
5. Crear un modelo con el asistente (Guardar borrador). Esperado en la lista: "Esquema v<activa>" sin chip (RH-6, RH-8, RH-10). Verificar con `read_network_requests` que el POST lleva `alert_schema_version`.
6. Provocar `schema_review.required=true`: con el modelo creado en el paso 5 (pinned a la versión N que usa el campo `monto`), como manager editar el esquema: crear borrador desde la activa, cambiar el tipo (o la ubicación) del campo `monto`, guardar, proponer y aprobar con un segundo manager (el proponente no puede aprobar) confirmando "Entiendo el impacto". Esto activa la versión N+1 con `monto` cambiado.
7. Volver a `/modelos` como analista. Esperado: junto al modelo, "Esquema vN" y chip ámbar "Requiere revisión" con `title` que lista `monto` (RH-7). Abrir el detalle del modelo: misma información en la cabecera (RH-9).
8. Un modelo creado después de la aprobación (pinned a N+1) no muestra el chip (RH-8).

Alternativa rápida si no se quiere aprobar un esquema: sembrar en DynamoDB local un modelo con `alert_schema_version` antigua y un campo cambiado entre esa versión y la activa; el backend calcula `schema_review` comparando ambas.

## 5. Datos necesarios

- Esquema activo con campos (p. ej. `monto`, `canal`) y al menos 1 modelo o configuración que use un campo.
- Dos usuarios manager (proponer y aprobar) y un analista.
- Dataset con etiqueta para crear un modelo desde el asistente.

## 6. Decisiones / deuda

- Para un borrador, el uso se consulta con la versión base (`based_on_version`), porque un borrador no tiene consumidores propios; para versiones vistas, con su propia versión.
- Los chips combinan el endpoint de uso con las etiquetas de `impact` (compatibilidad); duplicados posibles si ambas fuentes reportan lo mismo, aceptable por ahora.
- "Esquema vN" usa `alert_schema_version` y, si falta, `schema_review.trained_version`.
- No se añadió un botón de "revisar" ni reentrenar desde el chip: solo informativo.
- Deuda: no hay filtro "Requiere revisión" en la lista de modelos; no hay enlace desde el consumidor al modelo/configuración (el `ref` solo va en el `title`).
- Pendiente del orquestador: E2E real y revisión visual (no se ejecutó docker/E2E).

## 7. Resultados REALES

- `npx vitest run src/test` (toda la carpeta): 22 archivos, 153 tests, todos pasan. Nuevos: 2 tests en `alert-schema-ux.test.tsx` (chips + "+1", aviso del panel), 1 en `model-wizard-ui.test.tsx` (la creación envía `alert_schema_version: 7`), 3 en `model-schema-badge.test.tsx` (con revisión, sin revisión, sin pin).
- `npx tsc --noEmit`: sin errores nuevos de mis archivos; queda un error ajeno en `src/test/feature-guards-sensitive-suspect.test.ts` (export `Recipe` de `FeatureRecipeWorkspace`, trabajo de otro agente) además de los previos ignorados.
- `npx eslint` sobre mis archivos: 0 errores (solo warnings `react-refresh/only-export-components` preexistentes del directorio schema).
