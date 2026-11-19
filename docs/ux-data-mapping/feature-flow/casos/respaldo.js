FF.cases["respaldo"] = {
  title: "Crear un respaldo",
  short: "Pedir un respaldo de la plataforma y seguir su estado.",
  goal: "Generar un respaldo y comprobar que terminó bien.",
  actors: [{ role: "manager", as: "Solicita" }],
  pre: ["Eres Manager: es el único rol con la vista Respaldos."],
  states: [[["En cola", ""]], [["En curso", ""]], [["Completado", "ok"], ["Fallido", "bad"]]],
  steps: [
    { t: "Abrir Respaldos", r: "/backups", shot: "backups",
      "do": "Abres Respaldos desde el menú.",
      sys: "Lista el historial. Si no hay ninguno dice «Todavía no hay respaldos».",
      fail: [{ when: "no carga el historial", see: "No se pudo cargar el historial de respaldos.", fix: "Reintentar; si persiste, avisar a plataforma." },
             { when: "tu rol no es Manager", see: "Only managers can manage backups (403)", fix: "Pedirlo a un Manager." }] },
    { t: "Crear respaldo", r: "/backups", shot: "backups", edge: "Crear respaldo",
      "do": "Pulsas Crear respaldo.",
      sys: "Registra el respaldo En cola con su carpeta y lo manda a una tarea en segundo plano. Responde de inmediato.",
      fail: [{ when: "no se pudo encolar la tarea", see: "No se pudo solicitar el respaldo. <detalle> (503 Backup task could not be queued)", what: "El respaldo queda registrado como Fallido con el motivo.", fix: "Reintentar creando otro; si persiste, avisar a plataforma." }] },
    { t: "Seguir el estado", r: "/backups", shot: "backups", edge: "En segundo plano",
      "do": "Esperas y miras el estado en el historial.",
      sys: "Cambia de En cola a En curso y termina en Completado o Fallido.",
      fail: [{ when: "queda en Fallido", what: "El respaldo no es utilizable.", fix: "Crear otro respaldo; guardar el identificador para soporte." }] }
  ],
  result: "Un respaldo Completado en el historial.",
  confirm: ["No leí la tarea que ejecuta el respaldo: no sé qué incluye ni cuánto tarda, ni si el historial muestra el motivo cuando un respaldo falla durante la ejecución."],
  src: ["backend src/application/use_cases/backups/request_backup.py", "backend src/infrastructure/entrypoint/api/routers/backups_router.py", "frontend_mockup/src/routes/backups.tsx"]
};
