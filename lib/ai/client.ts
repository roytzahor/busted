/**
 * Type-safe AI Core client shell.
 * Model ids are never hardcoded here — they resolve through ./models.
 * Uses the official @google/generative-ai SDK with automatic model fallback.
 * Scraped content must be pre-stripped to optimized Markdown/JSON before calling.
 */

import {
  GoogleGenerativeAI,
  type Content,
  type GenerativeModel,
  type Part,
} from "@google/generative-ai";
import {
  anthropicModel,
  flashModel,
  googleModelFallbackChain,
  openaiModel,
} from "./models";

export type AIProvider = "google" | "anthropic" | "openai";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AICompletionResult {
  content: string;
  provider: AIProvider;
  model: string;
  /**
   * The model the provider actually served. For a `-latest` alias this differs
   * from `model` (the requested id) — `gemini-flash-latest` resolves to a
   * concrete version that moves without warning, so benchmarks must record
   * this, not the alias. Undefined when the provider doesn't report it.
   */
  resolvedModel?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    /**
     * Reasoning tokens. Billed at the output rate but NOT included in
     * candidatesTokenCount, so cost computed from outputTokens alone
     * understates spend on a thinking model (often by >10x on short answers).
     */
    thoughtTokens: number;
  };
}

export interface AIClientConfig {
  provider?: AIProvider;
  model?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

/**
 * Resolved per call, not cached: the model registry reads `process.env` lazily
 * so a runtime override (model-benchmark) is honoured.
 */
function defaultModelFor(provider: AIProvider): string {
  switch (provider) {
    case "google":
      return flashModel();
    case "anthropic":
      return anthropicModel();
    case "openai":
      return openaiModel();
  }
}

function resolveProvider(config: AIClientConfig): AIProvider {
  if (config.provider) return config.provider;

  const envProvider = process.env.AI_PROVIDER;
  if (envProvider === "google") return "google";
  if (envProvider === "anthropic") return "anthropic";
  if (envProvider === "openai") return "openai";

  if (process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY) return "google";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  return "google";
}

function resolvePrimaryGoogleModel(config: AIClientConfig): string {
  return config.model ?? flashModel();
}

function resolveGoogleModelChain(config: AIClientConfig): string[] {
  const primary = resolvePrimaryGoogleModel(config);
  return Array.from(new Set([primary, ...googleModelFallbackChain()]));
}

function resolveApiKey(provider: AIProvider, config: AIClientConfig): string {
  if (provider === "google") {
    // Use the first key from the multi-key chain. The actual multi-key
    // dispatcher in callGoogleWithFailover consults the chain directly.
    const chain = resolveGoogleKeyChain(config);
    if (chain.length === 0) {
      throw new Error(
        "Missing API key for Google AI. Set GOOGLE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_API_KEYS.",
      );
    }
    return chain[0];
  }

  if (provider === "anthropic") {
    const key = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("Missing API key for Anthropic. Set ANTHROPIC_API_KEY.");
    }
    return key;
  }

  const key = config.openaiApiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing API key for OpenAI. Set OPENAI_API_KEY.");
  }
  return key;
}

/* ─── Stage 32: multi-key Gemini failover ──────────────────────────────────
 *
 * Resolves the Google key chain from (in priority order):
 *   1. config.googleApiKey (single)
 *   2. GOOGLE_AI_API_KEYS  (comma-separated list — Stage 32)
 *   3. GOOGLE_AI_API_KEY   (legacy single, still supported)
 *   4. GEMINI_API_KEY      (legacy single, still supported)
 *
 * Each key gets an in-memory cooldown when it returns a 429/503. The chain
 * filters out cooled-down keys before being used. State is process-local;
 * resets on cold start. */

const KEY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const _cooledUntil = new Map<string, number>();

function isCooled(key: string): boolean {
  const until = _cooledUntil.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    _cooledUntil.delete(key);
    return false;
  }
  return true;
}

function markKeyCooled(key: string): void {
  _cooledUntil.set(key, Date.now() + KEY_COOLDOWN_MS);
}

function resolveGoogleKeyChain(config: AIClientConfig): string[] {
  if (config.googleApiKey) return [config.googleApiKey];

  const multi = process.env.GOOGLE_AI_API_KEYS;
  if (multi) {
    const parsed = multi
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parsed.length > 0) return parsed;
  }

  const legacy = process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  return legacy ? [legacy] : [];
}

function resolveActiveGoogleKeys(config: AIClientConfig): string[] {
  const chain = resolveGoogleKeyChain(config);
  const active = chain.filter((k) => !isCooled(k));
  // If all keys are cooled down, retry them anyway — better to attempt and
  // re-fail loudly than to throw a "all keys cooled" error the user can't act on.
  return active.length > 0 ? active : chain;
}

function isRetryableGoogleError(status: number, body: string): boolean {
  if (status === 404 || status === 429 || status === 503) return true;
  return (
    body.includes("not found") ||
    body.includes("RESOURCE_EXHAUSTED") ||
    body.includes("quota")
  );
}

function toGoogleHistory(messages: AIMessage[]): Content[] {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content } satisfies Part],
    }));
}

function isQuotaError(message: string): boolean {
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("quota") ||
    message.includes("rate limit")
  );
}

function maskKey(key: string): string {
  if (key.length < 10) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function callGoogleOnce(
  apiKey: string,
  modelChain: string[],
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const systemMessage = options.messages.find((m) => m.role === "system")?.content;
  const history = toGoogleHistory(options.messages);
  let lastError = "All Google AI models failed.";

  for (const modelName of modelChain) {
    try {
      const model: GenerativeModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemMessage,
        generationConfig: {
          temperature: options.temperature ?? 0,
          maxOutputTokens: options.maxTokens ?? 1024,
          ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      });

      const result = await model.generateContent({ contents: history });
      const response = result.response;
      let text: string;
      try {
        text = response.text();
      } catch (textErr) {
        const textErrMsg = textErr instanceof Error ? textErr.message : String(textErr);
        lastError = `${modelName} response blocked: ${textErrMsg}`;
        continue;
      }

      const finishReason = response.candidates?.[0]?.finishReason;
      if (!text || finishReason === "MAX_TOKENS") {
        lastError = `Model ${modelName} hit token limit (${text.length} chars, finishReason: MAX_TOKENS) — increase maxOutputTokens.`;
        continue;
      }
      if (!text) {
        lastError = `Model ${modelName} returned an empty response (finishReason: ${finishReason ?? "unknown"}).`;
        continue;
      }

      const usage = response.usageMetadata;
      const usageWithThoughts = usage as
        | (typeof usage & { thoughtsTokenCount?: number })
        | undefined;
      const resolvedModel = (
        response as typeof response & { modelVersion?: string }
      ).modelVersion;

      return {
        content: text,
        provider: "google",
        model: modelName,
        resolvedModel,
        usage: usage
          ? {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
              thoughtTokens: usageWithThoughts?.thoughtsTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;

      if (!isRetryableGoogleError(0, message)) {
        throw new Error(`Google AI API error (${modelName}): ${message}`);
      }
    }
  }

  throw new Error(`Google AI API error: ${lastError}`);
}

/**
 * Multi-key Google dispatcher — Sprint 12 Stage 32.
 *
 * Iterates the active key chain (cooled keys excluded). On a quota/rate-limit
 * error, marks the key as cooled and tries the next key. Only throws when
 * every key has been tried.
 */
async function callGoogleWithSdk(
  _apiKeyIgnored: string,
  modelChain: string[],
  options: AICompletionOptions,
  keyChain: string[],
): Promise<AICompletionResult> {
  if (keyChain.length === 0) {
    throw new Error("Google AI API error: no usable keys in chain.");
  }

  let lastError = "All Google AI keys exhausted.";

  for (const key of keyChain) {
    try {
      return await callGoogleOnce(key, modelChain, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;

      if (isQuotaError(message)) {
        markKeyCooled(key);
        console.warn(
          `[ai-client] key ${maskKey(key)} cooled down (${KEY_COOLDOWN_MS / 3600_000}h) — quota/rate-limit error.`,
        );
        continue;
      }

      // Non-quota error: don't bother with the next key, it'll fail the same way.
      throw error;
    }
  }

  throw new Error(`Google AI API error: all ${keyChain.length} key(s) exhausted. Last error: ${lastError}`);
}

async function callAnthropic(
  apiKey: string,
  model: string,
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0,
      system: options.messages.find((m) => m.role === "system")?.content,
      messages: options.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const text = data.content.find((block) => block.type === "text")?.text ?? "";

  return {
    content: text,
    provider: "anthropic",
    model,
    usage: data.usage
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          thoughtTokens: 0,
        }
      : undefined,
  };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  options: AICompletionOptions,
): Promise<AICompletionResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0,
      messages: options.messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? "",
    provider: "openai",
    model,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          thoughtTokens: 0,
        }
      : undefined,
  };
}

export class AIClient {
  private readonly provider: AIProvider;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly googleModelChain: string[];
  private readonly config: AIClientConfig;

  constructor(config: AIClientConfig = {}) {
    this.provider = resolveProvider(config);
    this.apiKey = resolveApiKey(this.provider, config);
    this.googleModelChain = resolveGoogleModelChain(config);
    this.model =
      this.provider === "google"
        ? this.googleModelChain[0]
        : config.model ?? defaultModelFor(this.provider);
    this.config = config;
  }

  get activeProvider(): AIProvider {
    return this.provider;
  }

  get activeModel(): string {
    return this.model;
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    switch (this.provider) {
      case "google": {
        // Stage 32: resolve the active (non-cooled) key chain on every call so
        // a previously-cooled key can come back online without a process restart.
        const keyChain = resolveActiveGoogleKeys(this.config);
        return callGoogleWithSdk(this.apiKey, this.googleModelChain, options, keyChain);
      }
      case "anthropic":
        return callAnthropic(this.apiKey, this.model, options);
      case "openai":
        return callOpenAI(this.apiKey, this.model, options);
    }
  }
}

let defaultClient: AIClient | undefined;

export function getAIClient(config?: AIClientConfig): AIClient {
  if (!config) {
    if (!defaultClient) {
      defaultClient = new AIClient();
    }
    return defaultClient;
  }
  return new AIClient(config);
}

export default getAIClient;
