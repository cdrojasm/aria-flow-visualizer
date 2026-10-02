// Amount tiers (Configuración → Operación): the admin-configured ranges an
// alert's amount is classified into when it arrives. Mirrors the backend's
// src/domain/alerts/amount_tiers.py validate_amount_tiers, so the editor
// can flag problems live instead of waiting for the PUT's 422. The backend
// stays the source of truth (it re-validates on save).

export type AmountTier = {
  code: string;
  label: string;
  minInclusive: number;
  // null = no upper bound (the last tier, up to infinity).
  maxExclusive: number | null;
};

// Every amount classifies as this when there are no tiers, the amount is
// missing, or it falls outside every tier - reserved, never a tier code.
export const UNKNOWN_AMOUNT_TIER = "unknown";

/** Spanish error messages; [] = valid. An empty list is valid (every alert
 * is then "unknown"). */
export function validateAmountTiers(tiers: AmountTier[]): string[] {
  if (tiers.length === 0) return [];
  const errors: string[] = [];
  const codes = tiers.map((t) => t.code.trim());
  if (codes.some((c) => !c)) errors.push("Cada rango necesita un código.");
  const duplicated = codes.filter((c, i) => c && codes.indexOf(c) !== i);
  if (duplicated.length > 0)
    errors.push(`Códigos repetidos: ${[...new Set(duplicated)].join(", ")}.`);
  if (codes.includes(UNKNOWN_AMOUNT_TIER))
    errors.push(`"${UNKNOWN_AMOUNT_TIER}" está reservado y no puede ser un código.`);
  if (tiers.some((t) => !Number.isFinite(t.minInclusive) || t.minInclusive < 0)) {
    errors.push("Los montos mínimos deben ser números mayores o iguales a 0.");
    return errors;
  }

  const ordered = [...tiers].sort((a, b) => a.minInclusive - b.minInclusive);
  const name = (t: AmountTier) => `"${t.code.trim() || "sin código"}"`;
  if (ordered[0].minInclusive !== 0) errors.push("El primer rango debe empezar en 0.");
  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i];
    const following = ordered[i + 1];
    if (current.maxExclusive === null) {
      errors.push(`Sólo el último rango puede no tener tope (${name(current)} no es el último).`);
    } else if (current.maxExclusive > following.minInclusive) {
      errors.push(`Los rangos ${name(current)} y ${name(following)} se solapan.`);
    } else if (current.maxExclusive < following.minInclusive) {
      errors.push(`Hay un hueco entre ${name(current)} y ${name(following)}.`);
    }
  }
  for (const tier of ordered) {
    if (tier.maxExclusive !== null && tier.maxExclusive <= tier.minInclusive) {
      errors.push(`El rango ${name(tier)} debe terminar por encima de donde empieza.`);
    }
  }
  if (ordered[ordered.length - 1].maxExclusive !== null) {
    errors.push("El último rango debe quedar sin tope (hasta infinito).");
  }
  return errors;
}

export function formatTierBounds(tier: Pick<AmountTier, "minInclusive" | "maxExclusive">): string {
  const n = (v: number) => v.toLocaleString("es-CO");
  return tier.maxExclusive === null
    ? `≥ ${n(tier.minInclusive)}`
    : `${n(tier.minInclusive)} – < ${n(tier.maxExclusive)}`;
}

/** Tier codes from the settings history (`amount_tiers` changes carry the
 * previous and new full lists), excluding the current ones. */
export function historicalTierCodes(
  history: { changes: { path: string; previous: unknown; new: unknown }[] }[],
  currentCodes: Set<string>,
): Map<string, string> {
  const found = new Map<string, string>();
  for (const change of history) {
    for (const c of change.changes) {
      if (c.path !== "amount_tiers") continue;
      for (const list of [c.previous, c.new]) {
        if (!Array.isArray(list)) continue;
        for (const tier of list as { code?: unknown; label?: unknown }[]) {
          const code = typeof tier.code === "string" ? tier.code : "";
          if (code && !currentCodes.has(code) && !found.has(code)) {
            found.set(code, typeof tier.label === "string" && tier.label ? tier.label : code);
          }
        }
      }
    }
  }
  return found;
}
