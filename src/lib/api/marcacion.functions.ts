import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Server functions wrapping the backend's marcación-catalog API, mirroring
// configuration.functions.ts's tag-catalog client (see that file's header).

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = getServerConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

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

export const listMarcacionCategories = createServerFn({ method: "GET" })
  .inputValidator(z.object({ activeOnly: z.boolean().default(false) }))
  .handler(({ data }) =>
    apiFetch<MarcacionCategoryResponse[]>(
      `/api/v0/marcacion-catalog?active_only=${data.activeOnly}`,
    ),
  );

export const createMarcacionCategory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ value: z.string().min(1), riskLabel: riskLabel }))
  .handler(({ data }) =>
    apiFetch<MarcacionCategoryResponse>("/api/v0/marcacion-catalog", {
      method: "POST",
      body: JSON.stringify({ value: data.value, risk_label: data.riskLabel }),
    }),
  );

export const updateMarcacionCategory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      entryId: z.string().min(1),
      value: z.string().min(1).optional(),
      riskLabel: riskLabel.optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(({ data }) =>
    apiFetch<MarcacionCategoryResponse>(
      `/api/v0/marcacion-catalog/${encodeURIComponent(data.entryId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          value: data.value,
          risk_label: data.riskLabel,
          active: data.active,
        }),
      },
    ),
  );

export const deleteMarcacionCategory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ entryId: z.string().min(1) }))
  .handler(({ data }) =>
    apiFetch<void>(`/api/v0/marcacion-catalog/${encodeURIComponent(data.entryId)}`, {
      method: "DELETE",
    }),
  );
