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

export type VectorStoreVersion = {
  id: string;
  /** Human-readable name; `id` is the immutable internal identifier. */
  name: string;
  description: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Only relations live here. The source document is never copied/deleted. */
  documentKeys: string[];
  /** Compatibility data for agent configuration prompts; relationships remain
   * the source of truth for the vector-store document index. */
  taxonomies?: TaxonomyLibraryEntry[];
};

const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const INITIAL_VECTOR_STORE_VERSIONS: VectorStoreVersion[] = [
  {
    id: "vsv-1",
    name: "Versión inicial",
    description: "Instancia inicial de la base de conocimiento.",
    version: 1,
    createdAt: SEED_TIMESTAMP,
    createdBy: "Sistema",
    updatedAt: null,
    updatedBy: null,
    documentKeys: [],
    taxonomies: initialTaxonomies.map((taxonomy) => ({
      ...taxonomy,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
  },
];
import type { TaxonomyLibraryEntry } from "@/lib/api/knowledgeLibrary.functions";
import { initialTaxonomies } from "./configs";
