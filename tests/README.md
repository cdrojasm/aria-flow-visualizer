# Pruebas de frontend

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
