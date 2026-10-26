import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentMessages, sendAgentMessage } from "@/lib/api/agent.functions";

function newMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `aria-${Date.now()}`;
}

export function SessionConversation({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("");
  const messages = useQuery({
    queryKey: ["agentMessages", sessionId],
    queryFn: () => listAgentMessages(sessionId),
    refetchInterval: 3_000,
  });
  const send = useMutation({
    mutationFn: () => sendAgentMessage(sessionId, newMessageId(), composer.trim()),
    onSuccess: async () => {
      setComposer("");
      setNotice("");
      await queryClient.invalidateQueries({ queryKey: ["agentMessages", sessionId] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el mensaje."),
  });
  return (
    <section aria-label="Conversación del optimizador" className="space-y-3">
      <div className="space-y-2">
        {(messages.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary">
            Aún no hay mensajes. Puedes añadir contexto en cualquier momento.
          </p>
        ) : (
          (messages.data ?? []).slice(-20).map((message) => (
            <article
              key={message.message_id}
              className="rounded-lg border border-border bg-card p-3 text-[13px]"
            >
              <p className="mb-1 text-[11px] font-semibold text-text-secondary">
                {message.role === "user" ? "Tú" : "ARIA · Optimizador"}
              </p>
              <p className="whitespace-pre-wrap text-text-primary">{message.content}</p>
            </article>
          ))
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <input
          aria-label="Mensaje para el optimizador"
          value={composer}
          onChange={(event) => setComposer(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
          placeholder="Añade contexto…"
        />
        <button
          type="submit"
          disabled={!composer.trim() || send.isPending}
          className="rounded-lg bg-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
      {notice && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-[12px] text-danger">
          {notice}
        </p>
      )}
    </section>
  );
}
