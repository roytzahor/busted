/**
 * Type-safe AI Core client shell.
 * Supports Claude 3.5 Haiku and GPT-4o-mini for low-latency text parsing.
 * Scraped content must be pre-stripped to optimized Markdown/JSON before calling.
 */

export type AIProvider = "anthropic" | "openai";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
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
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-3-5-haiku-20241022",
  openai: "gpt-4o-mini",
};

function resolveProvider(config: AIClientConfig): AIProvider {
  if (config.provider) return config.provider;
  if (process.env.AI_PROVIDER === "anthropic") return "anthropic";
  if (process.env.AI_PROVIDER === "openai") return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "openai";
}

function resolveApiKey(provider: AIProvider, config: AIClientConfig): string {
  const key =
    provider === "anthropic"
      ? (config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY)
      : (config.openaiApiKey ?? process.env.OPENAI_API_KEY);

  if (!key) {
    throw new Error(
      `Missing API key for ${provider}. Set ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}.`,
    );
  }

  return key;
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

  constructor(config: AIClientConfig = {}) {
    this.provider = resolveProvider(config);
    this.apiKey = resolveApiKey(this.provider, config);
    this.model = DEFAULT_MODELS[this.provider];
  }

  get activeProvider(): AIProvider {
    return this.provider;
  }

  get activeModel(): string {
    return this.model;
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (this.provider === "anthropic") {
      return callAnthropic(this.apiKey, this.model, options);
    }
    return callOpenAI(this.apiKey, this.model, options);
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
