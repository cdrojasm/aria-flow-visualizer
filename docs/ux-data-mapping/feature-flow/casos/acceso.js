FF.cases["acceso"] = {
  title: "Iniciar y cerrar sesión",
  short: "Entrar a ARIA, qué pasa si la sesión vence y cómo salir.",
  goal: "Entrar con correo y contraseña, caer en la pantalla que corresponde al rol y salir sin perder una alerta tomada.",
  actors: [{ role: "fraud_analyst", as: "Todos" }, { role: "fraud_reviewer", as: "Todos" }, { role: "ops_analyst", as: "Todos" }, { role: "data_analyst", as: "Todos" }, { role: "manager", as: "Todos" }, { role: "release_manager", as: "Todos" }, { role: "channel_manager", as: "Todos" }],
  pre: ["Tener un usuario local activo con rol asignado.", "El servicio API debe estar disponible."],
  steps: [
    { t: "Abrir ARIA", r: "/login", shot: "login",
      "do": "Abres cualquier ruta de la aplicación sin sesión.",
      sys: "Te lleva a /login y recuerda la ruta que pedías (?redirect=…).",
      fail: [{ when: "el servicio API no responde", see: "El servicio API no está disponible. ARIA no funciona sin el servicio principal", what: "Aparece un banner arriba de todas las vistas.", fix: "Avisar al equipo de plataforma; no hay nada que hacer desde la pantalla." }] },
    { t: "Escribir correo y contraseña", r: "/login", shot: "login", edge: "Ingresar",
      "do": "Completas correo y contraseña y pulsas Ingresar.",
      sys: "Valida las credenciales, guarda el token de sesión y te lleva a la ruta que pedías o, si no pedías ninguna, a la primera permitida para tu rol.",
      fail: [{ when: "el correo o la contraseña son incorrectos", see: "Correo o contraseña inválidos.", what: "Sigues en el login; no se crea sesión.", fix: "Revisar los datos o pedir a un administrador que restablezca la cuenta." }] },
    { t: "Pantalla de aterrizaje", r: "según rol", shot: "dashboard", edge: "Sesión abierta",
      "do": "Trabajas con las vistas del menú lateral. Es distinto por rol: ver la matriz de acceso.",
      sys: "Si abres una ruta que tu rol no tiene, te devuelve a la primera ruta de tu menú.",
      fail: [{ when: "la sesión vence, la revocan o desactivan tu usuario mientras trabajas", see: "Vuelves a /login", what: "ARIA borra el token y la información en memoria, y al volver a entrar te lleva a donde estabas.", fix: "Iniciar sesión de nuevo. Lo que estabas escribiendo en un formulario se pierde." }] },
    { t: "Cerrar sesión", r: "menú lateral", shot: "asistente-panel", edge: "Cerrar sesión",
      "do": "Pulsas cerrar sesión en el bloque de usuario y confirmas.",
      sys: "Si tienes una alerta tomada, el diálogo te ofrece liberarla antes de salir. Aunque la API no responda, la sesión local se cierra igual y el token caduca solo.",
      fail: [{ when: "dejas una alerta tomada y cierras sin liberarla", what: "La reserva sigue viva hasta vencer (30 min) y nadie más puede tomar esa alerta.", fix: "Aceptar la opción de liberarla en el diálogo." }] }
  ],
  result: "Sesión abierta en la primera pantalla de tu rol, o sesión cerrada sin reservas colgadas.",
  confirm: ["No hay captura del diálogo de cerrar sesión; el paso usa una captura general de la app."],
  src: ["frontend_mockup/src/routes/login.tsx", "frontend_mockup/src/components/DashboardLayout.tsx", "frontend_mockup/src/components/LogoutDialog.tsx", "backend src/infrastructure/entrypoint/api/routers/auth_router.py"]
};
