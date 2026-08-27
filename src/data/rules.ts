// Reglas del motor de riesgo (ARIC) que pueden disparar una alerta —
// mismos códigos usados en el detalle de alerta (alerta.$id.tsx: "Lista de reglas").
export const REGLAS_GATILLADAS = [
  "dg_vpn_pse",
  "Score1000Net_PRE",
  "geo_anomaly",
  "cancelTSEC",
  "device_change",
  "monto_pattern_ok",
  "biocatch_ok",
  "kyc_reverify",
  "identity_verified",
  "mcc_risk",
] as const;

export type ReglaGatillada = (typeof REGLAS_GATILLADAS)[number];
