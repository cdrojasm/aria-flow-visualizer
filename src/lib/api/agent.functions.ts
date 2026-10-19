import { apiFetch } from "./client";

export type AgentSession = {
  session_id: string;
  mode: "assistant" | "optimization";
  status: string;
  created_at: string;
  updated_at: string;
  budget_limits: Record<string, number>;
  prompt_versions: Record<string, Record<string, string>>;
  rev: number;
};

export type AgentMessage = {
  message_id: string;
  client_message_id: string;
  seq: number;
  role: "user" | "assistant" | string;
  content: string;
  created_at: string;
  redaction_counts: Record<string, number>;
  extracted_insight_ids: string[];
};

export type AgentInsight = {
  insight_id: string;
  kind: string;
  statement: string;
  scope: Record<string, string>;
  status: string;
  proposed_by: string;
  source_message_id: string | null;
  created_at: string;
  confidence: number | null;
};

export type AgentSessionSummary = {
  session_id: string;
  version: number;
  content: Record<string, unknown>;
  covers_seq_from: number;
  covers_seq_to: number;
  created_at: string;
} | null;

export type AgentChatTurn = {
  user_message: AgentMessage;
  assistant_message: AgentMessage | null;
  proposed_insights: AgentInsight[];
};

export type AgentDraftVerification = {
  verification_id: string;
  verifier: string;
  status: string;
  safe_metrics: Record<string, unknown>;
  error_code: string | null;
  created_at: string | null;
};

export type ModusOperandiDraft = {
  package_id: string;
  session_id: string;
  status: string;
  content_hash: string | null;
  content: {
    items?: Array<{
      item_id: string;
      item_type: string;
      operation: "create" | "update";
      target_ref: string | null;
      base_version: string | null;
      draft: Record<string, unknown>;
      diff: Record<string, unknown>;
      field_provenance: Record<string, { source?: string; message_id?: string | null }>;
      verification_status: string;
      approval_status: string;
      questions: string[];
    }>;
    [key: string]: unknown;
  };
  verifications: AgentDraftVerification[];
};

export type AgentConfirmation = {
  confirmation_id: string;
  package_id: string;
  item_id: string;
  entity_id: string;
};

const path = "/api/v0/agent";

export function listAgentSessions() {
  return apiFetch<AgentSession[]>(`${path}/sessions?limit=50`);
}

export function createAgentSession(mode: "assistant" | "optimization" = "assistant") {
  return apiFetch<AgentSession>(`${path}/sessions`, {
    method: "POST",
    body: JSON.stringify({ mode, scope: mode === "assistant" ? ["library"] : [] }),
  });
}

export function listAgentMessages(sessionId: string, afterSeq = 0) {
  return apiFetch<AgentMessage[]>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/messages?after_seq=${afterSeq}&limit=50`,
  );
}

export function sendAgentMessage(sessionId: string, clientMessageId: string, content: string) {
  return apiFetch<AgentChatTurn>(`${path}/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ client_message_id: clientMessageId, content }),
  });
}

export function listAgentInsights(sessionId: string) {
  return apiFetch<AgentInsight[]>(`${path}/sessions/${encodeURIComponent(sessionId)}/insights`);
}

export function changeAgentInsight(
  sessionId: string,
  insightId: string,
  action: "confirm" | "reject",
) {
  return apiFetch<AgentInsight>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/insights/${encodeURIComponent(insightId)}/${action}`,
    { method: "POST" },
  );
}

export function getAgentSessionSummary(sessionId: string) {
  return apiFetch<AgentSessionSummary>(`${path}/sessions/${encodeURIComponent(sessionId)}/summary`);
}

export function generateModusOperandiDraft(
  sessionId: string,
  clientMessageId: string,
  operation: "create" | "update",
  targetId?: string,
) {
  return apiFetch<ModusOperandiDraft>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/modus-operandi-drafts`,
    {
      method: "POST",
      body: JSON.stringify({
        client_message_id: clientMessageId,
        operation,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    },
  );
}

export function confirmModusOperandiDraft(sessionId: string, packageId: string, itemId: string) {
  return apiFetch<AgentConfirmation>(
    `${path}/sessions/${encodeURIComponent(sessionId)}/modus-operandi-drafts/${encodeURIComponent(packageId)}/confirm`,
    { method: "POST", body: JSON.stringify({ item_id: itemId }) },
  );
}
