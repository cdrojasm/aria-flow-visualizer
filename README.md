# Información del Stack __aria-agente-prevencion-fraude-frontend__

| **Campo**              | **Valor**                          |
|------------------------|------------------------------------|
| **Namespace**          | capf0000.co.dsg                          |
| **Repository Locator** | //scrs.central/ns/capf0000.co.dsg/repositories/272311bd-4f82-4207-9394-ecfd816eddd3 |
| **UUAA**               | CAPF0000 |
| **Region**             | central            |
 | **BU**                 | COLOMBIA                 |


<!-- PROJECT SHIELDS -->
[![#ONE compliant](https://img.shields.io/badge/ONE-compliant-brightgreen.svg?style=flat-square)](https://platform.bbva.com/one/start/1VDEMUTsCUDROAo1kGex0Ox6Mgk38gwbLFwgXS0iDB54/que-es-one)

<!-- ABOUT THE PROJECT -->
## Acerca del Proyecto

Bienvenido a **aria-agente-prevencion-fraude-frontend**. Aquí tienes una plantilla en blanco para comenzar. Describe brevemente el propósito y la funcionalidad del proyecto, así como cualquier información relevante que los usuarios deban saber.

### Construido con 🛠️

Enumera las tecnologías o herramientas principales utilizadas en el proyecto. Puedes incluir enlaces a las páginas oficiales de cada tecnología para obtener más información.

A continuación tienes un ejemplo de algunas de ellas:
* [![React][React.js]][React-url]
* [![Angular][Angular.io]][Angular-url]
* [![Maven][Maven]][Maven-url]

<!-- COMENZANDO -->
## Comenzando 🚀

Este es un ejemplo de cómo puedes dar instrucciones sobre cómo configurar tu proyecto localmente.
Para obtener una copia local y ponerla en funcionamiento, sigue estos sencillos pasos de ejemplo.

### Requisitos previos 📋

Para el despliegue local se necesita Podman Desktop con una máquina Podman
iniciada, `podman-compose` y el backend ARIA conectado a la red `aria-net`.

### Ejecución local con Podman 🔧
1. Inicia la máquina Podman y el backend. Desde el repositorio del backend:
  ```sh
  podman machine start
  podman-compose -f deploy/local/docker/docker-compose.yml up -d
  ```
2. Desde este repositorio, construye y levanta nginx:
  ```sh
  podman network exists aria-net
  if ($LASTEXITCODE -ne 0) { podman network create aria-net }
  podman-compose build
  $env:FRONTEND_PORT = "8080"
  podman-compose up -d
  ```
3. Abre `http://localhost:8080`. El proxy nginx enruta `/api/*` y `/health`
  al servicio backend `api:8000` dentro de `aria-net`.

Para detener el frontend: `podman-compose down`. Para ver sus logs:
`podman-compose logs -f web`.

### Ejecución local del frontend sin contenedor

El archivo `.env.local` configura el frontend para llamar directamente a la
API en `http://localhost:8000`. Primero inicia solamente el backend:

```powershell
Set-Location "C:\Users\c808802\Documents\proyecto ARIA\aira"
podman-compose -f deploy/local/docker/docker-compose.yml up -d
```

Después instala dependencias y ejecuta Vite desde este repositorio:

```powershell
Set-Location "C:\Users\c808802\Documents\proyecto ARIA\aria-flow-visualizer"
bun install --frozen-lockfile
bun run dev -- --host 0.0.0.0
```

Abre `http://localhost:3000`. Para detener Vite presiona `Ctrl+C`.

## Ejecución de pruebas ⚙️

Aquí puedes proporcionar instrucciones sobre cómo ejecutar las pruebas del proyecto. Puedes incluir comandos específicos y explicar qué se espera de las pruebas.

Por ejemplo:

1. Ejecuta el siguiente comando para ejecutar las pruebas automatizadas:
  ```sh
  npm test
  ```

2. Verifica que todas las pruebas pasen correctamente y que no haya errores.

Recuerda proporcionar suficiente información para que los usuarios puedan ejecutar las pruebas de manera efectiva.

<!-- EJEMPLOS DE USO -->
## Uso ⌨️

Utiliza este espacio para mostrar ejemplos útiles de cómo se puede utilizar un proyecto. Las capturas de pantalla adicionales, ejemplos de código y demos funcionan bien en este espacio. También puedes enlazar a más recursos.

## Despliegue 📦

Aquí puedes proporcionar instrucciones sobre cómo desplegar el proyecto. Puedes incluir comandos específicos, configuraciones necesarias y cualquier otra información relevante.
Por ejemplo:
1. Configura las variables de entorno necesarias.
2. Ejecuta el siguiente comando para compilar el proyecto:
  ```sh
  npm run build
  ```
3. Despliega el proyecto en el servidor de producción.
  ```sh
  npm run deploy
  ```
Recuerda proporcionar suficiente información para que los usuarios puedan desplegar el proyecto de manera efectiva.

<!-- CONTRIBUCIONES -->
## Contribuciones 🖇️
Las contribuciones son el corazón de una comunidad de **InnerSource**. Crean un espacio donde el aprendizaje, el intercambio y la inspiración florecen, impulsando el crecimiento y la innovación colectiva. Cualquier contribución que hagas es **muy apreciada**.

Si tienes una propuesta que pueda mejorar nuestro proyecto, por favor lee nuestra página de [Contribuciones](CONTRIBUTING.md).

<!-- CONTACTO -->
## Contacto

Creador - O020037


<!-- ENLACES E IMÁGENES DE MARKDOWN -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Maven]: https://img.shields.io/badge/Maven-35495E?style=for-the-badge&logo=apachemaven&logoColor=4FC08D
[Maven-url]: https://maven.apache.org/
[Angular.io]: https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white
[Angular-url]: https://angular.io/

