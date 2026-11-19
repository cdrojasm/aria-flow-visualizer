FF.cases["alerta-liberar"] = {
  title: "Liberar una alerta sin resolverla",
  short: "Devolver la alerta a la cola para que la atienda otra persona.",
  goal: "Soltar una alerta que tomaste y no vas a resolver, sin cerrarla.",
  actors: [{ role: "fraud_analyst", as: "Libera" }],
  pre: ["Tienes la alerta tomada y la reserva sigue vigente."],
  states: [[["Tomada por ti", ""]], [["Esperando analista", "ok"]]],
  steps: [
    { t: "Abrir tu alerta", r: "/alerta/$id", shot: "alerta-detalle",
      "do": "Entras a la alerta desde En proceso con Seguir.",
      sys: "Muestra el contador de tu reserva y los botones de decisión junto a Liberar." },
    { t: "Liberar", r: "/alerta/$id", shot: "alerta-detalle", edge: "Liberar",
      "do": "Pulsas Liberar.",
      sys: "Termina tu reserva con motivo «liberada por el analista». La alerta sigue en «Esperando analista» y vuelve a la cola. Te lleva a En proceso.",
      fail: [{ when: "la reserva ya venció o no es tuya", see: "Tu reserva sobre esta alerta ya no está activa (liberada o vencida a los 30 min).", what: "No cambia nada; la alerta ya estaba libre.", fix: "Volver a En proceso." }] },
    { t: "Volver a la cola", r: "/cola", shot: "cola", edge: "Redirige a En proceso",
      "do": "Eliges otra alerta o terminas.",
      sys: "La alerta liberada aparece de nuevo en Pendientes para cualquier analista, incluido tú." }
  ],
  result: "La alerta sigue abierta y disponible. Tu cupo de una alerta a la vez queda libre.",
  confirm: ["También se ofrece liberar al cerrar sesión con una alerta tomada (ver «Iniciar y cerrar sesión»)."],
  src: ["backend src/application/use_cases/analyst_queue/release_escalated_alert.py", "frontend_mockup/src/routes/alerta.$id.tsx (release)"]
};
