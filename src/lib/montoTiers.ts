export const MONTO_TIERS = ["Todos", "≥ 5.000", "1.000 – 5.000", "< 1.000"] as const;
export type MontoTier = (typeof MONTO_TIERS)[number];

export function matchesMonto(monto: number, tier: MontoTier) {
  if (tier === "Todos") return true;
  if (tier === "≥ 5.000") return monto >= 5000;
  if (tier === "1.000 – 5.000") return monto >= 1000 && monto < 5000;
  return monto < 1000;
}
