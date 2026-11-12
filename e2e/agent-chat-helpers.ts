import type { Page } from "@playwright/test";

export type ChatMessage = {
  client_message_id: string;
  error_code?: string | null;
  content: string;
} & Record<string, unknown>;

/**
 * The chat endpoint answers 202 with only the stored user turn; the worker writes the
 * assistant reply later and the panel finds it by polling `GET .../messages`.
 *
 * Runs `action` (which must trigger exactly one message POST) and returns the POST body
 * plus the assistant message once the real worker has produced it. The poll responses
 * are recorded from before the send, so a fast reply cannot slip between two waits.
 */
export async function captureTurn<T extends ChatMessage = ChatMessage>(
  page: Page,
  action: () => Promise<unknown>,
  timeoutMs = 90_000,
) {
  const seen = new Map<string, ChatMessage>();
  const onResponse = async (response: Awaited<ReturnType<Page["waitForResponse"]>>) => {
    if (!response.url().includes("/messages") || response.request().method() !== "GET") return;
    try {
      const rows = (await response.json()) as ChatMessage[];
      if (Array.isArray(rows)) rows.forEach((row) => seen.set(row.client_message_id, row));
    } catch {
      // A poll that raced a page navigation has no body; the next one will.
    }
  };
  page.on("response", onResponse);
  try {
    const posted = page.waitForResponse(
      (response) => response.url().includes("/messages") && response.request().method() === "POST",
    );
    await action();
    const response = await posted;
    const turn = (await response.json()) as {
      user_message: ChatMessage;
      assistant_message: T | null;
    };
    const key = `${turn.user_message.client_message_id}:assistant`;
    const deadline = Date.now() + timeoutMs;
    let reply = (turn.assistant_message ?? seen.get(key) ?? null) as T | null;
    while (!reply && Date.now() < deadline) {
      await page.waitForTimeout(250);
      reply = (seen.get(key) ?? null) as T | null;
    }
    if (!reply) throw new Error(`El asistente no respondió en ${timeoutMs} ms (${key})`);
    if (reply.error_code) throw new Error(`El asistente falló: ${reply.error_code}`);
    return { response, turn, reply };
  } finally {
    page.off("response", onResponse);
  }
}
