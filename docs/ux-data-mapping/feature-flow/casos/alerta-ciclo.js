FF.cases["alerta-ciclo"] = {
  title: "Qué le pasa a una alerta por dentro",
  short: "El recorrido automático de ARIA y qué hace cuando un paso falla.",
  goal: "Explicar, sin tocar nada, cómo procesa ARIA cada alerta y por qué una alerta termina Cerrada, Esperando analista, Saltada o Falló.",
  actors: [{ role: "fraud_analyst", as: "Recibe las escaladas" }, { role: "ops_analyst", as: "Vigila" }, { role: "manager", as: "Vigila" }, { role: "channel_manager", as: "Vigila" }, { role: "release_manager", as: "Vigila" }, { role: "data_analyst", as: "Vigila" }, { role: "fraud_reviewer", as: "Ve el resultado" }],
  pre: ["Llega un evento de alerta y el agente está encendido para su segmento."],
  states: [[["Recibida", ""]], [["ARIA analizando", ""]], [["Cerrada", "ok"], ["Esperando analista", ""], ["Saltada", ""], ["Falló", "bad"]]],
  steps: [
    { t: "Entrada y datos", r: "automático",
      "do": "No haces nada. La alerta entra por la API de eventos.",
      sys: "Paso pre_process: valida los datos obligatorios y trae el enriquecimiento (datos adicionales del cliente).",
      fail: [{ when: "faltan datos obligatorios o el enriquecimiento agota sus reintentos", what: "Es el único fallo que, tras el último intento, manda la alerta a un analista.", fix: "La alerta pasa a Esperando analista y se resuelve como cualquier escalada." }] },
    { t: "Análisis del agente", r: "automático", shot: "alerta-tab-razonamiento", edge: "Siguiente paso",
      "do": "Después puedes leer cada paso en la pestaña Razonamiento.",
      sys: "En orden: reglas deterministas → perfilado → detector → detector adversarial → clasificación → revisión adversarial → analista → ejecutor → post-proceso.",
      fail: [{ when: "un paso lanza un error", what: "El sistema reintenta toda la alerta con espera creciente, hasta 3 reintentos. Los pasos ya hechos no se repiten.", fix: "Esperar; no hay acción manual." },
             { when: "el revisor adversarial rechaza la propuesta más veces que el límite de iteraciones", what: "No se reintenta: la alerta falla y se escala siempre a un analista.", fix: "El analista la resuelve como cualquier escalada." },
             { when: "falla el registro de métricas o la evaluación del razonamiento", what: "No afecta a la alerta: ambos son procesos aparte, silenciosos e independientes.", fix: "Nada." }] },
    { t: "Resultado", r: "automático", shot: "cola", edge: "Termina el flujo",
      "do": "Ves el estado final en En proceso, Detalle o Histórico.",
      sys: "Cerrada: el agente decidió y ejecutó la acción. Esperando analista: el agente escaló (scale_to_analyst). Saltada: el agente está apagado. Falló: el flujo no terminó.",
      fail: [{ when: "el flujo falla en un paso distinto de pre_process y se agotan los reintentos", see: "Falló", what: "La alerta queda en Falló y no pasa a un analista.", fix: "Avisar a soporte con el identificador." },
             { when: "la alerta viene de una prueba (Testing) o de una evaluación del optimizador", what: "Nunca se escala a analistas, falle como falle.", fix: "Revisar el resultado en el detalle de la prueba." }] }
  ],
  result: "Cada alerta termina en uno de cuatro estados y queda trazada en el histórico y en Phoenix con el identificador del flujo.",
  confirm: ["Una alerta de producción que falla después del paso pre_process queda en Falló sin analista. Confirmar con negocio si eso es lo esperado o si debe escalarse también."],
  src: ["backend src/application/use_cases/alerts/run_alert_review_workflow.py", "backend src/application/use_cases/alerts/alert_review_policy.py (LINEAR_STEPS)", "backend src/infrastructure/entrypoint/worker/celery/tasks.py (reintentos)"]
};
