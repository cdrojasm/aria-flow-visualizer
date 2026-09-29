import { z } from "zod";

import { apiFetch } from "./client";
import type { ApiShortageBehavior } from "./configurations.functions";

// Client functions wrapping the backend's knowledge-library API (4
// resources: taxonomies, modus operandi, flags, similar cases) - global,
// config-independent reference data. Versioned frozen snapshots of this
// live content back the "Vector Store" concept agents reference (see
// data/vectorStoreVersions.ts). Mirrors marcacion.functions.ts's pattern,
// grouped in one file since all 4 resources are always used together
// (see biblioteca.tsx).

const flagType = z.enum(["red", "yellow"]);
export type FlagTypeValue = z.infer<typeof flagType>;

export type TaxonomyLibraryEntry = {
  id: string;
  code: string;
  name: string;
  description: string;
  variables: string[];
  examples: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

// How the analyst agent resolves an alert matching this modus operandi:
// strategy, preferred resolution method, and what to fall back to when the
// voicebot / analysts have no capacity (applied without LLM by the
// executor). Mirrors backend's ModusOperandiPlaybook.
export type ApiModusOperandiPlaybook = {
  strategy: string;
  resolution: ApiShortageBehavior;
  if_no_voicebot: ApiShortageBehavior;
  if_no_analyst: ApiShortageBehavior;
};

export type ModusOperandiLibraryEntry = {
  id: string;
  title: string;
  narrative: string;
  taxonomy_library_id: string;
  evolved_variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  playbook: ApiModusOperandiPlaybook | null;
};

export type FlagLibraryEntry = {
  id: string;
  flag_type: FlagTypeValue;
  name: string;
  description: string;
  evolved_variables: string[];
  modus_operandi_library_ids: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SimilarCaseLibraryEntry = {
  id: string;
  text: string;
  modus_operandi_library_id: string;
  taxonomy_library_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// --- Taxonomies -----------------------------------------------------------

export function listTaxonomyLibraryEntries({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<TaxonomyLibraryEntry[]> {
  return apiFetch(`/api/v0/library/taxonomies?active_only=${data.activeOnly}`);
}

export function createTaxonomyLibraryEntry({
  data,
}: {
  data: {
    code: string;
    name: string;
    description?: string;
    variables?: string[];
    examples?: string[];
  };
}): Promise<TaxonomyLibraryEntry> {
  return apiFetch("/api/v0/library/taxonomies", { method: "POST", body: JSON.stringify(data) });
}

export function updateTaxonomyLibraryEntry({
  data,
}: {
  data: {
    entryId: string;
    code?: string;
    name?: string;
    description?: string;
    variables?: string[];
    examples?: string[];
    active?: boolean;
  };
}): Promise<TaxonomyLibraryEntry> {
  const { entryId, ...body } = data;
  return apiFetch(`/api/v0/library/taxonomies/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteTaxonomyLibraryEntry({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/library/taxonomies/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}

// --- Modus operandi ---------------------------------------------------------

export function listModusOperandiLibraryEntries({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<ModusOperandiLibraryEntry[]> {
  return apiFetch(`/api/v0/library/modus-operandi?active_only=${data.activeOnly}`);
}

export function createModusOperandiLibraryEntry({
  data,
}: {
  data: {
    title: string;
    narrative: string;
    taxonomyLibraryId: string;
    evolvedVariables?: string[];
  };
}): Promise<ModusOperandiLibraryEntry> {
  return apiFetch("/api/v0/library/modus-operandi", {
    method: "POST",
    body: JSON.stringify({
      title: data.title,
      narrative: data.narrative,
      taxonomy_library_id: data.taxonomyLibraryId,
      evolved_variables: data.evolvedVariables ?? [],
    }),
  });
}

export function updateModusOperandiLibraryEntry({
  data,
}: {
  data: {
    entryId: string;
    title?: string;
    narrative?: string;
    taxonomyLibraryId?: string;
    evolvedVariables?: string[];
    active?: boolean;
    playbook?: ApiModusOperandiPlaybook;
  };
}): Promise<ModusOperandiLibraryEntry> {
  return apiFetch(`/api/v0/library/modus-operandi/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: data.title,
      narrative: data.narrative,
      taxonomy_library_id: data.taxonomyLibraryId,
      evolved_variables: data.evolvedVariables,
      active: data.active,
      playbook: data.playbook,
    }),
  });
}

export function deleteModusOperandiLibraryEntry({
  data,
}: {
  data: { entryId: string };
}): Promise<void> {
  return apiFetch(`/api/v0/library/modus-operandi/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}

// --- Flags ------------------------------------------------------------------

export function listFlagLibraryEntries({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<FlagLibraryEntry[]> {
  return apiFetch(`/api/v0/library/flags?active_only=${data.activeOnly}`);
}

export function createFlagLibraryEntry({
  data,
}: {
  data: {
    flagType: FlagTypeValue;
    name: string;
    description?: string;
    evolvedVariables?: string[];
    modusOperandiLibraryIds?: string[];
  };
}): Promise<FlagLibraryEntry> {
  return apiFetch("/api/v0/library/flags", {
    method: "POST",
    body: JSON.stringify({
      flag_type: data.flagType,
      name: data.name,
      description: data.description ?? "",
      evolved_variables: data.evolvedVariables ?? [],
      modus_operandi_library_ids: data.modusOperandiLibraryIds ?? [],
    }),
  });
}

export function updateFlagLibraryEntry({
  data,
}: {
  data: {
    entryId: string;
    flagType?: FlagTypeValue;
    name?: string;
    description?: string;
    evolvedVariables?: string[];
    modusOperandiLibraryIds?: string[];
    active?: boolean;
  };
}): Promise<FlagLibraryEntry> {
  return apiFetch(`/api/v0/library/flags/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      flag_type: data.flagType,
      name: data.name,
      description: data.description,
      evolved_variables: data.evolvedVariables,
      modus_operandi_library_ids: data.modusOperandiLibraryIds,
      active: data.active,
    }),
  });
}

export function deleteFlagLibraryEntry({ data }: { data: { entryId: string } }): Promise<void> {
  return apiFetch(`/api/v0/library/flags/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}

// --- Similar cases ------------------------------------------------------------

export function listSimilarCaseLibraryEntries({
  data,
}: {
  data: { activeOnly: boolean };
}): Promise<SimilarCaseLibraryEntry[]> {
  return apiFetch(`/api/v0/library/similar-cases?active_only=${data.activeOnly}`);
}

export function createSimilarCaseLibraryEntry({
  data,
}: {
  data: { text: string; modusOperandiLibraryId: string; taxonomyLibraryId: string };
}): Promise<SimilarCaseLibraryEntry> {
  return apiFetch("/api/v0/library/similar-cases", {
    method: "POST",
    body: JSON.stringify({
      text: data.text,
      modus_operandi_library_id: data.modusOperandiLibraryId,
      taxonomy_library_id: data.taxonomyLibraryId,
    }),
  });
}

export function updateSimilarCaseLibraryEntry({
  data,
}: {
  data: {
    entryId: string;
    text?: string;
    modusOperandiLibraryId?: string;
    taxonomyLibraryId?: string;
    active?: boolean;
  };
}): Promise<SimilarCaseLibraryEntry> {
  return apiFetch(`/api/v0/library/similar-cases/${encodeURIComponent(data.entryId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      text: data.text,
      modus_operandi_library_id: data.modusOperandiLibraryId,
      taxonomy_library_id: data.taxonomyLibraryId,
      active: data.active,
    }),
  });
}

export function deleteSimilarCaseLibraryEntry({
  data,
}: {
  data: { entryId: string };
}): Promise<void> {
  return apiFetch(`/api/v0/library/similar-cases/${encodeURIComponent(data.entryId)}`, {
    method: "DELETE",
  });
}
