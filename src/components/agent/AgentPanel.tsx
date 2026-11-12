import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggablePosition } from "@/hooks/useDraggablePosition";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  GripVertical,
  Check,
  ChevronDown,
  ArrowUpRight,
  Lightbulb,
  Pencil,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  changeAgentInsight,
  confirmFlagDraft,
  confirmModusOperandiDraft,
  confirmSimilarCaseDraft,
  confirmTaxonomyDraft,
  confirmWatchlistDraft,
  confirmResourceDraft,
  createAgentSession,
  generateFlagDraft,
  generateModusOperandiDraft,
  generateSimilarCaseDraft,
  generateTaxonomyDraft,
  generateWatchlistDraft,
  generateResourceDraft,
  listAgentDraftActions,
  getAgentSessionSummary,
  listAgentInsights,
  listAgentMessages,
  listAgentSessions,
  sendAgentMessage,
  type AgentInsight,
  type AgentMessage,
  type AgentSession,
  type AgentLibraryDraft,
} from "@/lib/api/agent.functions";
import {
  listFlagLibraryEntries,
  listModusOperandiLibraryEntries,
  listSimilarCaseLibraryEntries,
  listTaxonomyLibraryEntries,
} from "@/lib/api/knowledgeLibrary.functions";
import { listWatchlists } from "@/lib/api/watchlist.functions";
import type { Role } from "@/lib/api/auth.functions";
import { SideDrawer } from "@/components/ui/side-drawer";

const MESSAGE_LIMIT = 8_000;
const ALLOWED_ROUTES = ["/configuracion", "/testing", "/biblioteca", "/modelos"];
const PAGE_LABELS: Record<string, string> = {
  "/configuracion": "Configuración",
  "/testing": "Testing",
  "/biblioteca": "Biblioteca",
  "/modelos": "Modelos",
};

type PendingMessage = { id: string; content: string; failed: boolean };
type DraftKind =
  | "modus_operandi"
  | "flag"
  | "similar_case"
  | "taxonomy"
  | "watchlist"
  | "watchlist_element"
  | "channel"
  | "catalog_entry"
  | "dataset_empty";
type DraftRequest = {
  kind: DraftKind;
  clientMessageId: string;
  operation: "create" | "update" | "add_elements";
  targetId?: string;
  sourceMessageContent?: string;
};

function draftTitle(kind: DraftKind, content?: Record<string, unknown>) {
  if (kind === "modus_operandi") return "modus operandi";
  if (kind === "similar_case") return "caso similar";
  if (kind === "taxonomy") return "taxonomía";
  if (kind === "watchlist") return "watchlist";
  if (kind === "watchlist_element") return "elementos de watchlist";
  if (kind === "channel") return "canal";
  if (kind === "catalog_entry") return "catálogo de configuración";
  if (kind === "dataset_empty") return "dataset vacío";
  return content?.flag_type === "yellow" ? "yellow flag" : "red flag";
}

function newClientMessageId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `aria-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function safeError(error: unknown) {
  const text = error instanceof Error ? error.message : "No fue posible completar la solicitud.";
  if (text.includes("413") || text.includes("MESSAGE_TOO_LONG"))
    return "El mensaje supera el límite configurado.";
  if (text.includes("503") || text.includes("CHAT_UNAVAILABLE"))
    return "El chat no está disponible ahora. Puedes reintentar el mismo envío.";
  if (text.includes("ASSISTANT_DISABLED") || text.includes("SESSION_POLICY"))
    return "El asistente está desactivado o no admite esta sesión.";
  return "No se pudo completar la solicitud. Puedes reintentar o volver a cargar la sesión.";
}

function titleForSession(session: AgentSession) {
  const date = new Date(session.created_at);
  return `${session.mode === "assistant" ? "Asistente" : "Optimizador"} · ${date.toLocaleDateString("es-CO")}`;
}

// The assistant answers with light markdown; only **bold** is rendered, as
// text nodes (never HTML), so model output cannot inject markup.
function BoldText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*\n]+\*\*)/g)
        .map((part, index) =>
          part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
            <strong key={index}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </>
  );
}

function summaryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${summaryText(item)}`)
      .join("\n");
  return value == null ? "Sin resumen disponible." : String(value);
}

export function AgentPanel({
  permissions,
  role,
  hasBottomBar = false,
}: {
  permissions: string[];
  role?: Role;
  hasBottomBar?: boolean;
}) {
  const { location } = useRouterState();
  const queryClient = useQueryClient();
  const pathname = location.pathname;
  const permitted = permissions.includes("configuration");
  const visible =
    permitted &&
    ALLOWED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [composer, setComposer] = useState("");
  const [pending, setPending] = useState<PendingMessage[]>([]);
  // Turns the API stored (202) whose reply the worker has not written yet.
  const [awaiting, setAwaiting] = useState<string[]>([]);
  const [lastUserMessage, setLastUserMessage] = useState<AgentMessage | null>(null);
  const [lastUserMessageSource, setLastUserMessageSource] = useState("");
  const [draft, setDraft] = useState<AgentLibraryDraft | null>(null);
  const [draftKind, setDraftKind] = useState<DraftKind>("modus_operandi");
  const [operation, setOperation] = useState<"create" | "update" | "add_elements">("create");
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draftDrawerOpen, setDraftDrawerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const launcher = useDraggablePosition("agent-launcher", {
    right: 24,
    bottom: hasBottomBar ? 96 : 24,
  });
  const pageLabel =
    PAGE_LABELS[
      ALLOWED_ROUTES.find((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? ""
    ] ?? "ARIA";

  const sessionsQuery = useQuery({
    queryKey: ["agentSessions"],
    queryFn: listAgentSessions,
    enabled: visible,
    refetchInterval: 8_000,
  });
  const draftActionsQuery = useQuery({
    queryKey: ["agentDraftActions"],
    queryFn: listAgentDraftActions,
    enabled: open,
    staleTime: 60_000,
  });
  const sessions = sessionsQuery.data ?? [];
  const currentSession =
    sessions.find((item) => item.session_id === sessionId) ??
    (sessionId ? undefined : sessions.find((item) => item.mode === "assistant"));
  const activeSessionId = sessionId || currentSession?.session_id || "";
  useEffect(() => {
    if (activeSessionId && activeSessionId !== sessionId) setSessionId(activeSessionId);
  }, [activeSessionId, sessionId]);

  const messagesQuery = useQuery({
    queryKey: ["agentMessages", activeSessionId],
    queryFn: async () => {
      const key = ["agentMessages", activeSessionId];
      const current = queryClient.getQueryData<AgentMessage[]>(key) ?? [];
      const afterSeq = current.reduce((latest, message) => Math.max(latest, message.seq), 0);
      const next = await listAgentMessages(activeSessionId, afterSeq);
      const merged = new Map(current.map((message) => [message.message_id, message]));
      next.forEach((message) => merged.set(message.message_id, message));
      return [...merged.values()].sort((left, right) => left.seq - right.seq);
    },
    enabled: open && Boolean(activeSessionId),
    refetchInterval: awaiting.length > 0 ? 1_500 : 3_000,
  });
  const messages = messagesQuery.data;
  const unanswered = useMemo(() => {
    const answered = new Set((messages ?? []).map((message) => message.client_message_id));
    return awaiting.filter((id) => !answered.has(`${id}:assistant`));
  }, [awaiting, messages]);
  useEffect(() => {
    if (unanswered.length !== awaiting.length) setAwaiting(unanswered);
  }, [unanswered, awaiting.length]);
  const insightsQuery = useQuery({
    queryKey: ["agentInsights", activeSessionId],
    queryFn: () => listAgentInsights(activeSessionId),
    enabled: open && Boolean(activeSessionId),
    refetchInterval: 5_000,
  });
  const summaryQuery = useQuery({
    queryKey: ["agentSummary", activeSessionId],
    queryFn: () => getAgentSessionSummary(activeSessionId),
    enabled: open && Boolean(activeSessionId),
    refetchInterval: 10_000,
  });
  const libraryQuery = useQuery({
    queryKey: ["modusOperandiEntries", false],
    queryFn: () => listModusOperandiLibraryEntries({ data: { activeOnly: false } }),
    enabled: open && draftKind === "modus_operandi" && operation === "update",
  });
  const flagLibraryQuery = useQuery({
    queryKey: ["flagEntries", false],
    queryFn: () => listFlagLibraryEntries({ data: { activeOnly: false } }),
    enabled: open && draftKind === "flag" && operation === "update",
  });
  const similarCaseLibraryQuery = useQuery({
    queryKey: ["similarCaseEntries", false],
    queryFn: () => listSimilarCaseLibraryEntries({ data: { activeOnly: false } }),
    enabled: open && draftKind === "similar_case" && operation === "update",
  });
  const taxonomyLibraryQuery = useQuery({
    queryKey: ["taxonomyEntries", false],
    queryFn: () => listTaxonomyLibraryEntries({ data: { activeOnly: false } }),
    enabled: open && draftKind === "taxonomy" && operation === "update",
  });
  const watchlistQuery = useQuery({
    queryKey: ["watchlists", false],
    queryFn: () => listWatchlists({ data: { activeOnly: false } }),
    enabled:
      open &&
      ((draftKind === "watchlist" && operation === "update") || draftKind === "watchlist_element"),
  });
  const displayedMessages = useMemo(() => {
    const rows = [...(messages ?? [])];
    for (const item of pending) {
      if (!rows.some((message) => message.client_message_id === item.id)) {
        rows.push({
          message_id: item.id,
          client_message_id: item.id,
          seq: Number.MAX_SAFE_INTEGER,
          role: "user",
          content: item.content,
          created_at: new Date().toISOString(),
          redaction_counts: {},
          extracted_insight_ids: [],
        });
      }
    }
    return rows.sort((left, right) => left.seq - right.seq);
  }, [messages, pending]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [displayedMessages.length, open]);

  const createSession = useMutation({
    mutationFn: () => createAgentSession("assistant"),
    onSuccess: async (session) => {
      setSessionId(session.session_id);
      setPending([]);
      setLastUserMessage(null);
      setLastUserMessageSource("");
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["agentSessions"] });
      setNotice("");
    },
    onError: (error) => setNotice(safeError(error)),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      sendAgentMessage(activeSessionId, id, content, pathname),
    onSuccess: async (turn, variables) => {
      setLastUserMessage(turn.user_message);
      setLastUserMessageSource(variables.content);
      setPending((items) => items.filter((item) => item.id !== variables.id));
      if (!turn.assistant_message) {
        setAwaiting((ids) => (ids.includes(variables.id) ? ids : [...ids, variables.id]));
      }
      queryClient.setQueryData<AgentMessage[]>(
        ["agentMessages", activeSessionId],
        (current = []) => {
          const merged = new Map(current.map((message) => [message.message_id, message]));
          merged.set(turn.user_message.message_id, turn.user_message);
          if (turn.assistant_message)
            merged.set(turn.assistant_message.message_id, turn.assistant_message);
          return [...merged.values()].sort((left, right) => left.seq - right.seq);
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agentMessages", activeSessionId] }),
        queryClient.invalidateQueries({ queryKey: ["agentInsights", activeSessionId] }),
        queryClient.invalidateQueries({ queryKey: ["agentSummary", activeSessionId] }),
      ]);
      setNotice("");
    },
    onError: (error, variables) => {
      setPending((items) =>
        items.map((item) => (item.id === variables.id ? { ...item, failed: true } : item)),
      );
      setNotice(safeError(error));
    },
  });

  const submitMessage = (retry?: PendingMessage) => {
    if (!activeSessionId || sendMutation.isPending) return;
    const content = retry?.content ?? composer.trim();
    if (!content || content.length > MESSAGE_LIMIT) return;
    const id = retry?.id ?? newClientMessageId();
    if (!retry) {
      setPending((items) => [...items, { id, content, failed: false }]);
      setComposer("");
    } else {
      setPending((items) =>
        items.map((item) => (item.id === id ? { ...item, failed: false } : item)),
      );
    }
    sendMutation.mutate({ id, content });
  };

  // A turn that ended in error is closed for good, so a retry is a new message.
  const resendAsNewMessage = (content: string) => {
    if (!activeSessionId || sendMutation.isPending) return;
    const id = newClientMessageId();
    setPending((items) => [...items, { id, content, failed: false }]);
    sendMutation.mutate({ id, content });
  };

  const insightMutation = useMutation({
    mutationFn: ({ insightId, action }: { insightId: string; action: "confirm" | "reject" }) =>
      changeAgentInsight(activeSessionId, insightId, action),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["agentInsights", activeSessionId] }),
    onError: (error) => setNotice(safeError(error)),
  });

  const draftMutation = useMutation({
    mutationFn: ({
      kind,
      clientMessageId,
      operation: draftOperation,
      targetId: draftTargetId,
      sourceMessageContent,
    }: DraftRequest) => {
      if (kind === "flag")
        return generateFlagDraft(activeSessionId, clientMessageId, draftOperation, draftTargetId);
      if (kind === "similar_case")
        return generateSimilarCaseDraft(
          activeSessionId,
          clientMessageId,
          draftOperation,
          draftTargetId,
        );
      if (kind === "taxonomy")
        return generateTaxonomyDraft(
          activeSessionId,
          clientMessageId,
          draftOperation,
          draftTargetId,
        );
      if (kind === "watchlist")
        return generateWatchlistDraft(
          activeSessionId,
          clientMessageId,
          draftOperation,
          draftTargetId,
        );
      if (kind === "watchlist_element")
        return generateWatchlistDraft(
          activeSessionId,
          clientMessageId,
          "add_elements",
          draftTargetId,
          sourceMessageContent,
        );
      if (kind === "channel" || kind === "catalog_entry" || kind === "dataset_empty")
        return generateResourceDraft(activeSessionId, clientMessageId, kind);
      return generateModusOperandiDraft(
        activeSessionId,
        clientMessageId,
        draftOperation,
        draftTargetId,
      );
    },
    onSuccess: (result, variables) => {
      setDraft(result);
      setDraftKind(variables.kind);
      setDraftDrawerOpen(true);
      setConfirmOpen(false);
      setNotice("");
    },
    onError: (error) => setNotice(safeError(error)),
  });
  const startDraft = (kind: DraftKind, message: AgentMessage) => {
    setDraftKind(kind);
    const nextOperation = kind === "watchlist_element" ? "add_elements" : "create";
    setOperation(nextOperation);
    setTargetId("");
    draftMutation.mutate({
      kind,
      clientMessageId: message.client_message_id,
      operation: nextOperation,
      ...(kind === "watchlist_element" &&
      lastUserMessage?.client_message_id === message.client_message_id
        ? { sourceMessageContent: lastUserMessageSource }
        : {}),
    });
  };
  const regenerateDraft = () => {
    if (!lastUserMessage) return;
    draftMutation.mutate({
      kind: draftKind,
      clientMessageId: lastUserMessage.client_message_id,
      operation,
      ...(operation === "update" && targetId ? { targetId } : {}),
      ...(draftKind === "watchlist_element" ? { sourceMessageContent: lastUserMessageSource } : {}),
    });
  };
  const confirmMutation = useMutation({
    mutationFn: () => {
      const item = draft?.content.items?.[0];
      if (!draft || !item) throw new Error("DRAFT_NOT_FOUND");
      if (draftKind === "flag")
        return confirmFlagDraft(activeSessionId, draft.package_id, item.item_id);
      if (draftKind === "similar_case")
        return confirmSimilarCaseDraft(activeSessionId, draft.package_id, item.item_id);
      if (draftKind === "taxonomy")
        return confirmTaxonomyDraft(activeSessionId, draft.package_id, item.item_id);
      if (draftKind === "watchlist" || draftKind === "watchlist_element")
        return confirmWatchlistDraft(activeSessionId, draft.package_id, item.item_id);
      if (draftKind === "channel" || draftKind === "catalog_entry" || draftKind === "dataset_empty")
        return confirmResourceDraft(activeSessionId, draft.package_id, item.item_id);
      return confirmModusOperandiDraft(activeSessionId, draft.package_id, item.item_id);
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      setNotice(`El ${draftTitle(draftKind)} se confirmó y ya está en la Biblioteca.`);
      setDraft(null);
      setDraftDrawerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["modusOperandiEntries"] }),
        queryClient.invalidateQueries({ queryKey: ["libraryModusOperandi"] }),
        queryClient.invalidateQueries({ queryKey: ["flagEntries"] }),
        queryClient.invalidateQueries({ queryKey: ["similarCaseEntries"] }),
        queryClient.invalidateQueries({ queryKey: ["watchlists"] }),
        queryClient.invalidateQueries({ queryKey: ["datasets"] }),
        queryClient.invalidateQueries({ queryKey: ["channelLibrary"] }),
        queryClient.invalidateQueries({ queryKey: ["tagCatalog"] }),
      ]);
    },
    onError: (error) => {
      setConfirmOpen(false);
      setNotice(safeError(error));
    },
  });

  if (!visible) return null;
  const insights = insightsQuery.data ?? [];
  const proposedInsights = insights.filter(
    (insight) => insight.status.toUpperCase() === "PROPOSED",
  );
  const insightsById = new Map(insights.map((insight) => [insight.insight_id, insight]));
  const referencedInsightIds = new Set(
    displayedMessages.flatMap((message) => message.extracted_insight_ids),
  );
  const orphanInsights = proposedInsights.filter(
    (insight) => !referencedInsightIds.has(insight.insight_id),
  );
  const draftItem = draft?.content.items?.[0];
  const targetOptions =
    draftKind === "modus_operandi"
      ? (libraryQuery.data ?? []).map((entry) => ({ id: entry.id, label: entry.title }))
      : draftKind === "flag"
        ? (flagLibraryQuery.data ?? []).map((entry) => ({ id: entry.id, label: entry.name }))
        : draftKind === "similar_case"
          ? (similarCaseLibraryQuery.data ?? []).map((entry) => ({
              id: entry.id,
              label: entry.text,
            }))
          : draftKind === "taxonomy"
            ? (taxonomyLibraryQuery.data ?? []).map((entry) => ({
                id: entry.id,
                label: entry.name,
              }))
            : (watchlistQuery.data ?? []).map((entry) => ({ id: entry.id, label: entry.name }));
  const checksPass = Boolean(
    draft &&
    draft.verifications.length &&
    draft.verifications.every((check) => check.status === "PASS"),
  );
  const waitingForUser = currentSession?.status === "WAITING_USER";
  const optimizerAttention = sessions.filter(
    (item) =>
      item.mode === "optimization" &&
      ["WAITING_USER", "WAITING_APPROVAL", "FAILED"].includes(item.status),
  ).length;

  return (
    <>
      {!open && (
        <button
          type="button"
          ref={launcher.ref}
          style={launcher.style}
          {...launcher.handlers}
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente ARIA"
          title="Arrastra para mover"
          className="fixed z-40 flex cursor-grab touch-none select-none items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-primary/90 active:cursor-grabbing"
        >
          <GripVertical className="-ml-2 h-3.5 w-3.5 opacity-60" />
          <MessageCircle className="h-4 w-4" /> Asistente ARIA
          {optimizerAttention > 0 && (
            <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] text-white">
              {optimizerAttention}
            </span>
          )}
        </button>
      )}
      {open && (
        <aside
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-background shadow-2xl"
          aria-label="Panel del asistente"
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Bot className="h-4 w-4 text-primary" /> ARIA · Asistente
              </div>
              <p className="truncate text-[11px] text-text-secondary">
                Contexto de página: {pageLabel}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar asistente"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-text-secondary hover:bg-surface"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          {optimizerAttention > 0 && (
            <Link
              to="/configuracion"
              onClick={() => setOpen(false)}
              data-testid="optimizer-attention-link"
              className="flex items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <span>
                {optimizerAttention === 1
                  ? "Una sesión del optimizador necesita tu atención."
                  : `${optimizerAttention} sesiones del optimizador necesitan tu atención.`}
              </span>
              <span className="font-semibold underline">Abrir Optimizador</span>
            </Link>
          )}
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <label className="sr-only" htmlFor="agent-session">
              Conversación
            </label>
            <select
              id="agent-session"
              value={activeSessionId}
              disabled={sendMutation.isPending || createSession.isPending}
              onChange={(event) => {
                setSessionId(event.target.value);
                setLastUserMessage(null);
                setLastUserMessageSource("");
                setPending([]);
                setDraft(null);
                setNotice("");
              }}
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-text-primary"
            >
              <option value="">Selecciona una conversación</option>
              {sessions
                .filter((session) => session.mode === "assistant")
                .map((session) => (
                  <option key={session.session_id} value={session.session_id}>
                    {titleForSession(session)} · {session.status}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => createSession.mutate()}
              disabled={createSession.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-primary disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Nueva
            </button>
          </div>
          {currentSession && waitingForUser && (
            <div className="border-b border-border bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-800">
              El asistente espera una respuesta tuya para continuar.
            </div>
          )}
          {currentSession && (
            <details className="border-b border-border px-3 py-1 text-xs">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-text-secondary">
                <span>
                  Resumen de sesión
                  {proposedInsights.length > 0 && ` · ${proposedInsights.length} propuesta(s)`}
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </summary>
              <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-text-primary">
                {summaryQuery.isLoading
                  ? "Cargando resumen…"
                  : summaryQuery.data
                    ? summaryText(summaryQuery.data.content)
                    : "Todavía no hay resumen disponible."}
              </div>
            </details>
          )}
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2" aria-live="polite">
            {!activeSessionId ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">
                {sessionsQuery.isLoading
                  ? "Cargando conversaciones…"
                  : "Inicia una conversación para trabajar en un borrador de la Biblioteca."}
              </div>
            ) : null}
            {messagesQuery.isError && (
              <div className="rounded-md bg-danger/10 p-2 text-xs text-danger">
                No se pudieron cargar los mensajes. Recarga el panel para reintentarlo.
              </div>
            )}
            {displayedMessages.map((message) => {
              const failed = pending.find((item) => item.id === message.client_message_id)?.failed;
              const inlineInsights = message.extracted_insight_ids
                .map((id) => insightsById.get(id))
                .filter((item): item is AgentInsight => Boolean(item));
              return (
                <div key={`${message.client_message_id}-${message.seq}`} className="space-y-1">
                  <article
                    className={`max-w-[94%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug ${message.role === "user" ? "ml-auto bg-primary text-white" : "mr-auto border border-border bg-card text-text-primary"}`}
                  >
                    <span className="mr-1.5 text-[10px] font-semibold uppercase opacity-70">
                      {message.role === "user" ? "Tú" : "ARIA"}
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {message.error_code ? (
                        "No pude responder esta vez."
                      ) : message.role === "user" ? (
                        message.content
                      ) : (
                        <BoldText text={message.content} />
                      )}
                    </span>
                    {failed && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/20 pt-1 text-xs">
                        <span>Envío no confirmado.</span>
                        <button
                          type="button"
                          onClick={() =>
                            submitMessage(
                              pending.find((item) => item.id === message.client_message_id),
                            )
                          }
                          className="inline-flex items-center gap-1 underline"
                        >
                          <RefreshCw className="h-3 w-3" /> Reintentar
                        </button>
                      </div>
                    )}
                    {message.error_code && (
                      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-1 text-xs">
                        <span>El asistente no está disponible ahora.</span>
                        <button
                          type="button"
                          onClick={() => {
                            const original = displayedMessages.find(
                              (item) =>
                                item.client_message_id ===
                                message.client_message_id.replace(/:assistant$/, ""),
                            );
                            if (original) resendAsNewMessage(original.content);
                          }}
                          className="inline-flex items-center gap-1 underline"
                        >
                          <RefreshCw className="h-3 w-3" /> Reintentar
                        </button>
                      </div>
                    )}
                    {message.role === "user" &&
                      lastUserMessage?.client_message_id === message.client_message_id && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(draftActionsQuery.data ?? []).map(({ action_id: kind }) => {
                            const label =
                              kind === "watchlist_element"
                                ? "elementos de watchlist"
                                : kind === "dataset_empty"
                                  ? "dataset vacío"
                                  : kind === "catalog_entry"
                                    ? "catálogo de configuración"
                                    : kind === "channel"
                                      ? "canal"
                                      : kind === "modus_operandi"
                                        ? "modus operandi"
                                        : kind === "similar_case"
                                          ? "caso similar"
                                          : kind === "taxonomy"
                                            ? "taxonomía"
                                            : kind;
                            return (
                              <button
                                key={kind}
                                type="button"
                                onClick={() => startDraft(kind, message)}
                                disabled={
                                  draftMutation.isPending ||
                                  (kind === "watchlist_element" && !lastUserMessageSource)
                                }
                                aria-label={`Crear borrador de ${label} desde este mensaje`}
                                className="rounded border border-white/40 px-1.5 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-50"
                              >
                                {draftMutation.isPending && draftKind === kind
                                  ? "Preparando borrador…"
                                  : `Crear borrador de ${label}`}
                              </button>
                            );
                          })}
                        </div>
                      )}
                  </article>
                  <MessageReferences message={message} />
                  {inlineInsights.length > 0 && (
                    <details className="mr-auto w-[94%] text-[11px] text-text-secondary">
                      <summary className="cursor-pointer select-none">
                        Insights ({inlineInsights.length})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {inlineInsights.map((insight) => (
                          <InsightRow
                            key={insight.insight_id}
                            insight={insight}
                            busy={insightMutation.isPending}
                            onConfirm={() =>
                              insightMutation.mutate({
                                insightId: insight.insight_id,
                                action: "confirm",
                              })
                            }
                            onReject={() =>
                              insightMutation.mutate({
                                insightId: insight.insight_id,
                                action: "reject",
                              })
                            }
                            onEdit={() =>
                              setComposer(`Quiero ajustar esta propuesta: ${insight.statement}`)
                            }
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
            {orphanInsights.length > 0 && (
              <details className="mr-auto w-[94%] text-[11px] text-text-secondary">
                <summary className="cursor-pointer select-none">
                  Otros insights propuestos ({orphanInsights.length})
                </summary>
                <div className="mt-1 space-y-1">
                  {orphanInsights.map((insight) => (
                    <InsightRow
                      key={insight.insight_id}
                      insight={insight}
                      busy={insightMutation.isPending}
                      onConfirm={() =>
                        insightMutation.mutate({ insightId: insight.insight_id, action: "confirm" })
                      }
                      onReject={() =>
                        insightMutation.mutate({ insightId: insight.insight_id, action: "reject" })
                      }
                      onEdit={() =>
                        setComposer(`Quiero ajustar esta propuesta: ${insight.statement}`)
                      }
                    />
                  ))}
                </div>
              </details>
            )}
            {draft && draftItem && (
              <button
                type="button"
                onClick={() => setDraftDrawerOpen(true)}
                className="rounded border border-primary/30 px-2 py-1 text-xs text-primary"
              >
                Abrir propuesta de {draftTitle(draftKind, draftItem.draft)}
              </button>
            )}
            {unanswered.length > 0 && (
              <div role="status" className="text-[11px] text-text-secondary">
                ARIA está escribiendo…
              </div>
            )}
            {pending.some((item) => !item.failed) && (
              <div className="text-right text-[11px] text-text-secondary">Enviando…</div>
            )}
            <div ref={endRef} />
          </div>

          {notice && (
            <div
              role="alert"
              className="mx-3 mt-1 rounded-md bg-danger/10 px-2.5 py-1.5 text-xs text-danger"
            >
              {notice}
            </div>
          )}
          {draft && (
            <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5">
              <label className="sr-only" htmlFor="draft-operation">
                Operación del borrador
              </label>
              {draftKind !== "watchlist_element" && (
                <select
                  id="draft-operation"
                  value={operation}
                  onChange={(event) => setOperation(event.target.value as "create" | "update")}
                  className="rounded border border-border bg-card px-2 py-1 text-xs"
                >
                  <option value="create">Crear</option>
                  <option value="update">Editar</option>
                </select>
              )}
              {operation === "update" && (
                <select
                  aria-label="Entrada de Biblioteca"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-xs"
                >
                  <option value="">Selecciona {draftTitle(draftKind)}</option>
                  {targetOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={regenerateDraft}
                disabled={draftMutation.isPending || (operation === "update" && !targetId)}
                className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
              >
                Regenerar
              </button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitMessage();
            }}
            className="border-t border-border bg-card px-3 py-2"
          >
            <label htmlFor="agent-message" className="sr-only">
              Mensaje para ARIA
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="agent-message"
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                disabled={!activeSessionId || sendMutation.isPending}
                maxLength={MESSAGE_LIMIT}
                rows={2}
                placeholder={
                  activeSessionId
                    ? "Describe qué necesitas… (Enter envía, Shift+Enter salto)"
                    : "Inicia una conversación para escribir"
                }
                className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!activeSessionId || !composer.trim() || sendMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}{" "}
                Enviar
              </button>
            </div>
            <div
              className={`mt-1 text-[10px] ${composer.length >= MESSAGE_LIMIT ? "text-danger" : "text-text-secondary"}`}
            >
              {composer.length.toLocaleString("es-CO")} / {MESSAGE_LIMIT.toLocaleString("es-CO")}{" "}
              caracteres · Contenido de casos no disponible en este panel.
            </div>
          </form>
        </aside>
      )}
      <SideDrawer
        open={draftDrawerOpen && Boolean(draft && draftItem)}
        onOpenChange={setDraftDrawerOpen}
        title={
          draftItem ? `Propuesta de ${draftTitle(draftKind, draftItem.draft)}` : "Propuesta ARIA"
        }
        description="Revisa el borrador verificado antes de confirmar su aplicación."
        proposedByAria
        size="lg"
        footer={
          <button
            type="button"
            disabled={!checksPass || confirmMutation.isPending}
            onClick={() => {
              setDraftDrawerOpen(false);
              setConfirmOpen(true);
            }}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Revisar y confirmar
          </button>
        }
      >
        {draft && draftItem ? <DraftCard draft={draft} item={draftItem} kind={draftKind} /> : null}
      </SideDrawer>
      {confirmOpen && draftItem && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
          role="presentation"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="agent-confirm-title"
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-xl"
          >
            <h2 id="agent-confirm-title" className="text-lg font-semibold">
              Confirmar cambio en la Biblioteca
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Se aplicará exactamente este borrador. La confirmación no se ejecuta por responder
              “sí” en el chat.
            </p>
            <h3 className="mt-4 text-sm font-semibold">Contenido que se aplicará</h3>
            <pre className="mt-2 overflow-x-auto rounded-md bg-card p-3 text-xs">
              {JSON.stringify(draftItem.draft, null, 2)}
            </pre>
            <h3 className="mt-4 text-sm font-semibold">Diff</h3>
            <pre className="mt-2 overflow-x-auto rounded-md bg-card p-3 text-xs">
              {JSON.stringify(draftItem.diff, null, 2)}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Volver a revisar
              </button>
              <button
                type="button"
                disabled={!checksPass || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}{" "}
                Confirmar y aplicar
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// Chips open the pages recommended by the answer.
function MessageReferences({ message }: { message: AgentMessage }) {
  const references = (message.references ?? []).filter((ref) => ref.path);
  if (references.length === 0) return null;
  return (
    <div className="mr-auto w-[94%] space-y-0.5 text-[11px]">
      {references.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Lugares sugeridos">
          {references.map((ref) => (
            <Link
              key={ref.id}
              to={ref.path as never}
              title={ref.path}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
            >
              {ref.kind === "task" ? `Cómo: ${ref.label}` : `Ir a ${ref.label}`}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightRow({
  insight,
  onConfirm,
  onReject,
  onEdit,
  busy,
}: {
  insight: AgentInsight;
  onConfirm: () => void;
  onReject: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const proposed = insight.status.toUpperCase() === "PROPOSED";
  const iconButton = "rounded p-1 text-text-secondary hover:bg-surface disabled:opacity-50";
  return (
    <div
      className={`mr-auto flex w-[94%] items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${proposed ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card/60 text-text-secondary"}`}
    >
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="mr-1 text-[10px] font-semibold uppercase text-amber-800">
          {proposed ? `Insight propuesto · ${insight.kind}` : `${insight.kind} · ${insight.status}`}
        </span>
        {insight.statement}
      </p>
      {proposed && (
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            aria-label="Confirmar insight"
            title="Confirmar insight"
            className={`${iconButton} text-primary`}
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label="Editar en chat"
            title="Editar en chat"
            className={iconButton}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            aria-label="Rechazar insight"
            title="Rechazar"
            className={iconButton}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function DraftCard({
  draft,
  item,
  kind,
}: {
  draft: AgentLibraryDraft;
  item: NonNullable<AgentLibraryDraft["content"]["items"]>[number];
  kind: DraftKind;
}) {
  const title = draftTitle(kind, item.draft);
  const canConfirm =
    draft.verifications.length > 0 && draft.verifications.every((check) => check.status === "PASS");
  return (
    <article className="rounded-lg border border-primary/30 bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Borrador de {title}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${canConfirm ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
        >
          {canConfirm ? "Verificado" : "Revisión requerida"}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {item.operation === "add_elements"
          ? "Agregar elementos"
          : item.operation === "create"
            ? "Crear entrada"
            : "Editar entrada"}{" "}
        · paquete {draft.package_id.slice(0, 8)}
      </p>
      <div className="mt-3 space-y-2">
        {Object.entries(item.draft).map(([field, value]) => (
          <div key={field} className="rounded border border-border px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{field.replaceAll("_", " ")}</span>
              <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-secondary">
                {item.field_provenance[field]?.source ?? "inferencia"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-text-primary">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1">
        {draft.verifications.map((check) => (
          <div
            key={check.verification_id}
            className="flex items-center justify-between rounded bg-background px-2 py-1.5 text-xs"
          >
            <span>{check.verifier.replaceAll("_", " ")}</span>
            <span className={check.status === "PASS" ? "text-success" : "text-danger"}>
              {check.status === "PASS" ? "Correcto" : (check.error_code ?? "Falló")}
            </span>
          </div>
        ))}
      </div>
      {item.questions.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
          <p className="font-semibold">Puntos por completar</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {item.questions.map((question, index) => (
              <li key={`${index}-${question}`}>{question}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-text-secondary">
        Para ajustar el borrador, explica el cambio en el chat y genera una nueva versión; esta
        propuesta sellada no se edita localmente.
      </p>
    </article>
  );
}
