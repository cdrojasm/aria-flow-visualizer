import { apiFetch } from "./client";

// Client functions wrapping the backend's variable-catalog API, mirroring
// marcacion.functions.ts.

export type VariableResponse = {
  id: string;
  value: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function listVariables({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<VariableResponse[]> {
  return apiFetch(`/api/v0/variable-catalog?active_only=${data.activeOnly}`);
}

export function createVariable({
  data,
}: {
  data: { value: string; description?: string };
}): Promise<VariableResponse> {
  return apiFetch("/api/v0/variable-catalog", {
    method: "POST",
    body: JSON.stringify({ value: data.value, description: data.description ?? "" }),
  });
}

export function updateVariable({
  data,
}: {
  data: { entryId: string; value?: string; description?: string; active?: boolean };
}): Promise<VariableResponse> {
  return apiFetch(`/api/v0/variable-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({ value: data.value, description: data.description, active: data.active }),
  });
}

export function deleteVariable({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/variable-catalog/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}
