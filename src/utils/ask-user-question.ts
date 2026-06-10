// Helpers shared by the dashboard, Telegram and ntfy channels to detect and
// pretty-render Claude Code's AskUserQuestion tool input. That tool serialises
// a multi-question multi-option wizard into a single JSON blob in tool_input,
// which is unreadable and — worse — pairs with the regular Allow/Deny buttons
// that look like an answer but actually only let the picker open in the tmux
// pane. Surfacing the structure + a warning is the safe minimum.

export interface AskUserOption {
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  header?: string;
  question: string;
  options: AskUserOption[];
}

export function isAskUserQuestion(toolName: string | undefined): boolean {
  return toolName === 'AskUserQuestion';
}

export function parseAskUserQuestion(toolInput: string | undefined): AskUserQuestion[] | null {
  if (!toolInput) return null;
  try {
    const obj = JSON.parse(toolInput) as { questions?: unknown };
    if (!Array.isArray(obj.questions)) return null;
    const out: AskUserQuestion[] = [];
    for (const raw of obj.questions) {
      const q = raw as { header?: string; question?: string; options?: unknown };
      if (typeof q.question !== 'string') continue;
      const options: AskUserOption[] = [];
      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          const o = opt as { label?: string; description?: string };
          if (typeof o.label === 'string') {
            options.push({ label: o.label, description: typeof o.description === 'string' ? o.description : undefined });
          }
        }
      }
      out.push({ header: typeof q.header === 'string' ? q.header : undefined, question: q.question, options });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// Plain-text rendering for ntfy and any other text channel. Caps descriptions
// to a short snippet to keep notifications skimmable.
export function formatAskUserQuestionText(questions: AskUserQuestion[], maxDescChars = 140): string {
  return questions.map((q, qi) => {
    const lines: string[] = [];
    if (q.header) lines.push(`[${q.header}]`);
    lines.push(`Q${qi + 1}. ${q.question}`);
    q.options.forEach((o, oi) => {
      let line = `  ${oi + 1}) ${o.label}`;
      if (o.description) {
        const snippet = o.description.length > maxDescChars
          ? o.description.slice(0, maxDescChars).trim() + '…'
          : o.description;
        line += ` — ${snippet}`;
      }
      lines.push(line);
    });
    return lines.join('\n');
  }).join('\n\n');
}
