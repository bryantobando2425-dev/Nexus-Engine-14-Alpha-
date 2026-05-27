import { anthropic } from "@workspace/integrations-anthropic-ai";
import { gemini, GEMINI_NARRATION_MODEL, GEMINI_STATE_MODEL } from "./gemini";

export type AIProvider = "gemini" | "anthropic";

export const DEFAULT_AI_PROVIDER: AIProvider = "gemini";

const ANTHROPIC_NARRATION_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_STATE_MODEL = "claude-haiku-4-5";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  provider: AIProvider;
  estimated?: boolean;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
}

export function resolveAIProvider(provider: unknown): AIProvider {
  return provider === "anthropic" ? "anthropic" : DEFAULT_AI_PROVIDER;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.8));
}

function anthropicTextFromMessage(message: Awaited<ReturnType<typeof anthropic.messages.create>>): string {
  return message.content
    .map((part) => part.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("");
}

async function anthropicGenerate(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxTokens = 4096,
): Promise<GenerateResult> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: userPrompt }],
  });
  return {
    text: anthropicTextFromMessage(message),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      provider: "anthropic",
    },
  };
}

async function anthropicStream(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxTokens = 4096,
): Promise<{ stream: AsyncGenerator<string>; getUsage: () => TokenUsage }> {
  let totalOutput = 0;
  const promptTokens = estimateTokens(userPrompt + (systemPrompt || ''));

  async function* gen(): AsyncGenerator<string> {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: userPrompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        totalOutput += event.delta.text.length;
        yield event.delta.text;
      }
    }
  }

  return {
    stream: gen(),
    getUsage: () => ({
      inputTokens: promptTokens,
      outputTokens: Math.ceil(totalOutput / 3.8),
      provider: "anthropic",
      estimated: true,
    }),
  };
}

async function geminiGenerateResult(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxOutputTokens = 8192,
): Promise<GenerateResult> {
  const response = await gemini.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens,
    },
  });
  const text = response.text ?? "";
  const meta = (response as any).usageMetadata;
  return {
    text,
    usage: {
      inputTokens: meta?.promptTokenCount || estimateTokens(userPrompt + (systemPrompt || '')),
      outputTokens: meta?.candidatesTokenCount || estimateTokens(text),
      provider: "gemini",
      estimated: !meta?.promptTokenCount,
    },
  };
}

async function geminiStreamResult(
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  maxOutputTokens = 8192,
): Promise<{ stream: AsyncGenerator<string>; getUsage: () => TokenUsage }> {
  let totalOutput = 0;
  const promptTokens = estimateTokens(userPrompt + (systemPrompt || ''));

  const sdkStream = await gemini.models.generateContentStream({
    model,
    contents: userPrompt,
    config: {
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      maxOutputTokens,
    },
  });

  async function* gen(): AsyncGenerator<string> {
    for await (const chunk of sdkStream) {
      const text = chunk.text;
      if (text) {
        totalOutput += text.length;
        yield text;
      }
    }
  }

  return {
    stream: gen(),
    getUsage: () => ({
      inputTokens: promptTokens,
      outputTokens: Math.ceil(totalOutput / 3.8),
      provider: "gemini",
      estimated: true,
    }),
  };
}

export async function generateWithProvider(
  provider: AIProvider,
  purpose: "narration" | "state",
  userPrompt: string,
  systemPrompt?: string,
): Promise<GenerateResult> {
  if (provider === "anthropic") {
    return anthropicGenerate(
      purpose === "narration" ? ANTHROPIC_NARRATION_MODEL : ANTHROPIC_STATE_MODEL,
      userPrompt,
      systemPrompt,
      purpose === "narration" ? 4096 : 12288,
    );
  }
  return geminiGenerateResult(
    purpose === "narration" ? GEMINI_NARRATION_MODEL : GEMINI_STATE_MODEL,
    userPrompt,
    systemPrompt,
    purpose === "narration" ? 8192 : 16384,
  );
}

export async function streamWithProviderResult(
  provider: AIProvider,
  userPrompt: string,
  systemPrompt?: string,
): Promise<{ stream: AsyncGenerator<string>; getUsage: () => TokenUsage }> {
  if (provider === "anthropic") {
    return anthropicStream(ANTHROPIC_NARRATION_MODEL, userPrompt, systemPrompt, 4096);
  }
  return geminiStreamResult(GEMINI_NARRATION_MODEL, userPrompt, systemPrompt, 8192);
}

export function isProviderBudgetExceeded(err: any, provider: AIProvider): boolean {
  const msg = String(err?.message || err?.error?.message || '');
  const code = err?.error?.error?.code || err?.status || err?.statusCode;
  const errType = err?.error?.type || err?.type || '';

  if (provider === "anthropic") {
    return (
      errType === "rate_limit_error" ||
      msg.includes("rate limit") ||
      msg.includes("overloaded") ||
      (code === 429 && (msg.includes("limit") || msg.includes("quota") || msg.includes("rate")))
    );
  }

  if (provider === "gemini") {
    return (
      msg.includes("FREE_TIER_BUDGET_EXCEEDED") ||
      msg.includes("spend limit exceeded") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("quota exceeded") ||
      (code === 403 && msg.includes("budget")) ||
      (code === 429 && (msg.includes("quota") || msg.includes("budget") || msg.includes("RESOURCE")))
    );
  }

  return false;
}

export function streamWithProvider(
  provider: AIProvider,
  userPrompt: string,
  systemPrompt?: string,
): AsyncGenerator<string> {
  if (provider === "anthropic") {
    const s = anthropic.messages.stream({
      model: ANTHROPIC_NARRATION_MODEL,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: userPrompt }],
    });
    async function* gen() {
      for await (const event of s) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    }
    return gen();
  }

  async function* geminiGen() {
    const sdkStream = await gemini.models.generateContentStream({
      model: GEMINI_NARRATION_MODEL,
      contents: userPrompt,
      config: {
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        maxOutputTokens: 8192,
      },
    });
    for await (const chunk of sdkStream) {
      if (chunk.text) yield chunk.text;
    }
  }
  return geminiGen();
}
