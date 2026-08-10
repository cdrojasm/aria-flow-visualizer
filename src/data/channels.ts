export const CANALES = ["Todos", "Tarjeta", "ATM", "Web", "Mobile App"] as const;
export type Canal = (typeof CANALES)[number];

export const SUBCANALES: Record<Exclude<Canal, "Todos">, readonly string[]> = {
  Tarjeta: ["Contactless", "Chip", "Banda magnética", "Pago virtual (CNP)"],
  ATM: ["Retiro", "Avance", "Consulta de saldo", "Transferencia"],
  Web: ["Login", "Transferencia", "Pago PSE", "Pago de servicios"],
  "Mobile App": ["Login", "Transferencia", "Pago QR", "Recarga"],
};

export function subcanalesFor(canal: Canal): readonly string[] {
  return canal === "Todos" ? [] : SUBCANALES[canal];
}

// Segmento agrupa los canales en dos frentes de negocio (tarjeta vs. digital) —
// dimensión independiente de canal/subcanal, no depende de qué canal esté elegido.
export const SEGMENTOS = ["Todos", "Tarjeta", "Canales Digitales"] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const SEGMENTO_BADGES: Record<Exclude<Segmento, "Todos">, string> = {
  "Tarjeta": "bg-[#e0e7ff] text-[#3730a3]",
  "Canales Digitales": "bg-[#cffafe] text-[#155e75]",
};
