// Shared by PromptEditor's imperative handle and any plain <textarea> that
// wants the same "insert at cursor, else append" behavior (see
// SegmentProfilingSection's strategy prompts) - keeps the splicing math in
// one place instead of copy-pasted per field. Split out of PromptEditor.tsx
// so that file only exports the component (react-refresh/only-export-components).
export function spliceToken(
  value: string,
  selection: { start: number; end: number } | null,
  token: string,
): { next: string; cursor: number } {
  const at = selection?.start ?? value.length;
  const endAt = selection?.end ?? value.length;
  const needsLeadingSpace = at > 0 && !/\s$/.test(value.slice(0, at));
  const insertText = needsLeadingSpace ? ` ${token}` : token;
  return { next: value.slice(0, at) + insertText + value.slice(endAt), cursor: at + insertText.length };
}
