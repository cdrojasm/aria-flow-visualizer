import { z } from "zod";

import { apiFetch } from "./client";

// Client functions wrapping the backend's marcación-catalog API, mirroring
// configuration.functions.ts's tag-catalog client (see that file's header).

const riskLabel = z.enum(["risk-suspected", "no-risk"]);

export type RiskLabel = z.infer<typeof riskLabel>;

export type MarcacionCategoryResponse = {
  id: string;
  value: string;
  risk_label: RiskLabel;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function listMarcacionCategories({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<MarcacionCategoryResponse[]> {
  return apiFetch(`/api/v0/marcacion-catalog?active_only=${data.activeOnly}`);
}

export function createMarcacionCategory({
  data,
}: {
  data: { value: string; riskLabel: RiskLabel };
}): Promise<MarcacionCategoryResponse> {
  return apiFetch("/api/v0/marcacion-catalog", {
    method: "POST",
    body: JSON.stringify({ value: data.value, risk_label: data.riskLabel }),
  });
}

export function updateMarcacionCategory({
  data,
}: {
  data: { entryId: string; value?: string; riskLabel?: RiskLabel; active?: boolean };
}): Promise<MarcacionCategoryResponse> {
  return apiFetch(`/api/v0/marcacion-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({ value: data.value, risk_label: data.riskLabel, active: data.active }),
  });
}

export function deleteMarcacionCategory({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/marcacion-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}
