/**
 * Type-safe AI Core client shell.
 * Default: Google Gemini 3.5 Flash — ultra-low latency, cost-effective parsing.
 * Uses the official @google/generative-ai SDK with automatic model fallback.
 * Scraped content must be pre-stripped to optimized Markdown/JSON before calling.
 */

import {
  GoogleGenerativeAI,
  type Content,
  type GenerativeModel,
  type Part,
} from "@google/generative-ai";

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
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIClientConfig {
  provider?: AIProvider;
  model?: string;
  googleApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  google: "gemini-2.0-flash",
  anthropic: "claude-3-5-haiku-20241022",
  openai: "gpt-4o-mini",
};

/** Ordered fallback chain — gemini-2.0-flash primary (1500 req/day free tier vs 20 for 3.5). */
export const GOOGLE_MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
] as const;

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
  return config.model ?? process.env.GOOGLE_AI_MODEL ?? DEFAULT_MODELS.google;
}

function resolveGoogleModelChain(config: AIClientConfig): string[] {
  const primary = resolvePrimaryGoogleModel(config);
  const chain = [primary, ...GOOGLE_MODEL_FALLBACK_CHAIN.filter((m) => m !== primary)];
  return [...new Set(chain)];
}

function resolveApiKey(provider: AIProvider, config: AIClientConfig): string {
  if (provider === "google") {
    const key =
      config.googleApiKey ??
      process.env.GOOGLE_AI_API_KEY ??
      process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "Missing API key for Google AI. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY.",
      );
    }
    return key;
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

async function callGoogleWithSdk(
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
      const text = response.text();

      if (!text) {
        lastError = `Model ${modelName} returned an empty response.`;
        continue;
      }

      const usage = response.usageMetadata;

      return {
        content: text,
        provider: "google",
        model: modelName,
        usage: usage
          ? {
              inputTokens: usage.promptTokenCount ?? 0,
              outputTokens: usage.candidatesTokenCount ?? 0,
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
        }
      : undefined,
  };
}

export class AIClient {
  private readonly provider: AIProvider;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly googleModelChain: string[];

  constructor(config: AIClientConfig = {}) {
    this.provider = resolveProvider(config);
    this.apiKey = resolveApiKey(this.provider, config);
    this.googleModelChain = resolveGoogleModelChain(config);
    this.model =
      this.provider === "google"
        ? this.googleModelChain[0]
        : config.model ?? DEFAULT_MODELS[this.provider];
  }

  get activeProvider(): AIProvider {
    return this.provider;
  }

  get activeModel(): string {
    return this.model;
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    switch (this.provider) {
      case "google":
        return callGoogleWithSdk(this.apiKey, this.googleModelChain, options);
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
