# Especificación: E2E integral del frontend ARIA

## Objetivo

Definir una suite Playwright que recorra los flujos de negocio visibles en el
frontend contra la plataforma local completa: frontend, nginx, API, workers,
almacenamiento y servicios requeridos. La suite comprobará lo que ve cada
persona usuaria, el estado persistido y los permisos del rol que ejecuta la
acción.

El alcance incluye configuración, biblioteca y vector stores, datasets,
entrenamiento y activación de modelos, simulación, proceso de alertas, cola,
marcación y remarcación, métricas, reportes y respaldos.

Esta especificación amplía el trabajo de esquema de alertas. No reemplaza sus
reglas de seed, limpieza, privacidad ni los siete roles del sistema.

## Estado de cobertura observado

| Spec | Naturaleza | Cobertura actual |
| --- | --- | --- |
| e2e/alert-schema-real-api.spec.ts | API/UI real, sin mock de /api/v0 | C1–C6: gobierno y comparación del esquema, lote de cinco filas, alerta canónica/raw auditado/historial/exportación, métricas con corte visible de versión, sugerencias/campos de sistema y simulador. Verificado contra la API local: 6/6 pasaron. `E2E_FROM=1..6` permite reanudar sin limpiar; `E2E_FROM=0` ejecuta la suite completa desde cero. |
| e2e/alert-schema-governance.spec.ts | UI con API simulada | Bloqueo de autoaprobación y recorrido de prueba con esquema candidato. |
| e2e/event-simulation.spec.ts | UI con API simulada | Crear, previsualizar e iniciar escenario. |
| e2e/vector-store.spec.ts | UI con API simulada | Agregar expansión de taxonomía y retirar relaciones de documentos. |

Hay pruebas unitarias/de componentes para páginas de métricas, esquema,
comparación de pruebas, vector store y helpers. No comprueban la integración
real UI → API → worker → persistencia.

## Roles y límites de acceso

La suite usa un usuario distinto por rol; no cambia el rol en el cliente ni
simula sus permisos. Cada fila se valida en navegación, ruta directa y API
cuando el backend expone la operación.

| Rol | Áreas que muestra actualmente la navegación | Acciones relevantes |
| --- | --- | --- |
| manager | Dashboard, cola, histórico de fraude, monitor, configuración y respaldos | Operación/configuración, esquema de alertas, acceso raw, revisión de fraude, reportes y respaldos. El backend limita respaldos a manager. |
| release_manager | Áreas de manager excepto respaldos, más Testing | Aprobar propuestas de esquema y despliegues; ejecutar pruebas; no aprobar su propia propuesta. |
| channel_manager | Dashboard, cola, histórico, monitor, Testing, Biblioteca, Configuración y Modelos | Configuración por segmento, biblioteca, features/modelos y revisión de fraude. No tiene permiso backend alert_schema. |
| data_analyst | Monitor, Testing, Biblioteca y Modelos | Biblioteca, análisis/testing/modelos; no dashboard, cola, histórico ni configuración. |
| fraud_analyst | Cola | Tomar, resolver y remitir alertas; no leer raw ni operar áreas administrativas. |
| ops_analyst | Dashboard, cola y monitor | Consultar métricas operativas y cola; sin revisión de fraude ni administración. |

Ocultar un enlace no basta como control: probar rutas y endpoints no permitidos
y comprobar 403, redirección o estado denegado según el contrato real. Verificar
permisos desde auth/me; no inferirlos sólo de la navegación.

## Reglas técnicas

- Los escenarios de integración no interceptan ni simulan /api/v0/**.
- Las pruebas rápidas con mocks viven separadas y no cuentan como cobertura real.
- El frontend accede a la API exclusivamente por nginx y mismo origen.
- Usar fixtures sintéticos, identificadores únicos con prefijo e2e- y usuarios
  dedicados recibidos por variables de entorno. Nunca registrar tokens,
  contraseñas ni filas sensibles.
- La limpieza se hace por endpoint/API E2E protegida. Playwright no conecta
  directamente a DynamoDB, OpenSearch ni buckets.
- El seed debe ser idempotente y crear/reutilizar usuarios, configuración
  activa, dataset reducido, esquema v1/v2, entidades de biblioteca y recursos
  de modelo necesarios. No debe generar duplicados por ejecución.
- Esperar jobs mediante endpoints de polling y estados terminales, no con
  pausas fijas.
- Cada prueba debe poder ejecutarse sola después del seed y limpiar sus
  recursos (escenarios, corridas, modelos y datasets temporales).
- No exigir que un LLM elija una decisión específica. Afirmar contratos
  deterministas, estados terminales y separación de labels.
- Los errores de infraestructura deben indicar la dependencia; no convertirse
  en éxito silencioso ni en skip salvo que la suite sea explícitamente opcional.

## Flujos E2E requeridos

### E00 — Login, navegación y autorización por rol

Para cada uno de los seis roles:

1. Iniciar sesión por UI y verificar identidad y etiqueta de rol.
2. Comparar navegación visible con la matriz de roles.
3. Abrir rutas no visibles y confirmar el comportamiento acordado.
4. Probar al menos un endpoint permitido y uno denegado por rol.
5. Cerrar sesión; comprobar que desaparece el token y una ruta protegida vuelve
   a login.

### E01 — Configuración, versiones y despliegue

Con channel_manager, manager y release_manager:

1. Crear/editar borrador y comprobar validaciones.
2. Guardar versión, recargar y comprobar persistencia.
3. Ejecutar Probar configuración y esperar la corrida hasta estado terminal.
4. Crear solicitud de despliegue y verificar preview/impacto.
5. Aprobar con el rol autorizado y confirmar versión activa.
6. Probar que el solicitante no se aprueba a sí mismo cuando aplica.
7. Cubrir cambios inmediatos de OperationsPanel y comprobar historial.
8. Verificar tabs visibles/editables por rol: channel_manager trabaja en
   configuración segmentada; manager/release ven secciones administrativas
   según permisos.

### E02 — Gobierno del esquema de alertas

Con manager y release_manager:

1. Ver Campos, Campos de sistema, Propuestas y Sugerencias.
2. Crear y proponer una versión desde manager.
3. Comprobar comparación de campos agregados, modificados y retirados,
   reasignación de roles e impacto.
4. Confirmar que el autor no puede autoaprobar.
5. Aprobar con otro usuario autorizado y reconocer impacto.
6. Comprobar autor, aprobador, estado e historial tras recargar.
7. Confirmar permisos de lectura/escritura y denegación a roles no autorizados.
8. Ejecutar análisis diario y verificar fecha, esquema, alertas, ubicaciones,
   distribuciones de roles y sugerencias.
9. Verificar qué roles pueden consultar reporte y campos de sistema.

El job diario debe ejecutarse antes de la prueba UI que inspecciona el reporte.
Hoy make e2e-real lo ejecuta después de Playwright; reordenar el pipeline o
ejecutar un spec de presencia posterior al job.

### E03 — Biblioteca, entidades y vector stores

Cubrir los tabs de Biblioteca en API real/UI:

- Base de conocimiento: taxonomías, modus operandi, yellow flags, red flags,
  casos similares y vector stores.
- Catálogos de eventos/canales.
- Listas negras y blancas.
- Datasets y esquema visible al rol permitido.

Para cada entidad CRUD aplicable:

1. Crear registro sintético, editarlo, activar/desactivar y eliminarlo.
2. Recargar y comprobar persistencia.
3. Validar relaciones y restricciones de eliminación.
4. Verificar visibilidad y permisos por rol.

Para vector stores:

1. Crear instancia/versión desde UI.
2. Seleccionar entidades, inspeccionar preflight/impacto y agregar documentos.
3. Comprobar expansión de taxonomía y relaciones persistidas.
4. Eliminar relación sin borrar la entidad fuente.
5. Promover versión y comprobar cuál queda activa.
6. Ejecutar flujo de agente configurado para consultar esa instancia y
   comprobar la versión referenciada.

El E2E actual de vector store simula la API; este flujo real está pendiente.

### E04 — Datasets

Desde Biblioteca y pantallas consumidoras:

1. Subir fixture CSV sintético y esperar análisis asíncrono.
2. Abrir resumen, mapping y filas; buscar/inspeccionar una fila.
3. Editar/guardar mapping de exportación y comprobar persistencia.
4. Crear dataset vacío y derivar subconjunto con filtros/selección.
5. Descargar plantilla CSV y comprobar nombre, encabezados y tipo.
6. Eliminar sólo datasets temporales y esperar el borrado final.
7. Probar columnas incompatibles/archivo inválido sin corromper datos existentes.

No confundir Al dataset de una alerta (curación de input + labels) con el
mapping de exportación a formato externo: son flujos distintos y ambos deben
probarse.

### E05 — Entrenamiento y activación de modelos

Con channel_manager o data_analyst:

1. Crear modelo usando dataset/target sintéticos.
2. Configurar features/recetas e importar/exportar definiciones si aplica.
3. Iniciar entrenamiento y comprobar operación y estados DRAFT → TRAINING →
   READY o FAILED.
4. Abrir resultados, métricas y diagnóstico de features.
5. Activar modelo listo; comprobar que uno no listo no se puede activar.
6. Consultar desde una prueba de agente que el modelo activo se usa cuando la
   configuración lo habilita.
7. Verificar borrado y restricciones para modelo activo.

No hay actualmente E2E real de este recorrido.

### E06 — Simulador de eventos

Con roles que tienen Testing:

1. Sembrar generadores desde dataset/esquema activo.
2. Comprobar exclusión de labels/desenlaces, sustitución de valores sensibles,
   pesos categóricos y generador numérico.
3. Crear borrador, validar y previsualizar eventos.
4. Iniciar escenario y verificar RUNNING, eventos emitidos y estado terminal
   o pausado.
5. Pausar, reanudar y detener; confirmar transiciones válidas e inválidas.
6. En modo pipeline vivo, localizar alerta generada y seguirla a cola/histórico;
   en modo dataset, verificar filas en destino.
7. Eliminar escenario temporal por API y comprobar que no persiste.

### E07 — Procesamiento y atención de alertas

Con manager, fraud analyst y ops analyst según la acción:

1. Crear alerta sintética por flujo soportado (UI/simulador/API de prueba).
2. Esperar workflow/operación y verificar alerta canónica, input, labels,
   history_prev_alerta, agent_output y schema_version.
3. Confirmar que labels quedan fuera de input/prompt y que se procesan los siete
   roles obligatorios.
4. Verificar formato regional, valores opcionales faltantes y escalamiento
   cuando falta un rol obligatorio.
5. Verificar raw enmascarado para rol permitido, denegado para rol no permitido
   y auditoría del acceso.
6. Encontrar alerta en cola, tomarla como fraud analyst, comprobar reserva,
   resolverla y validar estado; probar liberación y conflicto de concurrencia.
7. Abrir detalle y recorrer resumen, razonamiento, datos, usuario e historial.
8. Usar Al dataset; verificar dataset, feedback y contenido curado.

El backend registra acceso raw en object storage. En local E2E, un endpoint
protegido consulta sólo los registros del alert ID solicitado; Playwright no
se conecta directamente al bucket. Ese endpoint está deshabilitado fuera del
entorno local con la limpieza E2E habilitada.

### E08 — Marcación, remarcación e histórico de revisiones

Con rol con fraud_review:

1. Confirmar la marca original de ARIA en Histórico de Gestión de Fraude.
2. Corregirla a otro resultado con justificación válida.
3. Verificar nuevo fraud_label, contador, autor, fecha y trail append-only.
4. Confirmar el mismo resultado y comprobar que queda como confirmación sin
   perder revisiones anteriores.
5. Cambiarla otra vez y verificar que la UI distingue marca original y
   resultado revisado.
6. Importar CSV válido, comprobar operación/filas actualizadas y origen; probar
   CSV inválido/duplicado y errores por fila.
7. Confirmar que roles sin fraud_review no pueden corregir ni importar.
8. Verificar efectos en Dashboard, Monitor e Histórico respetando maduración.

No hay actualmente E2E integral de remarcación.

### E09 — Testing de corridas

Con release_manager y channel_manager:

1. Iniciar corrida de cinco filas con configuración y esquema elegidos.
2. Esperar estado terminal en API y su reflejo en UI.
3. Validar casos, comparación active/candidate, cambios de campos/roles,
   input/labels y pasos del workflow.
4. Confirmar que ninguna etapa/prompt recibe labels de evaluación.
5. Abrir detalle de caso y revisar pipeline, datos y resultados.
6. Reintentar conservando configuración/versiones que la UI prometa conservar.
7. Borrar corridas seleccionadas y verificar que desaparecen.
8. Probar errores de dataset, tamaño y rol.

### E10 — Dashboard y Monitor

Dashboard:

1. Verificar filtros de fecha/dimensiones y datos reales de métricas.
2. Comprobar KPIs, funnel, distribuciones, desglose por esquema y filtros
   aplicados a consultas.
3. Descargar CSV y validar contenido, filtros, rango, zona horaria, encabezados
   y caracteres acentuados.
4. Verificar acceso por rol y periodos vacíos/parciales.

Monitor:

1. Verificar métricas de agente/técnicas, periodos, filtros, maduración y estado
   operativo/degradado.
2. Comprobar que los filtros actualizan ambas consultas con mismo rango.
3. Verificar permisos por rol y respuesta sin datos.

La UI actual descarga CSV desde Dashboard. Monitor no muestra descarga; no
declarar esa exportación cubierta hasta que el producto la implemente.

### E11 — Respaldos

La ruta /backups y la API están disponibles en los cambios locales actuales,
con acceso restringido a manager:

1. Manager solicita respaldo y ve queued/running/succeeded o failed.
2. Esperar transición por polling; comprobar solicitante, fecha, directorio y
   conteos de DynamoDB/OpenSearch/object storage.
3. Manager consulta historial; otros roles reciben denegación y no ven el menú.
4. Manejar error del worker y actualizar historial.

No restaurar backups automáticamente en la suite: la restauración es
destructiva y requiere escenario aislado explícito.

## Datos de prueba y aislamiento

El seed E2E debe incluir:

- Cuentas separadas para manager, release manager y los roles probados.
- Configuración activa y versión de prueba promocionable sin afectar entornos
  compartidos.
- Esquema base con siete roles obligatorios y labels separados.
- Dataset sintético pequeño con más de un canal, valores numéricos, valor
  sensible ficticio y labels.
- Taxonomía, modus operandi, flags, caso similar, canal y watchlist E2E.
- Instancia de vector store aislada o namespace/documentos con prefijo e2e-.
- Dataset/modelo temporal para entrenamiento cuando el entorno tenga worker.

Todos los recursos temporales llevan prefijo e2e- y se eliminan por API. Un
finally de limpieza no debe ocultar el error original. Probar limpieza completa
previa e individual por separado.

## Pipeline real

Mantener dos modos:

1. UI rápida: mocks deterministas para regresiones visuales; no cuenta como
   integración real.
2. Integración real: nginx, frontend, API y workers locales, sin interceptar
   /api/v0.

El pipeline real debe preparar servicios, limpiar y sembrar por API, ejecutar
presencia antes de su prueba UI, ejecutar Playwright por grupos, validar
descargas y side effects, limpiar recursos creados y publicar resumen de
pasados/fallidos/omitidos, roles, recursos y dependencias. No exponer secretos.
Integrar comandos a los targets make e2e-* existentes y documentar variables
de entorno; nunca poner contraseñas en código.

## Criterios de aceptación

- Cada flujo E00–E11 tiene al menos un E2E con API real; E00 cubre seis roles.
- Alertas, remarcación, configuración, vector store, modelo y simulador se
  completan desde UI y verifican estado por API.
- Todo job asíncrono llega a estado conocido y la UI lo refleja.
- Operaciones no autorizadas fallan según contrato en UI/ruta/API.
- No hay credenciales ni datos productivos en repo, artefactos o logs.
- La limpieza deja plataforma reutilizable.
- El CSV de Dashboard se descarga y valida; Monitor queda pendiente hasta tener
  exportación en UI.
- La suite real corre completa en entorno local documentado. --list, typecheck
  y suites con mocks no se reportan como validación real.

## Dependencias y huecos

1. Ejecutar presencia antes de la prueba E2E que lee su reporte.
2. Exponer verificación protegida de auditoría raw sin acceso directo a storage.
3. Añadir descarga de reporte en Monitor si es requisito.
4. Confirmar endpoints de entidades, modelos, remarcación masiva, escenarios y
   respaldos habilitados en entorno local.
5. Si promover vector store llama proveedor externo, usar integración local/
   aislada que mantenga API real del producto.
6. Definir entrenamiento rápido/determinista con worker y almacenamiento
   aislados, sin infraestructura compartida.

## Entrega por etapas

1. Base segura: E00, seed multirol, polling, trazas y limpieza.
2. Operación diaria: E07, E08, E10.
3. Configuración y datos: E01, E02, E03, E04.
4. ML y simulación: E05, E06 con workers locales.
5. Administración: E11 y permisos/errores de respaldos.

Cada etapa debe aportar escenarios ejecutables y evidencia; no dejar specs
verdes sólo por mocks en el target de integración real.
