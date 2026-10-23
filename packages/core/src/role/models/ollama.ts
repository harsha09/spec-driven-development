function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export interface OllamaResult {
  called: boolean;
  model: string;
  content: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

function chatUrl(base: string): string | null {
  try {
    const withSlash = base.endsWith("/") ? base : `${base}/`;
    return new URL("api/chat", withSlash).toString();
  } catch {
    return null;
  }
}

export async function ollamaDecision(input: {
  baseUrl: string;
  model: string;
  state: string;
  question: string;
  options: readonly string[];
  fetch: typeof fetch;
}): Promise<OllamaResult> {
  const url = chatUrl(input.baseUrl);
  if (!url) {
    return {
      called: false,
      model: input.model,
      content: null,
      inputTokens: null,
      outputTokens: null,
    };
  }
  const body = JSON.stringify({
    model: input.model,
    stream: false,
    format: {
      type: "object",
      properties: {
        pick: { type: "string" },
        probs: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["pick", "probs"],
    },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          state: input.state,
          question: input.question,
          options: input.options,
        }),
      },
    ],
  });
  try {
    const response = await input.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        called: true,
        model: input.model,
        content: null,
        inputTokens: null,
        outputTokens: null,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        called: true,
        model: input.model,
        content: null,
        inputTokens: null,
        outputTokens: null,
      };
    }
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const message =
      record.message && typeof record.message === "object" && !Array.isArray(record.message)
        ? (record.message as Record<string, unknown>)
        : {};
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content && typeof message.content === "object"
          ? JSON.stringify(message.content)
          : null;
    const model =
      typeof record.model === "string" && record.model.trim() ? record.model : input.model;
    return {
      called: true,
      model,
      content,
      inputTokens: count(record.prompt_eval_count),
      outputTokens: count(record.eval_count),
    };
  } catch {
    return {
      called: true,
      model: input.model,
      content: null,
      inputTokens: null,
      outputTokens: null,
    };
  }
}
