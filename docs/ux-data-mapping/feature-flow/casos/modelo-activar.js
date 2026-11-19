FF.cases["modelo-activar"] = {
  title: "Activar un modelo en producción",
  short: "Poner el modelo Listo al servicio de los agentes.",
  goal: "Hacer que el servicio de scoring (MCP) use el modelo entrenado.",
  actors: [{ role: "manager", as: "Activa" }, { role: "release_manager", as: "Activa" }, { role: "channel_manager", as: "Solo lo ve; recibe error 403" }, { role: "data_analyst", as: "Solo lo ve; recibe error 403" }],
  pre: ["El modelo está en estado Listo y no está activo."],
  states: [[["Listo", "ok"]], [["Activo", "ok"]]],
  steps: [
    { t: "Elegir el modelo", r: "/modelos", shot: "tab-modelos-0-catalogo-y-resultados",
      "do": "En la fila pulsas Activar, o Activar en producción desde el detalle.",
      sys: "El botón solo se habilita con el modelo en Listo y que aún no esté activo." },
    { t: "Confirmar la activación", r: "/modelos", shot: "modelos", edge: "Activar",
      "do": "Esperas la respuesta.",
      sys: "Desactiva el modelo activo anterior, marca este como activo y pide al servicio MCP que lo recargue. Comprueba que MCP reporte el mismo modelo.",
      fail: [
        { when: "tu rol no es Manager ni Release Manager", see: "ROLE_NOT_PERMITTED (403)", fix: "Pedir la activación a un Manager o Release Manager." },
        { when: "MCP no pudo cargar el modelo", see: "Modelo activado, pero MCP no pudo cargarlo: <detalle>", what: "En la base de datos el modelo ya quedó activo y el anterior desactivado, pero MCP puede seguir sirviendo otro.", fix: "Avisar a plataforma; reintentar la activación una vez resuelto." },
        { when: "MCP cargó otra versión", see: "Modelo activado, pero MCP reportó otra versión cargada", what: "Misma situación: activo en la base, no necesariamente en MCP.", fix: "Avisar a plataforma." }] }
  ],
  result: "El modelo aparece como activo y MCP lo sirve a los agentes.",
  confirm: ["Hallazgo: Manager y Release Manager no tienen Modelos en su menú, así que quienes pueden activar no ven la vista y quienes la ven no pueden activar. Confirmar si es intencional.", "En los 503 el modelo queda activo en la base aunque MCP falle; confirmar si debe revertirse automáticamente."],
  src: ["backend src/infrastructure/entrypoint/api/routers/models_router.py (activate_model)", "backend src/application/use_cases/models/activate_model.py", "frontend_mockup/src/hooks/useRole.ts (ROLE_NAV)"]
};
