import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import {
  changeAgentInsight,
  confirmModusOperandiDraft,
  createAgentSession,
  generateModusOperandiDraft,
  getAgentSessionSummary,
  listAgentInsights,
  listAgentMessages,
  listAgentSessions,
  sendAgentMessage,
  type AgentInsight,
  type AgentMessage,
  type AgentSession,
  type ModusOperandiDraft,
} from "@/lib/api/agent.functions";
import { listModusOperandiLibraryEntries } from "@/lib/api/knowledgeLibrary.functions";

const MESSAGE_LIMIT = 8_000;
const ALLOWED_ROUTES = ["/configuracion", "/testing", "/biblioteca", "/modelos"];
const PAGE_LABELS: Record<string, string> = {
  "/configuracion": "Configuración",
  "/testing": "Testing",
  "/biblioteca": "Biblioteca",
  "/modelos": "Modelos",
};

type PendingMessage = { id: string; content: string; failed: boolean };

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

function summaryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${summaryText(item)}`)
      .join("\n");
  return value == null ? "Sin resumen disponible." : String(value);
}

export function AgentPanel({ permissions }: { permissions: string[] }) {
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
  const [lastUserMessage, setLastUserMessage] = useState<AgentMessage | null>(null);
  const [draft, setDraft] = useState<ModusOperandiDraft | null>(null);
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingInsight, setEditingInsight] = useState<string | null>(null);
  const [insightEdit, setInsightEdit] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const pageLabel =
    PAGE_LABELS[
      ALLOWED_ROUTES.find((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? ""
    ] ?? "ARIA";

  const sessionsQuery = useQuery({
    queryKey: ["agentSessions"],
    queryFn: listAgentSessions,
    enabled: visible && open,
    refetchInterval: 8_000,
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
    refetchInterval: 3_000,
  });
  const messages = messagesQuery.data;
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
    enabled: open && operation === "update",
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
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["agentSessions"] });
      setNotice("");
    },
    onError: (error) => setNotice(safeError(error)),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      sendAgentMessage(activeSessionId, id, content),
    onSuccess: async (turn, variables) => {
      setLastUserMessage(turn.user_message);
      setPending((items) => items.filter((item) => item.id !== variables.id));
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

  const insightMutation = useMutation({
    mutationFn: ({ insightId, action }: { insightId: string; action: "confirm" | "reject" }) =>
      changeAgentInsight(activeSessionId, insightId, action),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["agentInsights", activeSessionId] }),
    onError: (error) => setNotice(safeError(error)),
  });

  const draftMutation = useMutation({
    mutationFn: () => {
      if (!lastUserMessage) throw new Error("MISSING_SOURCE_MESSAGE");
      return generateModusOperandiDraft(
        activeSessionId,
        lastUserMessage.client_message_id,
        operation,
        operation === "update" ? targetId : undefined,
      );
    },
    onSuccess: (result) => {
      setDraft(result);
      setConfirmOpen(false);
      setNotice("");
    },
    onError: (error) => setNotice(safeError(error)),
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      const item = draft?.content.items?.[0];
      if (!draft || !item) throw new Error("DRAFT_NOT_FOUND");
      return confirmModusOperandiDraft(activeSessionId, draft.package_id, item.item_id);
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      setNotice("El modus operandi se confirmó y ya está en la Biblioteca.");
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["modusOperandiEntries"] }),
        queryClient.invalidateQueries({ queryKey: ["libraryModusOperandi"] }),
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
  const draftItem = draft?.content.items?.[0];
  const checksPass = Boolean(
    draft &&
    draft.verifications.length &&
    draft.verifications.every((check) => check.status === "PASS"),
  );
  const waitingForUser = currentSession?.status === "WAITING_USER";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente ARIA"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-primary/90"
        >
          <MessageCircle className="h-4 w-4" /> Asistente ARIA
        </button>
      )}
      {open && (
        <aside
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-background shadow-2xl"
          aria-label="Panel del asistente"
        >
          <header className="flex items-start justify-between border-b border-border bg-card px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Bot className="h-4 w-4 text-primary" /> ARIA · Asistente
              </div>
              <p className="mt-1 text-xs text-text-secondary">Contexto de página: {pageLabel}</p>
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
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <label className="sr-only" htmlFor="agent-session">
              Conversación
            </label>
            <select
              id="agent-session"
              value={activeSessionId}
              disabled={sendMutation.isPending || createSession.isPending}
              onChange={(event) => {
                setSessionId(event.target.value);
                setPending([]);
                setDraft(null);
                setLastUserMessage(null);
                setNotice("");
              }}
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-2 text-xs text-text-primary"
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
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-2 text-xs text-text-primary disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> Nueva
            </button>
          </div>
          {currentSession && (
            <div className="border-b border-border px-4 py-2 text-xs">
              {waitingForUser ? (
                <div className="rounded-md bg-amber-500/10 px-3 py-2 font-medium text-amber-800">
                  El asistente espera una respuesta tuya para continuar.
                </div>
              ) : (
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Estado: {currentSession.status}</span>
                  <span>
                    {currentSession.mode === "assistant" ? "Modo asistente" : "Optimizador"}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {!activeSessionId ? (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-text-secondary">
                {sessionsQuery.isLoading
                  ? "Cargando conversaciones…"
                  : "Inicia una conversación para trabajar en un borrador de la Biblioteca."}
              </div>
            ) : null}
            {messagesQuery.isError && (
              <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">
                No se pudieron cargar los mensajes. Recarga el panel para reintentarlo.
              </div>
            )}
            {displayedMessages.map((message) => {
              const failed = pending.find((item) => item.id === message.client_message_id)?.failed;
              return (
                <article
                  key={`${message.client_message_id}-${message.seq}`}
                  className={`max-w-[92%] rounded-xl px-3.5 py-3 text-sm ${message.role === "user" ? "ml-auto bg-primary text-white" : "mr-auto border border-border bg-card text-text-primary"}`}
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase opacity-70">
                    {message.role === "user" ? "Tú" : "ARIA"}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {failed && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/20 pt-2 text-xs">
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
                  {message.role === "user" &&
                    lastUserMessage?.client_message_id === message.client_message_id && (
                      <button
                        type="button"
                        onClick={() => draftMutation.mutate()}
                        disabled={draftMutation.isPending}
                        className="mt-2 block rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10"
                      >
                        {draftMutation.isPending
                          ? "Preparando borrador…"
                          : "Crear borrador de modus operandi desde este mensaje"}
                      </button>
                    )}
                </article>
              );
            })}
            {pending.some((item) => !item.failed) && (
              <div className="text-right text-[11px] text-text-secondary">Enviando…</div>
            )}
            <div ref={endRef} />
          </div>

          <div className="max-h-[38vh] space-y-3 overflow-y-auto border-t border-border bg-card/60 px-4 py-3">
            {proposedInsights.map((insight) => (
              <InsightCard
                key={insight.insight_id}
                insight={insight}
                onConfirm={() =>
                  insightMutation.mutate({ insightId: insight.insight_id, action: "confirm" })
                }
                onReject={() =>
                  insightMutation.mutate({ insightId: insight.insight_id, action: "reject" })
                }
                onEdit={() => {
                  setEditingInsight(insight.insight_id);
                  setInsightEdit(insight.statement);
                }}
                busy={insightMutation.isPending}
              />
            ))}
            {editingInsight && (
              <div className="rounded-lg border border-primary/30 bg-card p-3">
                <label htmlFor="insight-edit" className="mb-2 block text-xs font-semibold">
                  Reformula la propuesta en el chat
                </label>
                <textarea
                  id="insight-edit"
                  value={insightEdit}
                  onChange={(event) => setInsightEdit(event.target.value)}
                  className="min-h-20 w-full rounded border border-border bg-background p-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-text-secondary">
                  Al enviarla, ARIA evaluará de nuevo el texto. La propuesta original seguirá
                  pendiente hasta que la confirmes o rechaces.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setComposer(`Quiero ajustar esta propuesta: ${insightEdit}`);
                    setEditingInsight(null);
                  }}
                  className="mt-2 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Continuar en el chat
                </button>
              </div>
            )}
            {draft && draftItem && (
              <DraftCard
                draft={draft}
                item={draftItem}
                canConfirm={checksPass}
                onConfirm={() => setConfirmOpen(true)}
              />
            )}
            {currentSession && (
              <details className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-text-secondary">
                  Resumen de sesión <ChevronDown className="h-3.5 w-3.5" />
                </summary>
                <div className="mt-2 whitespace-pre-wrap text-text-primary">
                  {summaryQuery.isLoading
                    ? "Cargando resumen…"
                    : summaryQuery.data
                      ? summaryText(summaryQuery.data.content)
                      : "Todavía no hay resumen disponible."}
                </div>
              </details>
            )}
            <div className="flex items-center justify-between text-[11px] text-text-secondary">
              <span>Propuestas de insight: {proposedInsights.length}</span>
              <span>Contenido de casos no disponible en este panel.</span>
            </div>
          </div>

          {notice && (
            <div
              role="alert"
              className="mx-4 mt-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {notice}
            </div>
          )}
          {draft && (
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <label className="sr-only" htmlFor="draft-operation">
                Operación del borrador
              </label>
              <select
                id="draft-operation"
                value={operation}
                onChange={(event) => setOperation(event.target.value as "create" | "update")}
                className="rounded border border-border bg-card px-2 py-2 text-xs"
              >
                <option value="create">Crear</option>
                <option value="update">Editar</option>
              </select>
              {operation === "update" && (
                <select
                  aria-label="Entrada de Biblioteca"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-2 text-xs"
                >
                  <option value="">Selecciona modus operandi</option>
                  {(libraryQuery.data ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending || (operation === "update" && !targetId)}
                className="rounded border border-border px-2 py-2 text-xs disabled:opacity-50"
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
            className="border-t border-border bg-card px-4 py-3"
          >
            <label htmlFor="agent-message" className="sr-only">
              Mensaje para ARIA
            </label>
            <textarea
              id="agent-message"
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              disabled={!activeSessionId || sendMutation.isPending}
              maxLength={MESSAGE_LIMIT}
              placeholder={
                activeSessionId
                  ? "Describe qué necesitas…"
                  : "Inicia una conversación para escribir"
              }
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between">
              <span
                className={`text-[11px] ${composer.length >= MESSAGE_LIMIT ? "text-danger" : "text-text-secondary"}`}
              >
                {composer.length.toLocaleString("es-CO")} / {MESSAGE_LIMIT.toLocaleString("es-CO")}{" "}
                caracteres
              </span>
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
          </form>
        </aside>
      )}
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

function InsightCard({
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
  return (
    <article className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-amber-800">
        <span>Insight propuesto · {insight.kind}</span>
        <span>Sin confirmar</span>
      </div>
      <p className="mt-1 text-sm text-text-primary">{insight.statement}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded bg-primary px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Confirmar insight
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="rounded border border-border px-2.5 py-1.5 text-xs text-text-primary"
        >
          Editar en chat
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReject}
          className="rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary"
        >
          Rechazar
        </button>
      </div>
    </article>
  );
}

function DraftCard({
  draft,
  item,
  canConfirm,
  onConfirm,
}: {
  draft: ModusOperandiDraft;
  item: NonNullable<ModusOperandiDraft["content"]["items"]>[number];
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  return (
    <article className="rounded-lg border border-primary/30 bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Borrador de modus operandi</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${canConfirm ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
        >
          {canConfirm ? "Verificado" : "Revisión requerida"}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {item.operation === "create" ? "Crear entrada" : "Editar entrada"} · paquete{" "}
        {draft.package_id.slice(0, 8)}
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
      <p className="mt-2 text-[11px] text-text-secondary">
        Para ajustar el borrador, explica el cambio en el chat y genera una nueva versión; esta
        propuesta sellada no se edita localmente.
      </p>
      <button
        type="button"
        disabled={!canConfirm}
        onClick={onConfirm}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Revisar diff y confirmar
      </button>
    </article>
  );
}
