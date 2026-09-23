import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useState } from "react";

import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Field,
  TagInput,
  VariablePicker,
} from "@/components/configuracion/shared/FormControls";
import { TAG_CATEGORY_LABELS, type TagCategory } from "@/data/configs";
import { createId } from "@/lib/createId";
import {
  useAddVectorStoreDocument,
  useCreateVectorStoreVersion,
  usePreviewVectorStoreDocument,
  useRemoveVectorStoreDocument,
  useVectorStoreDocuments,
  useVectorStoreVersions,
} from "@/hooks/useVectorStoreVersions";
import {
  createTag,
  deleteTag,
  listTags,
  updateTag,
  type TagEntryResponse,
} from "@/lib/api/configuration.functions";
import {
  createFlagLibraryEntry,
  createModusOperandiLibraryEntry,
  createSimilarCaseLibraryEntry,
  createTaxonomyLibraryEntry,
  deleteFlagLibraryEntry,
  deleteModusOperandiLibraryEntry,
  deleteSimilarCaseLibraryEntry,
  deleteTaxonomyLibraryEntry,
  listFlagLibraryEntries,
  listModusOperandiLibraryEntries,
  listSimilarCaseLibraryEntries,
  listTaxonomyLibraryEntries,
  updateFlagLibraryEntry,
  updateModusOperandiLibraryEntry,
  updateSimilarCaseLibraryEntry,
  updateTaxonomyLibraryEntry,
  type FlagLibraryEntry,
  type FlagTypeValue,
  type ModusOperandiLibraryEntry,
  type SimilarCaseLibraryEntry,
  type TaxonomyLibraryEntry,
} from "@/lib/api/knowledgeLibrary.functions";
import {
  createChannelLibraryEntry,
  deleteChannelLibraryEntry,
  listChannelLibraryEntries,
  updateChannelLibraryEntry,
  type ChannelLibraryEntry,
} from "@/lib/api/channelLibrary.functions";
import { WatchlistManager } from "@/components/biblioteca/WatchlistManager";
import { DatasetLibraryManager } from "@/components/biblioteca/DatasetLibraryManager";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ConfirmVectorStoreDocumentsDialog } from "@/components/ui/confirm-vector-store-documents-dialog";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { usePagination } from "@/hooks/usePagination";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content:
          "Biblioteca global de taxonomías, modus operandi, flags y casos similares.",
      },
    ],
  }),
  component: BibliotecaPage,
});

/* ─── Biblioteca global (backlog #3, "Repositorio de Conocimiento"
   in Wave 6) ──────────────────────────────────────────────
   Global, config-independent reference data - the "conocimiento" tab below
   is the one live-editable copy of taxonomías/modus operandi/flags/casos
   similares. Agents no longer snapshot-copy this into a per-segment config
   (that per-segment "Base de conocimiento" concept was removed, item 8/9);
   instead this content is versioned (see data/vectorStoreVersions.ts,
   useVectorStoreVersions.ts) and an agent's vector-store tool just pins to
   one or more instance ids (see AgentToolsFields in configuracion/shared/
   FormControls.tsx), so editing here never changes what an already-built
   config searches against. Own top-level route (not a configuración tab) because
   it's reference data multiple configs pull from, not a per-config setting
   - see AppSidebar.tsx for the nav entry and useRole.ts for admin-only
   visibility. */

const FLAG_TYPE_STYLES: Record<FlagTypeValue, string> = {
  red: "bg-danger/15 text-danger border-danger/40",
  yellow: "bg-warning/15 text-warning border-warning/40",
};
const FLAG_TYPE_LABELS: Record<FlagTypeValue, string> = {
  red: "Roja",
  yellow: "Amarilla",
};

// Event-shape catalogs (an alert's integration point / triggered rule /
// event type) - moved here from SegmentoTab's filter builder header (still
// used there via TagMultiSelect to build filter conditions; only the
// admin CRUD moved) because they're global reference data, same footing
// as the taxonomy/MO/flag/similar-case catalogs above, not a per-segment
// setting.
const EVENT_CATALOG_OPTIONS: TagCategory[] = [
  "integration_point",
  "triggered_rule",
  "event_type",
];

type BibliotecaTab =
  "conocimiento" | "eventos" | "canales" | "listas" | "datasets";
type KnowledgeTab =
  | "vector-store"
  | "taxonomias"
  | "modus-operandi"
  | "yellow-flags"
  | "red-flags"
  | "casos-similares";
const BIBLIOTECA_TABS: { key: BibliotecaTab; label: string }[] = [
  { key: "conocimiento", label: "Base de conocimiento" },
  { key: "eventos", label: "Catálogos de eventos" },
  { key: "canales", label: "Canales" },
  { key: "listas", label: "Listas negras/blancas" },
  { key: "datasets", label: "Datasets" },
];

function BibliotecaPage() {
  const { user } = useRole();
  const currentUserName = user?.name ?? "";
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<BibliotecaTab>("conocimiento");
  const [activeKnowledgeTab, setActiveKnowledgeTab] =
    useState<KnowledgeTab>("vector-store");
  const [activeEventCatalog, setActiveEventCatalog] =
    useState<TagCategory>("integration_point");

  const taxonomiesQuery = useQuery({
    queryKey: ["libraryTaxonomies"],
    queryFn: () => listTaxonomyLibraryEntries({ data: { activeOnly: false } }),
  });
  const modusOperandiQuery = useQuery({
    queryKey: ["libraryModusOperandi"],
    queryFn: () =>
      listModusOperandiLibraryEntries({ data: { activeOnly: false } }),
  });
  const flagsQuery = useQuery({
    queryKey: ["libraryFlags"],
    queryFn: () => listFlagLibraryEntries({ data: { activeOnly: false } }),
  });
  const similarCasesQuery = useQuery({
    queryKey: ["librarySimilarCases"],
    queryFn: () =>
      listSimilarCaseLibraryEntries({ data: { activeOnly: false } }),
  });

  const taxonomies = taxonomiesQuery.data ?? [];
  const modusOperandi = modusOperandiQuery.data ?? [];
  const flags = flagsQuery.data ?? [];
  const similarCases = similarCasesQuery.data ?? [];
  const taxonomiesPage = usePagination(taxonomies, 10);
  const modusOperandiPage = usePagination(modusOperandi, 10);
  const visibleFlags = flags.filter((flag) =>
    activeKnowledgeTab === "yellow-flags"
      ? flag.flag_type === "yellow"
      : flag.flag_type === "red",
  );
  const flagsPage = usePagination(visibleFlags, 10);
  const similarCasesPage = usePagination(similarCases, 10);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["libraryTaxonomies"] });
    queryClient.invalidateQueries({ queryKey: ["libraryModusOperandi"] });
    queryClient.invalidateQueries({ queryKey: ["libraryFlags"] });
    queryClient.invalidateQueries({ queryKey: ["librarySimilarCases"] });
  };

  // --- Vector Store versions (Wave 6, item 9) ---------------------------------
  // Frozen snapshots of the live content above - see
  // data/vectorStoreVersions.ts for why this has no real backend endpoint.
  const { versions: vectorStoreVersions } = useVectorStoreVersions();
  const createVectorStoreVersion = useCreateVectorStoreVersion();
  const addVectorStoreDocument = useAddVectorStoreDocument();
  const previewVectorStoreDocument = usePreviewVectorStoreDocument();
  const removeVectorStoreDocument = useRemoveVectorStoreDocument();
  const [selectedVectorStoreId, setSelectedVectorStoreId] =
    useState<string>("");
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionDescription, setNewVersionDescription] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [expandedTaxonomies, setExpandedTaxonomies] = useState<Set<string>>(
    new Set(),
  );
  const [expandedModusOperandi, setExpandedModusOperandi] = useState<
    Set<string>
  >(new Set());
  const [pendingDocumentAddition, setPendingDocumentAddition] = useState<{
    instanceId: string;
    assetType:
      | "taxonomy"
      | "modus_operandi"
      | "yellow_flag"
      | "red_flag"
      | "similar_case";
    assetId: string;
    impact: Awaited<ReturnType<typeof previewVectorStoreDocument>>;
  } | null>(null);
  const [isPreviewingDocumentAddition, setIsPreviewingDocumentAddition] =
    useState(false);
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [documentAdditionError, setDocumentAdditionError] = useState<
    string | null
  >(null);

  const selectedVectorStore =
    vectorStoreVersions.find(
      (version) => version.id === selectedVectorStoreId,
    ) ?? vectorStoreVersions[0];
  const vectorStoreRelationsQuery = useVectorStoreDocuments(
    selectedVectorStore?.id,
  );
  const vectorStoreRelations = vectorStoreRelationsQuery.data ?? [];
  const vectorStoreDocuments = [
    ...taxonomies.map((entry) => ({
      key: `taxonomy:${entry.id}`,
      assetType: "taxonomy" as const,
      type: "Taxonomía",
      name: entry.name,
      entry,
    })),
    ...modusOperandi.map((entry) => ({
      key: `modus_operandi:${entry.id}`,
      assetType: "modus_operandi" as const,
      type: "Modus operandi",
      name: entry.title,
      entry,
    })),
    ...flags
      .filter((entry) => entry.flag_type === "yellow")
      .map((entry) => ({
        key: `yellow_flag:${entry.id}`,
        assetType: "yellow_flag" as const,
        type: "Yellow flag",
        name: entry.name,
        entry,
      })),
    ...flags
      .filter((entry) => entry.flag_type === "red")
      .map((entry) => ({
        key: `red_flag:${entry.id}`,
        assetType: "red_flag" as const,
        type: "Red flag",
        name: entry.name,
        entry,
      })),
    ...similarCases.map((entry) => ({
      key: `similar_case:${entry.id}`,
      assetType: "similar_case" as const,
      type: "Caso similar",
      name: entry.text,
      entry,
    })),
  ];
  const documentMatchesSearch = (name: string) => {
    if (!documentSearch.trim()) return true;
    try {
      return new RegExp(documentSearch, "i").test(name);
    } catch {
      return name.toLowerCase().includes(documentSearch.toLowerCase());
    }
  };
  const relationForDocument = (key: string) => {
    const [assetType, assetId] = key.split(":", 2);
    return vectorStoreRelations.find(
      (relation) =>
        relation.asset_type === assetType && relation.asset_id === assetId,
    );
  };
  const filteredVectorStoreDocuments = vectorStoreDocuments.filter(
    (document) =>
      (documentTypeFilter === "all" || document.type === documentTypeFilter) &&
      documentMatchesSearch(document.name) &&
      !relationForDocument(document.key),
  );
  const documentsToAddPage = usePagination(filteredVectorStoreDocuments, 10);
  const instanceTaxonomyIds = new Set(
    vectorStoreRelations
      .filter((relation) => relation.asset_type === "taxonomy")
      .map((relation) => relation.asset_id),
  );
  vectorStoreRelations
    .filter((relation) => relation.asset_type === "modus_operandi")
    .forEach((relation) => {
      const parent = modusOperandi.find((item) => item.id === relation.asset_id);
      if (parent) instanceTaxonomyIds.add(parent.taxonomy_library_id);
    });
  vectorStoreRelations
    .filter((relation) => relation.asset_type === "similar_case")
    .forEach((relation) => {
      const parent = similarCases.find((item) => item.id === relation.asset_id);
      if (parent) instanceTaxonomyIds.add(parent.taxonomy_library_id);
    });
  vectorStoreRelations
    .filter((relation) => relation.asset_type === "red_flag" || relation.asset_type === "yellow_flag")
    .forEach((relation) => {
      const flag = flags.find((item) => item.id === relation.asset_id);
      flag?.modus_operandi_library_ids.forEach((modusOperandiId) => {
        const parent = modusOperandi.find((item) => item.id === modusOperandiId);
        if (parent) instanceTaxonomyIds.add(parent.taxonomy_library_id);
      });
    });
  const instanceTaxonomies = taxonomies.filter((taxonomy) => instanceTaxonomyIds.has(taxonomy.id));
  const instanceTaxonomiesPage = usePagination(instanceTaxonomies, 10);
  const toggleExpanded = (
    setter: (update: (current: Set<string>) => Set<string>) => void,
    id: string,
  ) =>
    setter((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const openDocumentAdditionConfirmation = async (
    instanceId: string,
    assetType:
      | "taxonomy"
      | "modus_operandi"
      | "yellow_flag"
      | "red_flag"
      | "similar_case",
    assetId: string,
  ) => {
    setIsPreviewingDocumentAddition(true);
    setDocumentAdditionError(null);
    try {
      const impact = await previewVectorStoreDocument(
        instanceId,
        assetType,
        assetId,
      );
      setPendingDocumentAddition({ instanceId, assetType, assetId, impact });
    } catch (error) {
      setDocumentAdditionError(
        error instanceof Error
          ? error.message
          : "No fue posible calcular el impacto.",
      );
    } finally {
      setIsPreviewingDocumentAddition(false);
    }
  };
  const confirmDocumentAddition = async () => {
    if (!pendingDocumentAddition) return;
    setIsAddingDocument(true);
    setDocumentAdditionError(null);
    try {
      await addVectorStoreDocument(
        pendingDocumentAddition.instanceId,
        pendingDocumentAddition.assetType,
        pendingDocumentAddition.assetId,
      );
      setPendingDocumentAddition(null);
    } catch (error) {
      setDocumentAdditionError(
        error instanceof Error
          ? error.message
          : "No fue posible agregar los documentos.",
      );
    } finally {
      setIsAddingDocument(false);
    }
  };
  const pendingImpactDocuments = (
    pendingDocumentAddition?.impact.will_add ?? []
  ).map((item) => {
    const document = vectorStoreDocuments.find(
      (candidate) => candidate.key === `${item.asset_type}:${item.asset_id}`,
    );
    return {
      label: document?.name ?? item.asset_id,
      type: document?.type ?? item.asset_type,
      origin: item.origin,
    };
  });

  // --- Channels ---------------------------------------------------------------
  // Same query key configuracion.tsx's SegmentoTab uses, so saving a channel
  // here invalidates that tab's "Agregar canal" list too.
  const channelsQuery = useQuery({
    queryKey: ["channelLibrary"],
    queryFn: () => listChannelLibraryEntries({ data: { activeOnly: false } }),
  });
  const channels = channelsQuery.data ?? [];
  const channelsPage = usePagination(channels, 10);
  const invalidateChannels = () =>
    queryClient.invalidateQueries({ queryKey: ["channelLibrary"] });

  const [editingChannel, setEditingChannel] =
    useState<Partial<ChannelLibraryEntry> | null>(null);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [deletingChannel, setDeletingChannel] =
    useState<ChannelLibraryEntry | null>(null);
  const saveChannelMutation = useMutation({
    mutationFn: (draft: Partial<ChannelLibraryEntry>) =>
      draft.id
        ? updateChannelLibraryEntry({
            data: {
              entryId: draft.id,
              code: draft.code,
              name: draft.name,
              description: draft.description,
            },
          })
        : createChannelLibraryEntry({
            data: {
              code: draft.code ?? "",
              name: draft.name ?? "",
              description: draft.description ?? "",
            },
          }),
    onSuccess: () => {
      invalidateChannels();
      setShowChannelForm(false);
      setEditingChannel(null);
    },
  });
  const deleteChannelMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteChannelLibraryEntry({ data: { entryId } }),
    onSuccess: () => {
      invalidateChannels();
      setDeletingChannel(null);
    },
  });
  const toggleChannelActive = useMutation({
    mutationFn: (entry: ChannelLibraryEntry) =>
      updateChannelLibraryEntry({
        data: { entryId: entry.id, active: !entry.active },
      }),
    onSuccess: invalidateChannels,
  });

  // --- Taxonomies -----------------------------------------------------------
  const [editingTax, setEditingTax] =
    useState<Partial<TaxonomyLibraryEntry> | null>(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [deletingTax, setDeletingTax] = useState<TaxonomyLibraryEntry | null>(
    null,
  );
  const saveTaxMutation = useMutation({
    mutationFn: (draft: Partial<TaxonomyLibraryEntry>) =>
      draft.id
        ? updateTaxonomyLibraryEntry({
            data: {
              entryId: draft.id,
              code: draft.code,
              name: draft.name,
              description: draft.description,
              variables: draft.variables,
              examples: draft.examples,
            },
          })
        : createTaxonomyLibraryEntry({
            data: {
              code: draft.code ?? "",
              name: draft.name ?? "",
              description: draft.description ?? "",
              variables: draft.variables ?? [],
              examples: draft.examples ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowTaxForm(false);
      setEditingTax(null);
    },
  });
  const deleteTaxMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteTaxonomyLibraryEntry({ data: { entryId } }),
    onSuccess: () => {
      invalidateAll();
      setDeletingTax(null);
    },
  });
  const toggleTaxActive = useMutation({
    mutationFn: (entry: TaxonomyLibraryEntry) =>
      updateTaxonomyLibraryEntry({
        data: { entryId: entry.id, active: !entry.active },
      }),
    onSuccess: invalidateAll,
  });

  // --- Modus operandi ---------------------------------------------------------
  const [editingMO, setEditingMO] =
    useState<Partial<ModusOperandiLibraryEntry> | null>(null);
  const [showMOForm, setShowMOForm] = useState(false);
  const [deletingMO, setDeletingMO] =
    useState<ModusOperandiLibraryEntry | null>(null);
  const saveMOMutation = useMutation({
    mutationFn: (draft: Partial<ModusOperandiLibraryEntry>) =>
      draft.id
        ? updateModusOperandiLibraryEntry({
            data: {
              entryId: draft.id,
              title: draft.title,
              narrative: draft.narrative,
              taxonomyLibraryId: draft.taxonomy_library_id,
              evolvedVariables: draft.evolved_variables,
            },
          })
        : createModusOperandiLibraryEntry({
            data: {
              title: draft.title ?? "",
              narrative: draft.narrative ?? "",
              taxonomyLibraryId:
                draft.taxonomy_library_id ?? taxonomies[0]?.id ?? "",
              evolvedVariables: draft.evolved_variables ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowMOForm(false);
      setEditingMO(null);
    },
  });
  const deleteMOMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteModusOperandiLibraryEntry({ data: { entryId } }),
    onSuccess: () => {
      invalidateAll();
      setDeletingMO(null);
    },
  });
  const toggleMOActive = useMutation({
    mutationFn: (entry: ModusOperandiLibraryEntry) =>
      updateModusOperandiLibraryEntry({
        data: { entryId: entry.id, active: !entry.active },
      }),
    onSuccess: invalidateAll,
  });

  // --- Flags ------------------------------------------------------------------
  const [editingFlag, setEditingFlag] =
    useState<Partial<FlagLibraryEntry> | null>(null);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [deletingFlag, setDeletingFlag] = useState<FlagLibraryEntry | null>(
    null,
  );
  const saveFlagMutation = useMutation({
    mutationFn: (draft: Partial<FlagLibraryEntry>) =>
      draft.id
        ? updateFlagLibraryEntry({
            data: {
              entryId: draft.id,
              flagType: draft.flag_type,
              name: draft.name,
              description: draft.description,
              evolvedVariables: draft.evolved_variables,
              modusOperandiLibraryIds: draft.modus_operandi_library_ids,
            },
          })
        : createFlagLibraryEntry({
            data: {
              flagType: draft.flag_type ?? "red",
              name: draft.name ?? "",
              description: draft.description ?? "",
              evolvedVariables: draft.evolved_variables ?? [],
              modusOperandiLibraryIds: draft.modus_operandi_library_ids ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowFlagForm(false);
      setEditingFlag(null);
    },
  });
  const deleteFlagMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteFlagLibraryEntry({ data: { entryId } }),
    onSuccess: () => {
      invalidateAll();
      setDeletingFlag(null);
    },
  });
  const toggleFlagActive = useMutation({
    mutationFn: (entry: FlagLibraryEntry) =>
      updateFlagLibraryEntry({
        data: { entryId: entry.id, active: !entry.active },
      }),
    onSuccess: invalidateAll,
  });

  // --- Similar cases ------------------------------------------------------------
  const [editingCase, setEditingCase] =
    useState<Partial<SimilarCaseLibraryEntry> | null>(null);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [deletingCase, setDeletingCase] =
    useState<SimilarCaseLibraryEntry | null>(null);
  const saveCaseMutation = useMutation({
    mutationFn: (draft: Partial<SimilarCaseLibraryEntry>) =>
      draft.id
        ? updateSimilarCaseLibraryEntry({
            data: {
              entryId: draft.id,
              text: draft.text,
              modusOperandiLibraryId: draft.modus_operandi_library_id,
              taxonomyLibraryId: draft.taxonomy_library_id,
            },
          })
        : createSimilarCaseLibraryEntry({
            data: {
              text: draft.text ?? "",
              modusOperandiLibraryId:
                draft.modus_operandi_library_id ?? modusOperandi[0]?.id ?? "",
              taxonomyLibraryId:
                draft.taxonomy_library_id ??
                modusOperandi[0]?.taxonomy_library_id ??
                "",
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowCaseForm(false);
      setEditingCase(null);
    },
  });
  const deleteCaseMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteSimilarCaseLibraryEntry({ data: { entryId } }),
    onSuccess: () => {
      invalidateAll();
      setDeletingCase(null);
    },
  });
  const toggleCaseActive = useMutation({
    mutationFn: (entry: SimilarCaseLibraryEntry) =>
      updateSimilarCaseLibraryEntry({
        data: { entryId: entry.id, active: !entry.active },
      }),
    onSuccess: invalidateAll,
  });

  const modusOperandiForTaxonomy = (taxonomyLibraryId?: string) =>
    modusOperandi.filter((m) => m.taxonomy_library_id === taxonomyLibraryId);

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold text-text-primary">
            Biblioteca
          </h1>
          <p className="text-[13px] text-text-secondary mt-1">
            Catálogo global de taxonomías, modus operandi, flags, casos
            similares y catálogos de eventos. Las configuraciones por segmento
            importan (copian) desde aquí para construir su propio conocimiento —
            editar una entrada aquí no afecta configuraciones ya construidas.
          </p>
        </header>

        <div className="flex items-center gap-1 border-b border-border">
          {BIBLIOTECA_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${activeTab === t.key ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "eventos" && (
          <div className="space-y-4">
            <div className="sticky top-0 z-30 -mx-1 bg-background/95 py-2 backdrop-blur">
              <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 w-fit">
                {EVENT_CATALOG_OPTIONS.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveEventCatalog(category)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${activeEventCatalog === category ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                  >
                    {TAG_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </div>
            <EventCatalogSection category={activeEventCatalog} />
          </div>
        )}

        {activeTab === "canales" && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">
                  Canales
                </h2>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Los segmentos que una configuración puede activar (ej.
                  tarjetas, canales digitales) - el orden de desempate entre
                  segmentos se define por configuración, en el tab Segmento.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingChannel({ code: createId(), name: "", description: "" });
                  setShowChannelForm(true);
                }}
                className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Nuevo canal
              </button>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-text-secondary text-left border-b border-border">
                  <th className="px-6 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium w-24"></th>
                </tr>
              </thead>
              <tbody>
                {channelsPage.pageItems.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-surface align-top"
                  >
                    <td className="px-6 py-3 font-medium text-text-primary">
                      {c.name}
                    </td>
                    <td className="px-3 py-3 text-text-secondary max-w-xs truncate">
                      {c.description}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleChannelActive.mutate(c)}
                        className={`text-[11px] uppercase tracking-wider ${c.active ? "text-success" : "text-text-secondary"}`}
                      >
                        {c.active ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Editar canal ${c.name}`}
                          title="Editar canal"
                          onClick={() => {
                            setEditingChannel({ ...c });
                            setShowChannelForm(true);
                          }}
                          className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar canal ${c.name}`}
                          title="Eliminar canal"
                          onClick={() => setDeletingChannel(c)}
                          className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {channels.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-8 text-center text-text-secondary"
                    >
                      Sin canales en la biblioteca.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <PaginationFooter
              page={channelsPage.page}
              pageCount={channelsPage.pageCount}
              total={channelsPage.total}
              pageSize={channelsPage.pageSize}
              onPageChange={channelsPage.setPage}
              itemLabel="canal"
            />
          </section>
        )}

        {activeTab === "listas" && <WatchlistManager />}

        {activeTab === "datasets" && <DatasetLibraryManager />}

        {showChannelForm && editingChannel && (
          <div
            className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowChannelForm(false)}
          >
            <div
              className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {editingChannel.id ? "Editar canal" : "Nuevo canal"}
                </h3>
                <button
                  onClick={() => setShowChannelForm(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <Field
                  label="Nombre"
                  hint="El nombre se usa para buscar esta taxonomía en la base de conocimiento."
                >
                  <input
                    value={editingChannel.name ?? ""}
                    onChange={(e) =>
                      setEditingChannel({
                        ...editingChannel,
                        name: e.target.value,
                      })
                    }
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                    placeholder="Tarjetas"
                  />
                </Field>
                <Field
                  label="Descripción"
                  hint="La descripción también se indexa para las búsquedas semánticas y por texto."
                >
                  <textarea
                    value={editingChannel.description ?? ""}
                    onChange={(e) =>
                      setEditingChannel({
                        ...editingChannel,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowChannelForm(false)}
                  className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveChannelMutation.mutate(editingChannel)}
                  disabled={
                    !editingChannel.name?.trim() ||
                    saveChannelMutation.isPending
                  }
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingChannel.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "conocimiento" && (
          <>
            <div className="sticky top-0 z-30 -mx-1 bg-background/95 py-2 backdrop-blur">
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5 w-fit">
                {(
                  [
                    ["vector-store", "Vector store"],
                    ["taxonomias", "Taxonomías de fraude"],
                    ["modus-operandi", "Modus operandi"],
                    ["yellow-flags", "Yellow flags"],
                    ["red-flags", "Red flags"],
                    ["casos-similares", "Casos similares"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveKnowledgeTab(key)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                      activeKnowledgeTab === key
                        ? "bg-primary text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeKnowledgeTab === "vector-store" && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Instancias de Vector store
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Cada versión es una instancia auditable. Agregar o retirar
                    un documento sólo modifica su relación con esta instancia;
                    no genera embeddings.
                  </p>
                </div>
                <div className="grid grid-cols-[260px_minmax(0,1fr)] min-h-[460px]">
                  <aside className="border-r border-border p-3 space-y-2">
                    <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                      Versiones
                    </p>
                    {vectorStoreVersions.map((version) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => setSelectedVectorStoreId(version.id)}
                        className={`w-full rounded-lg p-3 text-left transition-colors ${selectedVectorStore?.id === version.id ? "bg-primary-light border border-primary/30" : "hover:bg-surface border border-transparent"}`}
                      >
                        <p className="text-[13px] font-medium text-text-primary">
                          v{version.version} · {version.name}
                        </p>
                        <p className="mt-1 text-[11px] text-text-secondary truncate">
                          {version.description}
                        </p>
                      </button>
                    ))}
                    <div className="pt-3 mt-3 border-t border-border space-y-2">
                      <input
                        value={newVersionName}
                        onChange={(e) => setNewVersionName(e.target.value)}
                        placeholder="Nombre de versión"
                        className="w-full h-8 rounded-md border border-border px-2 text-[12px]"
                      />
                      <input
                        value={newVersionDescription}
                        onChange={(e) =>
                          setNewVersionDescription(e.target.value)
                        }
                        placeholder="Descripción"
                        className="w-full h-8 rounded-md border border-border px-2 text-[12px]"
                      />
                      <p className="px-1 text-[11px] text-text-secondary">
                        Creado por:{" "}
                        <span className="font-medium text-text-primary">
                          {user?.name ?? "Cargando sesión…"}
                        </span>
                      </p>
                      <button
                        type="button"
                        disabled={!newVersionName.trim() || !currentUserName}
                        onClick={async () => {
                          const createdId = await createVectorStoreVersion({
                            name: newVersionName.trim(),
                            description: newVersionDescription.trim(),
                          });
                          setSelectedVectorStoreId(createdId);
                          setNewVersionName("");
                          setNewVersionDescription("");
                        }}
                        className="w-full inline-flex justify-center items-center gap-1 rounded-md bg-primary px-2 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Crear versión
                      </button>
                    </div>
                  </aside>
                  {selectedVectorStore && (
                    <div className="p-6 space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-[16px] font-semibold text-text-primary">
                            v{selectedVectorStore.version} ·{" "}
                            {selectedVectorStore.name}
                          </h3>
                          <p className="mt-1 text-[12px] text-text-secondary">
                            {selectedVectorStore.description ||
                              "Sin descripción."}
                          </p>
                        </div>
                        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary">
                          {vectorStoreRelations.length} documentos
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-surface p-3 text-[11px] text-text-secondary">
                        <span>
                          Creado:{" "}
                          {new Date(
                            selectedVectorStore.createdAt,
                          ).toLocaleString()}
                        </span>
                        <span>Creado por: {selectedVectorStore.createdBy}</span>
                        <span>
                          Editado:{" "}
                          {selectedVectorStore.updatedAt
                            ? new Date(
                                selectedVectorStore.updatedAt,
                              ).toLocaleString()
                            : "—"}
                        </span>
                        <span>
                          Editado por: {selectedVectorStore.updatedBy ?? "—"}
                        </span>
                        <span className="col-span-2 font-mono">
                          ID interno: {selectedVectorStore.id}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border p-4 space-y-3">
                        <div>
                          <h4 className="text-[13px] font-medium text-text-primary">
                            Agregar documento
                          </h4>
                          <p className="text-[11px] text-text-secondary">
                          Filtra por tipo y usa texto o una expresión regular para buscar por nombre.
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          Los documentos ya incluidos no se muestran.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={documentTypeFilter}
                            onChange={(e) =>
                              setDocumentTypeFilter(e.target.value)
                            }
                            className="h-9 rounded-md border border-border bg-background px-2 text-[12px]"
                          >
                            <option value="all">Todos los tipos</option>
                            {[
                              "Taxonomía",
                              "Modus operandi",
                              "Yellow flag",
                              "Red flag",
                              "Caso similar",
                            ].map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                          <input
                            value={documentSearch}
                            onChange={(e) => setDocumentSearch(e.target.value)}
                            placeholder="Nombre o expresión regular"
                            className="min-w-0 flex-1 h-9 rounded-md border border-border px-3 text-[12px]"
                          />
                        </div>
                        {documentAdditionError && !pendingDocumentAddition && (
                          <p className="text-[11px] text-danger">
                            {documentAdditionError}
                          </p>
                        )}
                        <div className="max-h-64 overflow-auto rounded-md border border-border">
                          <table className="w-full text-left text-[12px]">
                            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-text-secondary">
                              <tr>
                                <th className="px-3 py-2 font-medium">Tipo</th>
                                <th className="px-3 py-2 font-medium">
                                  Documento
                                </th>
                                <th className="w-14 px-3 py-2">
                                  <span className="sr-only">Agregar</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {documentsToAddPage.pageItems.map((document) => {
                                const isLoading = isPreviewingDocumentAddition;
                                const actionLabel = isLoading
                                  ? `Calculando impacto de ${document.name}`
                                  : `Agregar ${document.name} a la instancia`;
                                return (
                                  <tr key={document.key}>
                                    <td className="px-3 py-2 text-[10px] uppercase text-text-secondary">
                                      {document.type}
                                    </td>
                                    <td className="px-3 py-2 text-text-primary">
                                      {document.name}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        disabled={isPreviewingDocumentAddition}
                                        aria-label={actionLabel}
                                        title={actionLabel}
                                        onClick={() =>
                                          openDocumentAdditionConfirmation(
                                            selectedVectorStore.id,
                                            document.assetType,
                                            document.entry.id,
                                          )
                                        }
                                        className="rounded-md border border-primary p-1.5 text-primary disabled:border-border disabled:text-text-secondary"
                                      >
                                        {isLoading ? (
                                          <LoaderCircle
                                            className="h-3.5 w-3.5 animate-spin"
                                            aria-hidden="true"
                                          />
                                        ) : (
                                          <Plus
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {filteredVectorStoreDocuments.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={3}
                                    className="px-3 py-5 text-center text-text-secondary"
                                  >
                                    No hay documentos disponibles para agregar.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <PaginationFooter
                          page={documentsToAddPage.page}
                          pageCount={documentsToAddPage.pageCount}
                          total={documentsToAddPage.total}
                          pageSize={documentsToAddPage.pageSize}
                          onPageChange={documentsToAddPage.setPage}
                          itemLabel="documento disponible"
                        />
                      </div>
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-[13px] font-medium text-text-primary">
                            Documentos de esta instancia
                          </h4>
                          <p className="text-[11px] text-text-secondary">
                            Árbol de pertenencia: taxonomía → modus operandi →
                            detalles y documentos asociados.
                          </p>
                        </div>
                        <div className="max-h-[34rem] overflow-auto rounded-lg border border-border">
                          <table className="w-full min-w-[720px] text-left text-[12px]">
                            <caption className="caption-top px-3 py-2 text-left text-[11px] font-medium text-text-secondary">
                              Documentos incluidos en la instancia
                            </caption>
                            <thead className="sticky top-0 z-10 bg-card text-[10px] uppercase tracking-wider text-text-secondary">
                              <tr>
                                <th className="px-3 py-2 font-medium">
                                  Jerarquía
                                </th>
                                <th className="px-3 py-2 font-medium">Tipo</th>
                                <th className="px-3 py-2 font-medium">
                                  Detalle / documentos anidados
                                </th>
                                <th className="px-3 py-2 font-medium">
                                  Versión
                                </th>
                                <th className="w-14 px-3 py-2">
                                  <span className="sr-only">Acciones</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {instanceTaxonomiesPage.pageItems.map((taxonomy) => {
                                  const taxonomyRelation = relationForDocument(`taxonomy:${taxonomy.id}`);
                                  const relation = taxonomyRelation ?? { relation_id: "", asset_type: "taxonomy" as const, asset_id: taxonomy.id, asset_version: 0 };
                                  const documentName = taxonomy.name;
                                  const expanded = expandedTaxonomies.has(taxonomy.id);
                                  const modusOperandiChildren = modusOperandi.filter((item) => item.taxonomy_library_id === taxonomy.id && (
                                    relationForDocument(`modus_operandi:${item.id}`) ||
                                    flags.some((flag) => flag.modus_operandi_library_ids.includes(item.id) && relationForDocument(`${flag.flag_type}_flag:${flag.id}`)) ||
                                    similarCases.some((similarCase) => similarCase.modus_operandi_library_id === item.id && relationForDocument(`similar_case:${similarCase.id}`))
                                  ));
                                  return (
                                    <Fragment key={relation.relation_id}>
                                      <tr
                                        key={relation.relation_id}
                                        className="align-top hover:bg-surface"
                                      >
                                        <td className="px-3 py-2">
                                          <div
                                            className="flex items-center gap-1"
                                            style={{
                                              paddingLeft:
                                                relation.asset_type ===
                                                "taxonomy"
                                                  ? 0
                                                  : relation.asset_type ===
                                                      "modus_operandi"
                                                    ? 20
                                                    : 40,
                                            }}
                                          >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                  toggleExpanded(
                                                    setExpandedTaxonomies,
                                                    taxonomy.id,
                                                  )
                                                }
                                                aria-expanded={expanded}
                                                aria-label={`${expanded ? "Contraer" : "Expandir"} ${documentName}`}
                                                className="rounded p-1 hover:bg-primary-light"
                                              >
                                                <ChevronRight
                                                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                                                />
                                              </button>
                                            <span className="font-medium text-text-primary">
                                              {documentName}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-text-secondary">
                                          Taxonomía
                                        </td>
                                        <td className="px-3 py-2 text-text-secondary">
                                          {taxonomy.description || "Sin descripción."}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-text-secondary">
                                          v{relation.asset_version}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          {taxonomyRelation && <button
                                            type="button"
                                            aria-label={`Quitar ${documentName} de la instancia`}
                                            title="Quitar de la instancia"
                                            onClick={() =>
                                              removeVectorStoreDocument(
                                                selectedVectorStore.id,
                                                relation.relation_id,
                                              )
                                            }
                                            className="rounded p-1.5 text-danger hover:bg-danger/10"
                                          >
                                            <Trash2
                                              className="h-3.5 w-3.5"
                                              aria-hidden="true"
                                            />
                                          </button>}
                                        </td>
                                      </tr>
                                      {expanded && modusOperandiChildren.map((child) => {
                                          const childExpanded = expandedModusOperandi.has(child.id);
                                          const childDocuments = [
                                            ...flags.filter((item) => item.modus_operandi_library_ids.includes(child.id) && relationForDocument(`${item.flag_type}_flag:${item.id}`)).map((item) => ({ key: `${item.flag_type}_flag:${item.id}`, label: item.name, type: `${item.flag_type === "red" ? "Red" : "Yellow"} flag` })),
                                            ...similarCases.filter((item) => item.modus_operandi_library_id === child.id && relationForDocument(`similar_case:${item.id}`)).map((item) => ({ key: `similar_case:${item.id}`, label: item.text, type: "Caso similar" })),
                                          ];
                                          return <Fragment key={`mo:${child.id}`}><tr className="bg-surface/50">
                                            <td className="px-3 py-2">
                                              <div className="flex items-center gap-1 pl-5">
                                                <button type="button" onClick={() => toggleExpanded(setExpandedModusOperandi, child.id)} aria-expanded={childExpanded} aria-label={`${childExpanded ? "Contraer" : "Expandir"} ${child.title}`} className="rounded p-1 hover:bg-primary-light"><ChevronRight className={`h-3.5 w-3.5 text-text-secondary transition-transform ${childExpanded ? "rotate-90" : ""}`} /></button>
                                                <span className="font-medium text-text-primary">
                                                  {child.title}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-2 text-text-secondary">
                                              Modus operandi
                                            </td>
                                            <td className="px-3 py-2 text-text-secondary">
                                              {child.narrative}
                                            </td>
                                            <td className="px-3 py-2 text-text-secondary">Abre para ver detalles y documentos.</td>
                                            <td className="px-3 py-2 text-right">{relationForDocument(`modus_operandi:${child.id}`) && <button type="button" aria-label={`Quitar ${child.title} de la instancia`} title="Quitar de la instancia" onClick={() => removeVectorStoreDocument(selectedVectorStore.id, relationForDocument(`modus_operandi:${child.id}`)!.relation_id)} className="rounded p-1.5 text-danger hover:bg-danger/10"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}</td>
                                          </tr>{childExpanded && <tr className="bg-surface/50"><td colSpan={5} className="px-10 py-3"><p className="mb-2 text-[11px] font-medium text-text-primary">Detalles del modus operandi</p><p className="mb-3 text-text-secondary">{child.narrative || "Sin descripción."}</p><div className="flex flex-wrap gap-2">{childDocuments.length ? childDocuments.map((item) => <span key={item.key} className="rounded-full border border-border bg-card px-2 py-1 text-[11px] text-text-secondary"><span className="mr-1 uppercase text-[9px]">{item.type}</span>{item.label}</span>) : <span className="text-[11px] text-text-secondary">Sin red flags, yellow flags ni casos similares incluidos.</span>}</div></td></tr>}</Fragment>;
                                        })}
                                    </Fragment>
                                  );
                                },
                              )}
                              {vectorStoreRelations.length === 0 && (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-3 py-5 text-center text-text-secondary"
                                  >
                                    Aún no hay documentos relacionados.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <PaginationFooter
                          page={instanceTaxonomiesPage.page}
                          pageCount={instanceTaxonomiesPage.pageCount}
                          total={instanceTaxonomiesPage.total}
                          pageSize={instanceTaxonomiesPage.pageSize}
                          onPageChange={instanceTaxonomiesPage.setPage}
                          itemLabel="taxonomía de la instancia"
                        />
                      </div>
                    </div>
                  )}
                  <ConfirmVectorStoreDocumentsDialog
                    open={!!pendingDocumentAddition}
                    onOpenChange={(open) => {
                      if (!open && !isAddingDocument) {
                        setPendingDocumentAddition(null);
                        setDocumentAdditionError(null);
                      }
                    }}
                    documents={pendingImpactDocuments}
                    onConfirm={confirmDocumentAddition}
                    pending={isAddingDocument}
                    error={documentAdditionError ?? undefined}
                  />
                </div>
              </section>
            )}

            {/* Taxonomías */}
            {activeKnowledgeTab === "taxonomias" && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary">
                      Taxonomías de fraude
                    </h2>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      Categorías abstractas de fraude, disponibles para
                      cualquier segmento.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingTax({
                        code: createId(),
                        name: "",
                        description: "",
                        variables: [],
                        examples: [],
                      });
                      setShowTaxForm(true);
                    }}
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" /> Nueva taxonomía
                  </button>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-text-secondary text-left border-b border-border">
                      <th className="px-6 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Descripción</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxonomiesPage.pageItems.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-border last:border-0 hover:bg-surface align-top"
                      >
                        <td className="px-6 py-3 font-medium text-text-primary">
                          {t.name}
                        </td>
                        <td className="px-3 py-3 text-text-secondary max-w-xs truncate">
                          {t.description}
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => toggleTaxActive.mutate(t)}
                            className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}
                          >
                            {t.active ? "Activa" : "Inactiva"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Editar taxonomía ${t.name}`}
                              title="Editar taxonomía"
                              onClick={() => {
                                setEditingTax({ ...t });
                                setShowTaxForm(true);
                              }}
                              className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar taxonomía ${t.name}`}
                              title="Eliminar taxonomía"
                              onClick={() => setDeletingTax(t)}
                              className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {taxonomies.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-6 py-8 text-center text-text-secondary"
                        >
                          Sin taxonomías en la biblioteca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <PaginationFooter
                  page={taxonomiesPage.page}
                  pageCount={taxonomiesPage.pageCount}
                  total={taxonomiesPage.total}
                  pageSize={taxonomiesPage.pageSize}
                  onPageChange={taxonomiesPage.setPage}
                  itemLabel="taxonomía"
                />
              </section>
            )}

            {/* Modus operandi */}
            {activeKnowledgeTab === "modus-operandi" && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary">
                      Modus operandi
                    </h2>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      Casos concretos que aplican una taxonomía.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingMO({
                        title: "",
                        narrative: "",
                        taxonomy_library_id: taxonomies[0]?.id ?? "",
                        evolved_variables: [],
                      });
                      setShowMOForm(true);
                    }}
                    disabled={taxonomies.length === 0}
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" /> Nuevo modus operandi
                  </button>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-text-secondary text-left border-b border-border">
                      <th className="px-6 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Descripción</th>
                      <th className="px-3 py-2 font-medium">Taxonomía</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modusOperandiPage.pageItems.map((m) => {
                      const tax = taxonomies.find(
                        (t) => t.id === m.taxonomy_library_id,
                      );
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-border last:border-0 hover:bg-surface align-top"
                        >
                          <td className="px-6 py-3 font-medium text-text-primary">
                            {m.title}
                          </td>
                          <td className="px-3 py-3 text-text-secondary max-w-xs truncate">
                            {m.narrative}
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">
                              {tax ? tax.name : "Taxonomía eliminada"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => toggleMOActive.mutate(m)}
                              className={`text-[11px] uppercase tracking-wider ${m.active ? "text-success" : "text-text-secondary"}`}
                            >
                              {m.active ? "Activo" : "Inactivo"}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Editar modus operandi ${m.title}`}
                                title="Editar modus operandi"
                                onClick={() => {
                                  setEditingMO({ ...m });
                                  setShowMOForm(true);
                                }}
                                className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled
                                aria-label={`Eliminar modus operandi ${m.title}`}
                                title="Los modus operandi se retiran mediante la eliminación recursiva de su taxonomía."
                                className="p-1.5 rounded text-text-secondary opacity-40 cursor-not-allowed"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {modusOperandi.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-text-secondary"
                        >
                          Sin modus operandi en la biblioteca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <PaginationFooter
                  page={modusOperandiPage.page}
                  pageCount={modusOperandiPage.pageCount}
                  total={modusOperandiPage.total}
                  pageSize={modusOperandiPage.pageSize}
                  onPageChange={modusOperandiPage.setPage}
                  itemLabel="modus operandi"
                />
              </section>
            )}

            {/* Flags */}
            {(activeKnowledgeTab === "red-flags" ||
              activeKnowledgeTab === "yellow-flags") && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary">
                      {activeKnowledgeTab === "red-flags"
                        ? "Red flags"
                        : "Yellow flags"}
                    </h2>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      Comportamientos asociables a uno o varios modus operandi.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditingFlag({
                        flag_type: "red",
                        name: "",
                        description: "",
                        evolved_variables: [],
                        modus_operandi_library_ids: [],
                      });
                      setShowFlagForm(true);
                    }}
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" /> Nueva flag
                  </button>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-text-secondary text-left border-b border-border">
                      <th className="px-6 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 font-medium">Descripción</th>
                      <th className="px-3 py-2 font-medium">
                        Modus operandi asociados
                      </th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagsPage.pageItems.map((f) => (
                      <tr
                        key={f.id}
                        className="border-b border-border last:border-0 hover:bg-surface align-top"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${FLAG_TYPE_STYLES[f.flag_type]}`}
                            >
                              {FLAG_TYPE_LABELS[f.flag_type]}
                            </span>
                            <p className="font-medium text-text-primary">
                              {f.name}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-text-secondary max-w-xs truncate">
                          {f.description}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {f.modus_operandi_library_ids.map((mid) => {
                              const mo = modusOperandi.find(
                                (m) => m.id === mid,
                              );
                              return (
                                <span
                                  key={mid}
                                  className="px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary text-[11px]"
                                >
                                  {mo ? mo.title : "MO eliminado"}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => toggleFlagActive.mutate(f)}
                            className={`text-[11px] uppercase tracking-wider ${f.active ? "text-success" : "text-text-secondary"}`}
                          >
                            {f.active ? "Activa" : "Inactiva"}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Editar flag ${f.name}`}
                              title="Editar flag"
                              onClick={() => {
                                setEditingFlag({ ...f });
                                setShowFlagForm(true);
                              }}
                              className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled
                              aria-label={`Eliminar flag ${f.name}`}
                              title="Las flags se retiran mediante la eliminación recursiva de su taxonomía."
                              className="p-1.5 rounded text-text-secondary opacity-40 cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleFlags.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-text-secondary"
                        >
                          Sin flags en la biblioteca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <PaginationFooter
                  page={flagsPage.page}
                  pageCount={flagsPage.pageCount}
                  total={flagsPage.total}
                  pageSize={flagsPage.pageSize}
                  onPageChange={flagsPage.setPage}
                  itemLabel="flag"
                />
              </section>
            )}

            {/* Casos similares */}
            {activeKnowledgeTab === "casos-similares" && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary">
                      Casos similares
                    </h3>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      Ejemplos, en texto libre, de cómo se manifiesta un modus
                      operandi.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const firstMO = modusOperandi[0];
                      setEditingCase({
                        text: "",
                        modus_operandi_library_id: firstMO?.id ?? "",
                        taxonomy_library_id: firstMO?.taxonomy_library_id ?? "",
                      });
                      setShowCaseForm(true);
                    }}
                    disabled={modusOperandi.length === 0}
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" /> Nuevo caso
                  </button>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-text-secondary text-left border-b border-border">
                      <th className="px-6 py-2 font-medium">Caso</th>
                      <th className="px-3 py-2 font-medium">Modus operandi</th>
                      <th className="px-3 py-2 font-medium">Taxonomía</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {similarCasesPage.pageItems.map((c) => {
                      const mo = modusOperandi.find(
                        (m) => m.id === c.modus_operandi_library_id,
                      );
                      const tax = taxonomies.find(
                        (t) => t.id === c.taxonomy_library_id,
                      );
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-border last:border-0 hover:bg-surface align-top"
                        >
                          <td className="px-6 py-3 text-text-primary max-w-md truncate">
                            {c.text}
                          </td>
                          <td className="px-3 py-3 text-text-secondary">
                            {mo ? mo.title : "Modus operandi eliminado"}
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">
                              {tax?.name ?? "Taxonomía eliminada"}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => toggleCaseActive.mutate(c)}
                              className={`text-[11px] uppercase tracking-wider ${c.active ? "text-success" : "text-text-secondary"}`}
                            >
                              {c.active ? "Activo" : "Inactivo"}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Editar caso similar ${c.text}`}
                                title="Editar caso similar"
                                onClick={() => {
                                  setEditingCase({ ...c });
                                  setShowCaseForm(true);
                                }}
                                className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled
                                aria-label={`Eliminar caso similar ${c.text}`}
                                title="Los casos similares se retiran mediante la eliminación recursiva de su taxonomía."
                                className="p-1.5 rounded text-text-secondary opacity-40 cursor-not-allowed"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {similarCases.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-text-secondary"
                        >
                          Sin casos similares en la biblioteca.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <PaginationFooter
                  page={similarCasesPage.page}
                  pageCount={similarCasesPage.pageCount}
                  total={similarCasesPage.total}
                  pageSize={similarCasesPage.pageSize}
                  onPageChange={similarCasesPage.setPage}
                  itemLabel="caso"
                />
              </section>
            )}
          </>
        )}

        {/* Taxonomy modal */}
        {showTaxForm && editingTax && (
          <div
            className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowTaxForm(false)}
          >
            <div
              className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {editingTax.id ? "Editar taxonomía" : "Nueva taxonomía"}
                </h3>
                <button
                  onClick={() => setShowTaxForm(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Nombre">
                  <input
                    value={editingTax.name ?? ""}
                    onChange={(e) =>
                      setEditingTax({ ...editingTax, name: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                    placeholder="Fraude con tarjeta"
                  />
                </Field>
                <Field label="Descripción">
                  <textarea
                    value={editingTax.description ?? ""}
                    onChange={(e) =>
                      setEditingTax({
                        ...editingTax,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  />
                </Field>
                <Field label="Variables">
                  <VariablePicker
                    value={editingTax.variables ?? []}
                    onChange={(variables) =>
                      setEditingTax({ ...editingTax, variables })
                    }
                  />
                </Field>
                <Field
                  label="Ejemplos (opcional)"
                  hint="Presiona Enter o coma para agregar cada uno."
                >
                  <TagInput
                    value={editingTax.examples ?? []}
                    onChange={(examples) =>
                      setEditingTax({ ...editingTax, examples })
                    }
                  />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowTaxForm(false)}
                  className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveTaxMutation.mutate(editingTax)}
                  disabled={
                    !editingTax.name?.trim() ||
                    saveTaxMutation.isPending
                  }
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTax.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MO modal */}
        {showMOForm && editingMO && (
          <div
            className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowMOForm(false)}
          >
            <div
              className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {editingMO.id
                    ? "Editar modus operandi"
                    : "Nuevo modus operandi"}
                </h3>
                <button
                  onClick={() => setShowMOForm(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <Field
                  label="Nombre del caso"
                  hint="Este nombre se utiliza para encontrar el modus operandi en las búsquedas."
                >
                  <input
                    value={editingMO.title ?? ""}
                    onChange={(e) =>
                      setEditingMO({ ...editingMO, title: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                  />
                </Field>
                <Field
                  label="Descripción del caso"
                  hint="Esta descripción se utiliza como contenido de búsqueda del activo."
                >
                  <textarea
                    value={editingMO.narrative ?? ""}
                    onChange={(e) =>
                      setEditingMO({ ...editingMO, narrative: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  />
                </Field>
                <Field label="Taxonomía">
                  <select
                    value={editingMO.taxonomy_library_id ?? ""}
                    onChange={(e) =>
                      setEditingMO({
                        ...editingMO,
                        taxonomy_library_id: e.target.value,
                      })
                    }
                    disabled={!!editingMO.id}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                  >
                    <option value="" disabled>
                      Selecciona una taxonomía
                    </option>
                    {taxonomies.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {editingMO.id && (
                    <p className="mt-1 text-[11px] text-text-secondary">
                      La taxonomía padre es inmutable; crea una copia para
                      cambiarla.
                    </p>
                  )}
                </Field>
                <Field label="Variables evolucionadas">
                  <VariablePicker
                    value={editingMO.evolved_variables ?? []}
                    onChange={(evolved_variables) =>
                      setEditingMO({ ...editingMO, evolved_variables })
                    }
                  />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowMOForm(false)}
                  className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveMOMutation.mutate(editingMO)}
                  disabled={
                    !editingMO.title?.trim() ||
                    !editingMO.narrative?.trim() ||
                    !editingMO.taxonomy_library_id ||
                    saveMOMutation.isPending
                  }
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingMO.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Flag modal */}
        {showFlagForm && editingFlag && (
          <div
            className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowFlagForm(false)}
          >
            <div
              className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {editingFlag.id ? "Editar flag" : "Nueva flag"}
                </h3>
                <button
                  onClick={() => setShowFlagForm(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Tipo">
                  <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
                    {(["red", "yellow"] as FlagTypeValue[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setEditingFlag({ ...editingFlag, flag_type: t })
                        }
                        className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${editingFlag.flag_type === t ? FLAG_TYPE_STYLES[t] + " border" : "text-text-secondary hover:text-text-primary"}`}
                      >
                        {FLAG_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field
                  label="Nombre"
                  hint="El nombre se usa para buscar esta flag en la base de conocimiento."
                >
                  <input
                    value={editingFlag.name ?? ""}
                    onChange={(e) =>
                      setEditingFlag({ ...editingFlag, name: e.target.value })
                    }
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                  />
                </Field>
                <Field
                  label="Descripción del comportamiento"
                  hint="La descripción se utiliza para búsquedas por texto y semánticas."
                >
                  <textarea
                    value={editingFlag.description ?? ""}
                    onChange={(e) =>
                      setEditingFlag({
                        ...editingFlag,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  />
                </Field>
                <Field label="Variables evolucionadas">
                  <VariablePicker
                    value={editingFlag.evolved_variables ?? []}
                    onChange={(evolved_variables) =>
                      setEditingFlag({ ...editingFlag, evolved_variables })
                    }
                  />
                </Field>
                <Field label="Modus operandi asociados">
                  {editingFlag.id && (
                    <p className="mb-1 text-[11px] text-text-secondary">
                      Las asociaciones son inmutables para preservar las
                      instancias; crea una copia para variarlas.
                    </p>
                  )}
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {modusOperandi.length === 0 && (
                      <p className="px-3 py-4 text-[12px] text-text-secondary text-center">
                        Sin modus operandi disponibles.
                      </p>
                    )}
                    {modusOperandi.map((m) => {
                      const ids = editingFlag.modus_operandi_library_ids ?? [];
                      const checked = ids.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 px-3 py-2 text-[13px] text-text-primary cursor-pointer hover:bg-surface"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!!editingFlag.id}
                            onChange={() =>
                              setEditingFlag({
                                ...editingFlag,
                                modus_operandi_library_ids: checked
                                  ? ids.filter((id) => id !== m.id)
                                  : [...ids, m.id],
                              })
                            }
                          />
                          {m.title}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowFlagForm(false)}
                  className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveFlagMutation.mutate(editingFlag)}
                  disabled={
                    !editingFlag.name?.trim() || saveFlagMutation.isPending
                  }
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingFlag.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Similar case modal */}
        {showCaseForm && editingCase && (
          <div
            className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowCaseForm(false)}
          >
            <div
              className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">
                  {editingCase.id
                    ? "Editar caso similar"
                    : "Nuevo caso similar"}
                </h3>
                <button
                  onClick={() => setShowCaseForm(false)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Taxonomía">
                  <select
                    value={editingCase.taxonomy_library_id ?? ""}
                    onChange={(e) => {
                      const taxonomy_library_id = e.target.value;
                      const firstMO =
                        modusOperandiForTaxonomy(taxonomy_library_id)[0];
                      setEditingCase({
                        ...editingCase,
                        taxonomy_library_id,
                        modus_operandi_library_id: firstMO?.id ?? "",
                      });
                    }}
                    disabled={!!editingCase.id}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                  >
                    {taxonomies.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Modus operandi">
                  <select
                    value={editingCase.modus_operandi_library_id ?? ""}
                    onChange={(e) =>
                      setEditingCase({
                        ...editingCase,
                        modus_operandi_library_id: e.target.value,
                      })
                    }
                    disabled={!!editingCase.id}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                  >
                    <option value="" disabled>
                      Selecciona un modus operandi
                    </option>
                    {modusOperandiForTaxonomy(
                      editingCase.taxonomy_library_id,
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                  {editingCase.id && (
                    <p className="mt-1 text-[11px] text-text-secondary">
                      Los padres del caso son inmutables; crea una copia para
                      cambiar la relación.
                    </p>
                  )}
                </Field>
                <Field
                  label="Descripción del caso"
                  hint="Este texto es el nombre y contenido con el que se buscará el caso similar."
                >
                  <textarea
                    value={editingCase.text ?? ""}
                    onChange={(e) =>
                      setEditingCase({ ...editingCase, text: e.target.value })
                    }
                    rows={4}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={() => setShowCaseForm(false)}
                  className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveCaseMutation.mutate(editingCase)}
                  disabled={
                    !editingCase.text?.trim() ||
                    !editingCase.modus_operandi_library_id ||
                    saveCaseMutation.isPending
                  }
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingCase.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDeleteDialog
          open={!!deletingChannel}
          onOpenChange={(open) => !open && setDeletingChannel(null)}
          itemName={`canal "${deletingChannel?.name ?? ""}"`}
          consequence="Su código interno es la llave de segments[code]; las configuraciones que lo usan como segmento quedan huérfanas."
          pending={deleteChannelMutation.isPending}
          onConfirm={() =>
            deletingChannel && deleteChannelMutation.mutate(deletingChannel.id)
          }
        />
        <ConfirmDeleteDialog
          open={!!deletingTax}
          onOpenChange={(open) => !open && setDeletingTax(null)}
          itemName={`taxonomía "${deletingTax?.name ?? ""}"`}
          consequence="Los modus operandi que la referencian por taxonomy_id quedan colgando."
          pending={deleteTaxMutation.isPending}
          onConfirm={() =>
            deletingTax && deleteTaxMutation.mutate(deletingTax.id)
          }
        />
        <ConfirmDeleteDialog
          open={!!deletingMO}
          onOpenChange={(open) => !open && setDeletingMO(null)}
          itemName={`modus operandi "${deletingMO?.title ?? ""}"`}
          consequence="Las flags que lo listan en modus_operandi_ids quedan colgando."
          pending={deleteMOMutation.isPending}
          onConfirm={() => deletingMO && deleteMOMutation.mutate(deletingMO.id)}
        />
        <ConfirmDeleteDialog
          open={!!deletingFlag}
          onOpenChange={(open) => !open && setDeletingFlag(null)}
          itemName={`flag "${deletingFlag?.name ?? ""}"`}
          consequence="Se eliminará de la biblioteca global de forma permanente."
          pending={deleteFlagMutation.isPending}
          onConfirm={() =>
            deletingFlag && deleteFlagMutation.mutate(deletingFlag.id)
          }
        />
        <ConfirmDeleteDialog
          open={!!deletingCase}
          onOpenChange={(open) => !open && setDeletingCase(null)}
          itemName="caso similar"
          consequence="Se eliminará de la biblioteca global de forma permanente."
          pending={deleteCaseMutation.isPending}
          onConfirm={() =>
            deletingCase && deleteCaseMutation.mutate(deletingCase.id)
          }
        />
      </div>
    </DashboardLayout>
  );
}

/* ─── One event-catalog entity (Punto de integración / Regla disparada /
   Tipo de evento) - own query, own list, own add/toggle/delete, rendered
   inline like Taxonomías/Canales above (not a shared "Gestionar" button
   hiding all 3 behind one dialog - each entity gets its own visible list
   with the actions that fit it: add a value, deactivate, delete). */

function EventCatalogSection({ category }: { category: TagCategory }) {
  const queryClient = useQueryClient();
  const tagsQuery = useQuery({
    queryKey: ["tags", category],
    queryFn: () => listTags({ data: { category, activeOnly: false } }),
  });
  const tags = tagsQuery.data ?? [];
  const tagsPage = usePagination(tags, 10);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["tags", category] });

  const [newValue, setNewValue] = useState("");
  const [deletingTag, setDeletingTag] = useState<TagEntryResponse | null>(null);
  const createMutation = useMutation({
    mutationFn: (value: string) => createTag({ data: { category, value } }),
    onSuccess: () => {
      setNewValue("");
      invalidate();
    },
  });
  const toggleActiveMutation = useMutation({
    mutationFn: (tag: TagEntryResponse) =>
      updateTag({ data: { category, tagId: tag.id, active: !tag.active } }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => deleteTag({ data: { category, tagId } }),
    onSuccess: () => {
      invalidate();
      setDeletingTag(null);
    },
  });

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">
            {TAG_CATEGORY_LABELS[category]}
          </h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Valores disponibles para este filtro. Un valor desactivado deja de
            aparecer al construir nuevas condiciones.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newValue.trim())
                createMutation.mutate(newValue.trim());
            }}
            placeholder={`Nuevo valor de ${TAG_CATEGORY_LABELS[category].toLowerCase()}…`}
            className="h-9 w-64 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() =>
              newValue.trim() && createMutation.mutate(newValue.trim())
            }
            disabled={!newValue.trim()}
            className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-secondary text-left border-b border-border">
            <th className="px-6 py-2 font-medium">Valor</th>
            <th className="px-3 py-2 font-medium w-28">Estado</th>
            <th className="px-3 py-2 font-medium w-16"></th>
          </tr>
        </thead>
        <tbody>
          {tagsPage.pageItems.map((t) => (
            <tr
              key={t.id}
              className="border-b border-border last:border-0 hover:bg-surface"
            >
              <td
                className={`px-6 py-3 ${t.active ? "text-text-primary" : "text-text-secondary line-through"}`}
              >
                {t.value}
              </td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => toggleActiveMutation.mutate(t)}
                  className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}
                >
                  {t.active ? "Activo" : "Inactivo"}
                </button>
              </td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  aria-label={`Eliminar valor ${t.value}`}
                  title="Eliminar valor"
                  onClick={() => setDeletingTag(t)}
                  className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {tags.length === 0 && (
            <tr>
              <td
                colSpan={3}
                className="px-6 py-8 text-center text-text-secondary"
              >
                Sin valores en {TAG_CATEGORY_LABELS[category].toLowerCase()}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PaginationFooter
        page={tagsPage.page}
        pageCount={tagsPage.pageCount}
        total={tagsPage.total}
        pageSize={tagsPage.pageSize}
        onPageChange={tagsPage.setPage}
        itemLabel="valor"
      />
      <ConfirmDeleteDialog
        open={!!deletingTag}
        onOpenChange={(open) => !open && setDeletingTag(null)}
        itemName={`valor "${deletingTag?.value ?? ""}"`}
        consequence="Si está en queue_allowed_triggered_rules o en condiciones de filtro de un segmento, esas referencias apuntan a un id inexistente."
        pending={deleteMutation.isPending}
        onConfirm={() => deletingTag && deleteMutation.mutate(deletingTag.id)}
      />
    </section>
  );
}
