import { z } from "zod";

import { apiFetch } from "./client";

// Client functions wrapping the backend's tag-catalog API (../backend,
// base path /api/v0 — see its CLAUDE.md for the hexagonal layout). Scoped
// to tag-catalog endpoints only for now: the rest of /configuracion still
// runs on local mock state (see src/data/configs.ts), same as every other
// tab today — the tag catalog is genuinely new reference data with no
// local-mock equivalent, so it hits the real backend from the start.

const tagCategory = z.enum(["integration_point", "triggered_rule", "event_type"]);

export type TagCategory = z.infer<typeof tagCategory>;

export type TagEntryResponse = {
  id: string;
  category: TagCategory;
  value: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export function listTags({
  data,
}: {
  data: { category: TagCategory; activeOnly: boolean };
}): Promise<TagEntryResponse[]> {
  return apiFetch(`/api/v0/tag-catalog?category=${data.category}&active_only=${data.activeOnly}`);
}

export function createTag({
  data,
}: {
  data: { category: TagCategory; value: string };
}): Promise<TagEntryResponse> {
  return apiFetch("/api/v0/tag-catalog", { method: "POST", body: JSON.stringify(data) });
}

export function updateTag({
  data,
}: {
  data: { category: TagCategory; tagId: string; value?: string; active?: boolean };
}): Promise<TagEntryResponse> {
  return apiFetch(`/api/v0/tag-catalog/${data.category}/${encodeURIComponent(data.tagId)}`, {
    method: "PATCH",
    body: JSON.stringify({ value: data.value, active: data.active }),
  });
}

export function deleteTag({
  data,
}: {
  data: { category: TagCategory; tagId: string };
}): Promise<void> {
  return apiFetch(`/api/v0/tag-catalog/${data.category}/${encodeURIComponent(data.tagId)}`, {
    method: "DELETE",
  });
}
