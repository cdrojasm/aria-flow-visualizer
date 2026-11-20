/* Roles, menú y casos de uso por rol. Fuente: frontend_mockup/src/hooks/useRole.ts (ROLE_NAV).
   Cada caso vive en casos/<id>.js y se registra en FF.cases[<id>]. */
window.FF = window.FF || { cases: {} };

FF.views = {
  dashboard: ["Dashboard", "/dashboard"], cola: ["En proceso", "/cola"],
  historico: ["Histórico de Gestión de Fraude", "/historico-fraude"], monitor: ["Monitor del Agente", "/monitor"],
  configuracion: ["Configuración", "/configuracion"], testing: ["Testing", "/testing"],
  biblioteca: ["Biblioteca", "/biblioteca"], modelos: ["Modelos", "/modelos"], backups: ["Respaldos", "/backups"]
};

FF.order = ["fraud_analyst", "fraud_reviewer", "ops_analyst", "data_analyst", "manager", "release_manager", "channel_manager"];

FF.roles = {
  fraud_analyst: { label: "Fraud Analyst", land: "cola", nav: ["cola"],
    sum: "Resuelve alertas escaladas una por una. Es el único rol con el botón Tomar.",
    cases: ["acceso", "alerta-resolver", "alerta-liberar", "alerta-ciclo"] },
  fraud_reviewer: { label: "Fraud Reviewer", land: "historico", nav: ["historico"],
    sum: "Equipo de fraude. Corrige el resultado real (fraud_label) desde el histórico.",
    cases: ["acceso", "fraud-label", "alerta-consultar", "alerta-ciclo"] },
  ops_analyst: { label: "Ops Analyst", land: "dashboard", nav: ["dashboard", "cola", "monitor"],
    sum: "Opera y vigila. Ve alertas en solo lectura y los indicadores.",
    cases: ["acceso", "indicadores", "alerta-consultar", "alerta-ciclo"] },
  data_analyst: { label: "Data Analyst", land: "monitor", nav: ["monitor", "testing", "biblioteca", "modelos"],
    sum: "Prepara datos y modelos. Puede entrenar pero no activar un modelo.",
    cases: ["acceso", "dataset-particion", "features-preview", "modelo-entrenar", "modelo-activar", "prueba-correr", "vector-store", "indicadores", "alerta-ciclo"] },
  manager: { label: "Manager", land: "dashboard", nav: ["dashboard", "cola", "historico", "monitor", "configuracion", "backups", "biblioteca"],
    sum: "Supervisa la operación, aprueba despliegues y administra respaldos.",
    cases: ["acceso", "config-desplegar", "modelo-activar", "respaldo", "vector-store", "indicadores", "alerta-consultar", "alerta-ciclo"] },
  release_manager: { label: "Release Manager", land: "dashboard", nav: ["dashboard", "cola", "historico", "monitor", "configuracion", "testing", "biblioteca"],
    sum: "Publica cambios. Prueba configuraciones y aprueba despliegues.",
    cases: ["acceso", "prueba-correr", "config-desplegar", "modelo-activar", "vector-store", "indicadores", "alerta-consultar", "alerta-ciclo"] },
  channel_manager: { label: "Channel Manager", land: "dashboard", nav: ["dashboard", "cola", "historico", "monitor", "testing", "biblioteca", "configuracion", "modelos"],
    sum: "Gestiona su canal: configura, prueba, entrena modelos y solicita despliegues.",
    cases: ["acceso", "config-desplegar", "prueba-correr", "dataset-particion", "features-preview", "modelo-entrenar", "modelo-activar", "vector-store", "indicadores", "alerta-consultar", "alerta-ciclo"] }
};
