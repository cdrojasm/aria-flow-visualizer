import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Server functions wrapping the backend's tag-catalog API (../backend,
// base path /api/v0 — see its CLAUDE.md for the hexagonal layout). Scoped
// to tag-catalog endpoints only for now: the rest of /configuracion still
// runs on local mock state (see src/data/configs.ts), same as every other
// tab today — the tag catalog is genuinely new reference data with no
// local-mock equivalent, so it hits the real backend from the start.

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

export const listTags = createServerFn({ method: "GET" })
  .inputValidator(z.object({ category: tagCategory, activeOnly: z.boolean().default(false) }))
  .handler(({ data }) =>
    apiFetch<TagEntryResponse[]>(
      `/api/v0/tag-catalog?category=${data.category}&active_only=${data.activeOnly}`,
    ),
  );

export const createTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ category: tagCategory, value: z.string().min(1) }))
  .handler(({ data }) =>
    apiFetch<TagEntryResponse>("/api/v0/tag-catalog", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );

export const updateTag = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      category: tagCategory,
      tagId: z.string().min(1),
      value: z.string().min(1).optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(({ data }) =>
    apiFetch<TagEntryResponse>(
      `/api/v0/tag-catalog/${data.category}/${encodeURIComponent(data.tagId)}`,
      { method: "PATCH", body: JSON.stringify({ value: data.value, active: data.active }) },
    ),
  );

export const deleteTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ category: tagCategory, tagId: z.string().min(1) }))
  .handler(({ data }) =>
    apiFetch<void>(`/api/v0/tag-catalog/${data.category}/${encodeURIComponent(data.tagId)}`, {
      method: "DELETE",
    }),
  );
