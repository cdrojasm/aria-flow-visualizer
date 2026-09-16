/* ─── Vector Store versions (Wave 6) ─────────────────────
   The "Repositorio de Conocimiento" tab in Biblioteca (routes/biblioteca.tsx)
   is the one live-editable copy of taxonomies/modus operandi/flags/similar
   cases (CRUD via knowledgeLibrary.functions.ts, backed by a real
   endpoint). This module adds a lightweight, frontend-only versioning layer
   on top of that: an append-only list of frozen snapshots an admin can
   create from whatever the live library currently holds, so an agent's
   vector-store tool can pin to a specific version instead of always
   searching "whatever is live right now". There's no backend endpoint for
   this yet - versions live only in the react-query cache (see
   useVectorStoreVersions.ts), same "no real persistence, demonstrates the
   interaction" spirit as the rest of this mock. */

import type {
  FlagLibraryEntry,
  ModusOperandiLibraryEntry,
  SimilarCaseLibraryEntry,
  TaxonomyLibraryEntry,
} from "@/lib/api/knowledgeLibrary.functions";
import {
  initialFlags,
  initialModusOperandi,
  initialSimilarCases,
  initialTaxonomies,
} from "./configs";

export type VectorStoreVersion = {
  id: string;
  label: string;
  createdAt: string;
  taxonomies: TaxonomyLibraryEntry[];
  modusOperandi: ModusOperandiLibraryEntry[];
  flags: FlagLibraryEntry[];
  similarCases: SimilarCaseLibraryEntry[];
};

const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const INITIAL_VECTOR_STORE_VERSIONS: VectorStoreVersion[] = [
  {
    id: "vsv-1",
    label: "v1",
    createdAt: SEED_TIMESTAMP,
    taxonomies: initialTaxonomies.map((t) => ({
      ...t,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
    modusOperandi: initialModusOperandi.map((m) => ({
      id: m.id,
      title: m.title,
      narrative: m.narrative,
      taxonomy_library_id: m.taxonomyId,
      evolved_variables: m.evolvedVariables,
      active: m.active,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
    flags: initialFlags.map((f) => ({
      id: f.id,
      flag_type: f.flagType,
      name: f.name,
      description: f.description,
      evolved_variables: f.evolvedVariables,
      modus_operandi_library_ids: f.modusOperandiIds,
      active: true,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
    similarCases: initialSimilarCases.map((s) => ({
      id: s.id,
      text: s.text,
      modus_operandi_library_id: s.modusOperandiId,
      taxonomy_library_id: s.taxonomyId,
      active: true,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
  },
];
