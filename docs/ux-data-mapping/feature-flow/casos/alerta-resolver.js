FF.cases["alerta-resolver"] = {
  title: "Tomar y resolver una alerta",
  short: "De la cola a cerrar la alerta con una decisión y notas.",
  goal: "Atender una alerta que ARIA escaló y cerrarla con una de tres decisiones: confirmar fraude, falso positivo o enviar a bidi.",
  actors: [{ role: "fraud_analyst", as: "Toma y resuelve" }],
  pre: ["La alerta está en «Esperando analista».", "Hay al menos un analista en la matriz de disponibilidad de esta hora.", "No tienes otra alerta tomada: un analista atiende una a la vez."],
  states: [[["Esperando analista", ""]], [["Tomada por ti (30 min)", ""]], [["Cerrada", "ok"]]],
  steps: [
    { t: "Elegir la alerta", r: "/cola", shot: "tab-cola-0-pending-alerts-for-analyst",
      "do": "En la pestaña Pendientes buscas la fila y pulsas Tomar. Si ya es tuya, el botón dice Seguir.",
      sys: "Reserva la alerta a tu nombre por 30 minutos. Una alerta por analista y un analista por alerta. Si ya la tenías, te devuelve la misma reserva.",
      fail: [
        { when: "ya atiendes otra alerta", see: "Ya estás atendiendo otra alerta. Resuélvela o libérala antes de tomar otra (esta la puedes ver en solo lectura).", fix: "Terminar o liberar la tuya." },
        { when: "otro analista la tomó antes", see: "Otro analista tomó esta alerta.", what: "La lista se recarga sola.", fix: "Elegir otra." },
        { when: "no hay analistas disponibles esta hora", see: "No hay analistas disponibles en la matriz para esta hora (o los analistas están apagados).", fix: "Pedir a quien administra la operación que corrija la matriz de disponibilidad." },
        { when: "la alerta ya salió de la cola", see: "La alerta ya no está en la cola.", fix: "Actualizar la lista." }] },
    { t: "Abrir el detalle", r: "/alerta/$id", shot: "alerta-detalle", edge: "Tomar abre el detalle",
      "do": "Verificas arriba el contador «Tu reserva vence en mm:ss». Se pone rojo con menos de 5 minutos.",
      sys: "Muestra estado, decisión del agente y las acciones disponibles según tengas o no la alerta.",
      fail: [{ when: "la reserva vence o la liberan mientras trabajas", see: "Tu reserva sobre esta alerta ya no está activa (liberada o vencida a los 30 min).", what: "Si tenías abierto el modal de resolver, se cierra solo. La alerta vuelve a la cola.", fix: "Volver a En proceso y tomarla otra vez; lo escrito en las notas se pierde." }] },
    { t: "Revisar la evidencia", r: "/alerta/$id", shot: "alerta-tab-razonamiento", edge: "Pestañas",
      "do": "Recorres Razonamiento del agente, Data alerta, Usuario e Historial.",
      sys: "Solo lectura: muestra lo que decidió cada paso del agente, los datos de la alerta, el cliente y los eventos anteriores." },
    { t: "Elegir la decisión", r: "/alerta/$id", shot: "alerta-detalle", edge: "Confirmar fraude, Falso positivo o Bidi",
      "do": "Pulsas Confirmar fraude (bloquear), Falso positivo (dejar pasar) o Enviar a bidi y escribes las notas.",
      sys: "Abre un modal. El botón Resolver queda desactivado hasta que las notas tengan al menos 10 caracteres." },
    { t: "Resolver", r: "/alerta/$id", shot: "cola", edge: "Resolver",
      "do": "Pulsas Resolver en el modal.",
      sys: "Bloquear y bidi se envían como acción al canal, con tus notas como comentario ARIC. Dejar pasar no envía nada. Cierra la alerta con tu nombre y la hora, libera la reserva y te regresa a En proceso.",
      fail: [
        { when: "la reserva ya no es tuya al resolver", see: "Tu reserva sobre esta alerta ya no está activa (liberada o vencida a los 30 min).", what: "No se cierra nada.", fix: "Tomarla otra vez." },
        { when: "falla el envío de la acción al canal (bloquear o bidi)", see: "Un mensaje técnico del error, sin tratamiento especial.", what: "La alerta no se cierra y tu reserva sigue activa.", fix: "Reintentar mientras no venza la reserva; si persiste, avisar a soporte." },
        { when: "pulsas Resolver dos veces o reintentas después de un corte", what: "No duplica nada: si la alerta ya quedó cerrada por ti, solo libera la reserva sin volver a enviar la acción.", fix: "Nada; es seguro." },
        { when: "falla el registro de métricas", what: "No afecta la resolución; queda en el log del servidor.", fix: "Nada que hacer desde la pantalla." }] }
  ],
  result: "La alerta queda Cerrada con tu decisión, tus notas y la hora. Tu reserva se libera y puedes tomar otra.",
  confirm: ["El mensaje exacto cuando falla el envío al canal no está definido: el código lo deja pasar como error genérico.", "No hay captura del modal de resolver."],
  src: ["backend src/application/use_cases/analyst_queue/take_escalated_alert.py", "backend src/application/use_cases/analyst_queue/resolve_escalated_alert.py", "backend src/infrastructure/entrypoint/api/routers/analyst_queue_router.py", "frontend_mockup/src/routes/cola.tsx (TAKE_ERRORS)", "frontend_mockup/src/routes/alerta.$id.tsx (RESOLUTIONS, ResolveModal)"]
};
