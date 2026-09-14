const SAMPLE_DATASET_COLUMNS = [
  "reviewstatus_first", "marcacion_final", "razon_marcacion", "eventtype", "channel", "integrationpoint",
  "biocatch_score", "Model_score", "amount_value", "fecha_transaccion", "fecha_primer_marcacion",
  "fecha_ultima_marcacion", "biocatch_isMobileRat", "biocatch_isEmulator", "biocatch_isRat", "biocatch_isBot",
  "biocatch_indrobo1", "biocatch_isOnCall", "biocatch_isVoipOnCall", "biocatch_screenBroadcast", "deviceid",
  "eventid", "triggered_rules", "device_ipaddress_encrypted", "counterpartyentityid_encrypted", "customerid",
  "transactionid", "output_tags", "tipo_documento", "numero_documento", "nombre_razon_social", "fecha_nacimiento",
  "sexo", "fecha_expedicion_documento", "indicador_revinculado", "codigo_ciudad", "ciudad", "empleado_banco",
  "fecha_alta", "direccion", "correo_1", "correo_2", "celular", "fecha_ultima_modificacion", "MontoMasAltoPSE",
  "MontoMasAltoPasarelaPago", "MontoMasAltoBreB", "MontoMasAltoGlomo", "MontoMasAltoNet", "MontoMasAltoPrestamo",
  "MontoMasAltoFacturas", "MontoMasAltoRetirosTarjeta", "tipo", "transacciones_json",
] as const;

const SAMPLE_DATASET_ROW: Record<(typeof SAMPLE_DATASET_COLUMNS)[number], string> = {
  reviewstatus_first: "risk-suspected", marcacion_final: "risk-suspected", razon_marcacion: "[FR___NO_HABITO_TRXS]",
  eventtype: "paymentRT", channel: "GL", integrationpoint: "SMGG0243239 - paymentsCreateRequestSendTransferV0",
  biocatch_score: "258", Model_score: "0.27087", amount_value: "122000", fecha_transaccion: "2026-05-02 14:47:35.000",
  fecha_primer_marcacion: "2026-05-02 14:50:53.213", fecha_ultima_marcacion: "2026-05-02 14:57:54.499",
  biocatch_isMobileRat: "False", biocatch_isEmulator: "False", biocatch_isRat: "False", biocatch_isBot: "False",
  biocatch_indrobo1: "", biocatch_isOnCall: "False", biocatch_isVoipOnCall: "", biocatch_screenBroadcast: "",
  deviceid: "30956ed2f6ffeaaf", eventid: "8ca60ead-11d2-4ea2-b538-43aa01d754c3",
  triggered_rules: "[PARTY - dg_breb_lista_negra_cedula, CUSTOMER - dg_breb_lista_negra]",
  device_ipaddress_encrypted: "9324B6E1EA617AF3C81EA3504FA457EA2DB25606F01BC07AFA4D3BA7C5893700",
  counterpartyentityid_encrypted: "56A7EB5BF35360BF6673DD8CB7F5880120529566D9640B0CF835364ABF3B3691",
  customerid: "10222844", transactionid: "1.02228440013013E+033",
  output_tags: "[PARTY - riesgo: Alto, PARTY - _tag: deny, PARTY - outcome: deny]", tipo_documento: "CC",
  numero_documento: "1000000475", nombre_razon_social: "Óscar Zambrano", fecha_nacimiento: "1997-09-14", sexo: "M",
  fecha_expedicion_documento: "2017-07-18", indicador_revinculado: "False", codigo_ciudad: "5001", ciudad: "Medellín",
  empleado_banco: "False", fecha_alta: "2020-04-07", direccion: "Av. carrera 130 # 5-71 Sur, Apartamento 9, 545804, Cácota, Norte de Santander",
  correo_1: "oscar_zambrano.000475@example.test", correo_2: "oscar_zambrano.000475.extractos@example.test",
  celular: "573000000475", fecha_ultima_modificacion: "2024-01-15T13:53:33", MontoMasAltoPSE: "360000",
  MontoMasAltoPasarelaPago: "", MontoMasAltoBreB: "122000", MontoMasAltoGlomo: "122000", MontoMasAltoNet: "",
  MontoMasAltoPrestamo: "", MontoMasAltoFacturas: "", MontoMasAltoRetirosTarjeta: "500000", tipo: "Fraude",
  transacciones_json: JSON.stringify([
    { tipo_transaccion: "cardNRT", amount_value: 8900, alertas: null, cuenta_origen: "65E6113A2CD27DD06318E162DC4D2CC06B1CCBA55D09E977A732B5CB3016CEDC", integrationpoint: "00 - Compra", eventtime: "2026-05-09 17:20:09", canal: "01 - Entrada Manual o No presente", destino: "647A27EFAF011DEBA7C4587E18F5E2C56FCBEFB274DA80C348176A7299D68A22" },
    { tipo_transaccion: "paymentRT", amount_value: 50000, alertas: null, cuenta_origen: "5EA72153D8B75F130F0207624DC0E801A6D90371679F44B28CE876F60B760C25", integrationpoint: "SMGG20243239 - paymentsCreateRequestSendTransferV0", eventtime: "2026-05-07 09:38:04", canal: "GL", destino: "6B2F1C12BEF276BDFD583CA6AB914CAF984F58300FC578C55FA7D45DDFE33F5B" },
    { tipo_transaccion: "cardNRT", amount_value: 33500, alertas: null, cuenta_origen: "5EA72153D8B75F130F0207624DC0E801A6D90371679F44B28CE876F60B760C25", integrationpoint: "00 - Compra", eventtime: "2026-05-06 17:40:03", canal: "07 - Lectura Chip Contactless", destino: "9583A731E2989B305009E607FDCA7CAD7E6E59BCE626EDFF6ED03A7C48512EE8" },
  ]),
};

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadSampleDatasetCsv(filename = "dataset_ejemplo.csv"): void {
  const columns = SAMPLE_DATASET_COLUMNS.filter(Boolean);
  const csvContent = `${columns.map(csvEscape).join(",")}\n${columns.map((column) => csvEscape(SAMPLE_DATASET_ROW[column])).join(",")}\n`;
  const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
