# Pruebas de frontend

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
