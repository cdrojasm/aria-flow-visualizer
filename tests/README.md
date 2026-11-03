# Pruebas de frontend

## E04: gestión de datasets (API simulada)

El E2E de Biblioteca recorre la carga de un CSV, el resumen y las filas,
el mapping de exportación, la descarga de plantilla, la derivación filtrada,
la creación de un dataset vacío y el borrado temporal. También verifica que un
CSV con columnas incompatibles sea rechazado sin crear un dataset.

```bash
npm run test:e2e -- datasets
```

La prueba simula el borde HTTP; no valida la persistencia ni las reglas del
backend real.

### Escala con API real

`e2e/datasets-real.spec.ts` toma una muestra aleatoria determinista de
`training_dataset_xgboost.csv` (25, 100, 300 y 900 filas), comprueba que sus
54 columnas coincidan con `dataset_ejemplo.csv` y que incluya los campos ARIA
requeridos. Antes de cargar, anonimiza identificadores y datos de contacto,
incluidos los campos anidados de transacciones. Las particiones se guardan en
`/private/tmp/aria-e04-partitions` y se borran del backend al terminar. El test
registra los tiempos de subida, análisis y lectura de filas en un artefacto
JSON de Playwright.

Si defines `E2E_MANAGER_EMAIL` y `E2E_MANAGER_PASSWORD`, el test usa esa cuenta.
Si faltan, inicia el flujo local con `make -C ../backend local-auth-up`, crea o
renueva por API un usuario reutilizable `manager` (`e04-datasets-e2e@aria.test`)
y genera una contraseña aleatoria sólo en memoria. Para una fuente en otra ruta,
define `E2E_DATASET_SOURCE` y `E2E_DATASET_SCHEMA_SAMPLE`:

```bash
E2E_MANAGER_EMAIL=... E2E_MANAGER_PASSWORD=... npm run test:e2e:datasets:real
```

La prueba usa el API real publicado en `http://localhost` (o
`ARIA_E2E_BASE_URL`) y crea datasets temporales con nombres únicos. El backend
no expone borrado de usuarios, así que la cuenta E2E local queda registrada y
se reutiliza en ejecuciones futuras; el test sólo limpia los datasets que crea.
El aprovisionamiento automático requiere Docker y sólo se permite con un API
local. No ejecutes contra una base compartida o productiva.

## E00: login, navegación y autorización por rol (API real)

Este recorrido usa la pantalla real de login y el backend real. Para cada cuenta
configurada valida el inicio de sesión, el rol mostrado, los enlaces permitidos
y la redirección al intentar abrir una ruta restringida. Las cuentas son
opcionales por rol; cada caso sin credenciales queda marcado como omitido.

Configura `E2E_<ROL>_EMAIL` y `E2E_<ROL>_PASSWORD` para los roles que quieras
cubrir: `MANAGER`, `CHANNEL_MANAGER`, `RELEASE_MANAGER`, `DATA_ANALYST`,
`FRAUD_ANALYST` y `OPS_ANALYST`. El servidor de la aplicación/API debe estar
disponible en `http://127.0.0.1`, o define `ARIA_E2E_BASE_URL`.

```bash
npm run test:e2e:auth:real
```

La cobertura ejecutada depende de las cuentas configuradas. Para declarar E00
completo, revisa que los seis casos aparezcan como aprobados y no omitidos.

## E01: configuración, versiones y despliegue (API real)

Este recorrido real consulta el historial de una versión probada e inactiva,
solicita su despliegue con una cuenta `channel_manager` y la aprueba desde la
interfaz con una cuenta `manager`. Después reactiva la versión que estaba activa
al inicio para dejar el entorno en su estado previo. La solicitud aprobada queda
en el historial de auditoría.

Ejecuta la prueba únicamente contra un entorno E2E aislado. Configura
`E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD`, `E2E_CHANNEL_MANAGER_EMAIL`,
`E2E_CHANNEL_MANAGER_PASSWORD`, `E2E_DEPLOY_CONFIGURATION_ID` y
`E2E_DEPLOY_VERSION`. La versión indicada debe estar probada e inactiva; la
versión activa actual también debe ser reactivable.

```bash
npm run test:e2e:configuration:real
```

El spec valida los prerrequisitos antes de crear la solicitud. La activación y
la restauración son operaciones reales del backend; si la restauración falla,
el entorno puede quedar en la versión objetivo y debe revisarse antes de volver
a ejecutar la prueba.

## Vector Store: caso de uso cubierto

La suite cubre el recorrido de un usuario autenticado que agrega una taxonomía
a una instancia de Vector Store, revisa el impacto de sus activos relacionados,
confirma la operación y quita únicamente la relación, manteniendo el activo en
la biblioteca.

```bash
npm run test:web:component
npm run test:e2e -- vector-store
```

También se puede invocar mediante `make`:

```bash
make test-web-component-vector-store
make test-e2e-vector-store
```

La prueba de componentes usa Vitest, React Testing Library y MSW. Simula la
API y valida la semántica de la pantalla sin levantar servicios externos. La
prueba E2E usa Playwright, ejecuta la aplicación en un navegador Chromium y
simula el borde HTTP para validar el recorrido visible completo. La persistencia
real y el grafo de relaciones se verifican separadamente en backend con:

```bash
make test-integration-docker-vector-store
```

Antes de ejecutar Playwright por primera vez, instala el navegador:

```bash
npx playwright install chromium
```
