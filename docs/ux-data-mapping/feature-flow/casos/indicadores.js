FF.cases["indicadores"] = {
  title: "Leer los indicadores",
  short: "Dashboard y Monitor: qué muestra cada pestaña y qué significa «sin datos».",
  goal: "Ver cómo va la operación y la calidad del agente.",
  actors: [{ role: "ops_analyst", as: "Dashboard y Monitor" }, { role: "manager", as: "Dashboard y Monitor" }, { role: "release_manager", as: "Dashboard y Monitor" }, { role: "channel_manager", as: "Dashboard y Monitor" }, { role: "data_analyst", as: "Solo Monitor" }],
  pre: ["Tu rol tiene la vista en su menú."],
  steps: [
    { t: "Dashboard", r: "/dashboard", shot: "tab-dashboard-0-tiempo-real",
      "do": "Eliges la pestaña Tiempo real, Histórico o Por dimensión y filtras por segmento.",
      sys: "Muestra alertas procesadas, SLA cumplido (menos de 5 minutos) y las tasas calculadas en pantalla a partir de numeradores y denominadores.",
      fail: [{ when: "una tarjeta dice «sin datos» o «En maduración»", what: "El tablero aún no tiene datos suficientes para esa tarjeta; no es un error de carga.", fix: "Esperar y volver a mirar; si persiste con alertas ya procesadas, avisar a soporte." },
             { when: "el servicio API no responde", see: "El servicio API no está disponible. ARIA no funciona sin el servicio principal", fix: "Avisar a plataforma." }] },
    { t: "Monitor del agente", r: "/monitor", shot: "tab-monitor-0-indicadores-generales", edge: "Menú · Monitor",
      "do": "Recorres Generales, De área, Analistas y otros canales, Explicabilidad, Técnicos, Recomendaciones y Optimizador.",
      sys: "Cada pestaña es solo lectura." },
    { t: "Explicabilidad", r: "/monitor", shot: "tab-monitor-3-explicabilidad", edge: "Pestaña Explicabilidad",
      "do": "Abres la evaluación del razonamiento y, si quieres ver el caso, pulsas Ver.",
      sys: "Lleva al detalle de la alerta evaluada.",
      fail: [{ when: "la evaluación de una alerta no aparece", what: "Es un proceso aparte: una alerta está resuelta y visible aunque su evaluación todavía no haya corrido o haya fallado.", fix: "Esperar; se recuperan solas las evaluaciones perdidas." }] }
  ],
  result: "Lectura de indicadores sin modificar datos.",
  confirm: ["No documenté pestaña por pestaña qué mide cada indicador; eso va en el manual de cada vista."],
  src: ["frontend_mockup/src/routes/dashboard.tsx", "frontend_mockup/src/routes/monitor.tsx", "backend CLAUDE.md (secciones de métricas y evaluador D6)"]
};
