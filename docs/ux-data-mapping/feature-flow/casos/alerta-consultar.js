FF.cases["alerta-consultar"] = {
  title: "Consultar una alerta (solo lectura)",
  short: "Ver el detalle y el razonamiento de una alerta sin poder tomarla.",
  goal: "Entender qué decidió ARIA y en qué estado está una alerta, sin intervenir en ella.",
  actors: [{ role: "manager", as: "Consulta" }, { role: "release_manager", as: "Consulta" }, { role: "channel_manager", as: "Consulta" }, { role: "ops_analyst", as: "Consulta" }, { role: "fraud_reviewer", as: "Desde el histórico" }],
  pre: ["Tu rol tiene acceso a En proceso o al Histórico. El detalle hereda el acceso de En proceso."],
  steps: [
    { t: "Elegir la alerta", r: "/cola", shot: "tab-cola-1-alertas-en-proceso",
      "do": "En En proceso pulsas Ver en la fila. Desde el histórico, también Ver.",
      sys: "Solo el Fraud Analyst ve el botón Tomar; los demás roles solo tienen Ver." },
    { t: "Leer el detalle", r: "/alerta/$id", shot: "alerta-detalle", edge: "Ver",
      "do": "Revisas el estado y las pestañas Razonamiento, Data, Usuario e Historial.",
      sys: "El estado puede ser: Recibida, ARIA analizando, Esperando analista, Cerrada, Saltada (agente apagado) o Falló. Si otro analista la atiende ves «Atendida por … · solo lectura». Si está cerrada ves quién la cerró y con qué decisión.",
      fail: [{ when: "la alerta no existe", see: "Not found (404)", fix: "Volver a la lista; puede haberse archivado." },
             { when: "el estado es Falló", what: "El agente no pudo procesarla.", fix: "Avisar a soporte con el identificador de la alerta; ver «Qué le pasa a una alerta por dentro»." }] },
    { t: "Volver", r: "/cola", shot: "cola", edge: "Volver",
      "do": "Usas el enlace de En proceso del encabezado, o el botón Volver.",
      sys: "Regresa a la lista.",
      fail: [{ when: "eres Fraud Reviewer y vuelves desde el enlace del encabezado", what: "Tu rol no tiene En proceso: ARIA te lleva al histórico.", fix: "Usar Volver del navegador o abrir el histórico." }] }
  ],
  result: "Entiendes el estado y la decisión de la alerta; no se modifica nada.",
  confirm: ["No encontré un botón para reintentar una alerta en estado Falló; confirmar si existe otra vía.", "Falta confirmar con negocio si Manager, Release Manager y Channel Manager deben poder liberar una alerta atascada."],
  src: ["frontend_mockup/src/routes/alerta.$id.tsx", "backend src/application/use_cases/analyst_queue/get_alert_detail.py"]
};
