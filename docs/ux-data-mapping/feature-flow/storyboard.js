/* Recorrido por pantallas de cada rol (vista general). Capturas en ../screenshots/. */
(function () {
  var T = function (img, label) { return { img: img, label: label }; };
  var CFG_MGR = [T("tab-configuracion-mgr-0-general", "General"), T("tab-configuracion-mgr-1-infraestructura", "Infraestructura"), T("tab-configuracion-mgr-2-operacion-inmediata", "Operación inmediata"), T("tab-configuracion-mgr-3-asistente-y-optimizador", "Asistente y optimizador"), T("tab-configuracion-mgr-4-test", "Test"), T("tab-configuracion-mgr-5-segmento", "Segmento"), T("tab-configuracion-mgr-6-esquema", "Esquema")];
  var CFG_CM = [T("tab-configuracion-cm-0-segmento", "Segmento"), T("tab-configuracion-cm-1-agente", "Agente"), T("tab-configuracion-cm-2-evaluacion", "Evaluación"), T("tab-configuracion-cm-3-optimizador", "Optimizador")];
  var N = {
    login: { t: "Acceso", r: "/login", img: "login", d: "Correo y contraseña." },
    dashboard: { t: "Dashboard", r: "/dashboard", img: "dashboard", d: "Indicadores generales, SLA y filtros por segmento.", tabs: [T("tab-dashboard-0-tiempo-real", "Tiempo real"), T("tab-dashboard-1-historico", "Histórico"), T("tab-dashboard-2-por-dimension", "Por dimensión")] },
    cola: { t: "En proceso", r: "/cola", img: "cola", d: "Alertas pendientes para analista y alertas en proceso.", tabs: [T("tab-cola-0-pending-alerts-for-analyst", "Pendientes"), T("tab-cola-1-alertas-en-proceso", "En proceso")] },
    alerta: { t: "Detalle de alerta", r: "/alerta/$id", img: "alerta-detalle", d: "Resumen, decisión del agente y acciones.", tabs: [T("alerta-tab-data", "Data"), T("alerta-tab-usuario", "Usuario"), T("alerta-tab-razonamiento", "Razonamiento"), T("alerta-tab-historial", "Historial")] },
    historico: { t: "Histórico de Gestión de Fraude", r: "/historico-fraude", img: "historico-fraude", d: "Alertas cerradas con Revisar fraude, Auditoría y Ver." },
    monitor: { t: "Monitor del Agente", r: "/monitor", img: "monitor", d: "Salud y calidad del agente.", tabs: [T("tab-monitor-0-indicadores-generales", "Generales"), T("tab-monitor-1-indicadores-de-area", "De área"), T("tab-monitor-2-analistas-y-otros-canales", "Analistas y canales"), T("tab-monitor-3-explicabilidad", "Explicabilidad"), T("tab-monitor-4-indicadores-tecnicos", "Técnicos"), T("tab-monitor-5-recomendaciones", "Recomendaciones"), T("tab-monitor-6-optimizador", "Optimizador")] },
    configuracion: { t: "Configuración", r: "/configuracion", img: "configuracion", d: "Parámetros del agente, segmento, esquema y operación." },
    testing: { t: "Testing", r: "/testing", img: "testing", d: "Corridas de prueba, datasets y escenarios." },
    run: { t: "Detalle de prueba", r: "/testing/$runId", img: "testing-run", d: "Resultado de una corrida." },
    escenario: { t: "Escenario de simulación", r: "/testing/scenarios/$scenarioId", img: "testing-escenario", d: "Estado en vivo de un generador de eventos." },
    biblioteca: { t: "Biblioteca", r: "/biblioteca", img: "biblioteca", d: "Conocimiento, catálogos, canales, listas y datasets.", tabs: [T("tab-biblioteca-0-base-de-conocimiento", "Base de conocimiento"), T("tab-biblioteca-1-catalogos-de-eventos", "Catálogos"), T("tab-biblioteca-2-canales", "Canales"), T("tab-biblioteca-3-listas-negras-blancas", "Listas"), T("tab-biblioteca-4-datasets", "Datasets"), T("tab-biblioteca-conocimiento-0-vector-store", "Vector store"), T("tab-biblioteca-conocimiento-1-taxonomias-de-fraude", "Taxonomías"), T("tab-biblioteca-conocimiento-2-modus-operandi", "Modus operandi"), T("tab-biblioteca-conocimiento-3-yellow-flags", "Yellow flags"), T("tab-biblioteca-conocimiento-4-red-flags", "Red flags"), T("tab-biblioteca-conocimiento-5-casos-similares", "Casos similares")] },
    modelos: { t: "Modelos", r: "/modelos", img: "modelos", d: "Catálogo de modelos y operaciones.", tabs: [T("tab-modelos-0-catalogo-y-resultados", "Catálogo y resultados"), T("tab-modelos-1-operaciones", "Operaciones")] },
    backups: { t: "Respaldos", r: "/backups", img: "backups", d: "Respaldos de la plataforma. Solo Manager." }
  };
  var M = "menú lateral";
  FF.sbNodes = N;
  FF.sbFlows = {
    fraud_analyst: [["login"], ["cola", "Ingresar"], ["alerta", "Tomar o Seguir"], ["cola", "Resolver o Liberar"]],
    fraud_reviewer: [["login"], ["historico", "Ingresar"], ["alerta", "Ver"]],
    ops_analyst: [["login"], ["dashboard", "Ingresar"], ["cola", M], ["alerta", "Ver"], ["monitor", M]],
    data_analyst: [["login"], ["monitor", "Ingresar"], ["testing", M], ["run", "Nueva prueba o fila"], ["escenario", "Volver y abrir escenario"], ["biblioteca", M], ["modelos", M]],
    manager: [["login"], ["dashboard", "Ingresar"], ["cola", M], ["alerta", "Ver"], ["historico", M], ["monitor", M], ["configuracion", M, { tabs: CFG_MGR }], ["backups", M], ["biblioteca", M]],
    release_manager: [["login"], ["dashboard", "Ingresar"], ["cola", M], ["alerta", "Ver"], ["historico", M], ["monitor", M], ["configuracion", M], ["testing", M], ["run", "Nueva prueba o fila"], ["biblioteca", M]],
    channel_manager: [["login"], ["dashboard", "Ingresar"], ["cola", M], ["alerta", "Ver"], ["historico", M], ["monitor", M], ["testing", M], ["run", "Nueva prueba o fila"], ["biblioteca", M], ["configuracion", M, { tabs: CFG_CM }], ["modelos", M]]
  };
})();
