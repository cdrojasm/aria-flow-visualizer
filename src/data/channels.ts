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

// Segmento agrupa canales según el catálogo de canales (Biblioteca → Canales,
// channel_library_port.py) — dimensión independiente de canal/subcanal, no
// depende de qué canal esté elegido. Ya no es un enum fijo de 2 valores: las
// opciones de segmento las trae ChannelFilter desde el catálogo en vivo.
export type Segmento = string;

const SEGMENTO_BADGE_PALETTE = [
  "bg-[#e0e7ff] text-[#3730a3]",
  "bg-[#cffafe] text-[#155e75]",
  "bg-[#dcfce7] text-[#166534]",
  "bg-[#fef3c7] text-[#92400e]",
  "bg-[#fce7f3] text-[#9d174d]",
];

// Color determinístico por nombre de segmento (hash simple), así un canal
// nuevo agregado al catálogo recibe badge sin tocar este archivo.
export function segmentoBadgeClass(segmento: string): string {
  let hash = 0;
  for (let i = 0; i < segmento.length; i++) hash = (hash * 31 + segmento.charCodeAt(i)) | 0;
  return SEGMENTO_BADGE_PALETTE[Math.abs(hash) % SEGMENTO_BADGE_PALETTE.length];
}
