import { z } from "zod";

import { apiFetch } from "./client";

// Client functions wrapping the backend's resolution-method-catalog API,
// mirroring marcacion.functions.ts.

const resolutionTag = z.enum([
  "scale_to_analyst",
  "send_to_voicebot",
  "handle_by_aria",
  "block_soft",
  "block_hard",
]);

export type ResolutionTagValue = z.infer<typeof resolutionTag>;

export type ResolutionMethodResponse = {
  id: string;
  value: string;
  resolution_tag: ResolutionTagValue;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function listResolutionMethods({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<ResolutionMethodResponse[]> {
  return apiFetch(`/api/v0/resolution-method-catalog?active_only=${data.activeOnly}`);
}

export function createResolutionMethod({
  data,
}: {
  data: { value: string; resolutionTag: ResolutionTagValue };
}): Promise<ResolutionMethodResponse> {
  return apiFetch("/api/v0/resolution-method-catalog", {
    method: "POST",
    body: JSON.stringify({ value: data.value, resolution_tag: data.resolutionTag }),
  });
}

export function updateResolutionMethod({
  data,
}: {
  data: { entryId: string; value?: string; resolutionTag?: ResolutionTagValue; active?: boolean };
}): Promise<ResolutionMethodResponse> {
  return apiFetch(`/api/v0/resolution-method-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      value: data.value,
      resolution_tag: data.resolutionTag,
      active: data.active,
    }),
  });
}

export function deleteResolutionMethod({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/resolution-method-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}
