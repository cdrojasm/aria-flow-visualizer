/* ─── Vector Store versions (Wave 6) ─────────────────────
   The "Repositorio de Conocimiento" tab in Biblioteca (routes/biblioteca.tsx)
   is the one live-editable copy of taxonomies/modus operandi/flags/similar
   cases (CRUD via knowledgeLibrary.functions.ts, backed by a real
   endpoint). This module adds a versioning layer on top of that: an
   append-only list of instances an admin can build from whatever the live
   library currently holds, so an agent's vector-store tool can pin to a
   specific instance instead of always searching "whatever is live right
   now". useVectorStoreVersions.ts now backs this with the real
   vector-store-instances endpoints (create/list/add-document/promote) -
   this "VectorStoreVersion" name predates that and is really "vector
   store instance", kept as-is to avoid a wider rename. Building an
   instance's asset manifest here does NOT make it searchable by itself -
   an admin must also call promote (see promotedVersion below) to load it
   into OpenSearch as the current generation; nothing reads the manifest
   directly. */

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
  /** null until promoted at least once - see promoteVectorStoreInstance.
   * A picker or playbook resolution that isn't gated on this being set
   * will silently never find anything. */
  promotedVersion: number | null;
  promotedAt: string | null;
  promotedBy: string | null;
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
    promotedVersion: null,
    promotedAt: null,
    promotedBy: null,
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
