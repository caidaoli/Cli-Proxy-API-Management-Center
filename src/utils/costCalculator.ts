export interface ModelPricing {
  inputPrice: number;
  outputPrice: number;
  cacheReadPrice?: number;
  cacheReadPriceHigh?: number;
  inputPriceHigh?: number;
  outputPriceHigh?: number;
}

export interface CostCalculationOptions {
  applyLongContextTier?: boolean;
}

const TOKENS_PER_MILLION = 1_000_000;
const CLAUDE_CACHE_READ_MULTIPLIER = 0.1;
const GEMINI_LONG_CONTEXT_THRESHOLD = 200_000;
const GPT_5_4_TIER_THRESHOLD = 272_000;

const modelPricing: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': { inputPrice: 3, outputPrice: 15 },
  'claude-sonnet-4-5': {
    inputPrice: 3,
    outputPrice: 15,
    inputPriceHigh: 6,
    outputPriceHigh: 22.5,
  },
  'claude-sonnet-4-0': {
    inputPrice: 3,
    outputPrice: 15,
    inputPriceHigh: 6,
    outputPriceHigh: 22.5,
  },
  'claude-haiku-4-5': { inputPrice: 1, outputPrice: 5 },
  'claude-opus-4-1': { inputPrice: 15, outputPrice: 75 },
  'claude-opus-4-0': { inputPrice: 15, outputPrice: 75 },
  'claude-opus-4-6': { inputPrice: 5, outputPrice: 25 },
  'claude-opus-4-7': { inputPrice: 5, outputPrice: 25 },
  'claude-opus-4-8': { inputPrice: 5, outputPrice: 25 },
  'claude-fable-5': { inputPrice: 10, outputPrice: 50 },
  'claude-opus-4-5': { inputPrice: 5, outputPrice: 25 },
  'claude-3-7-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-5-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-5-haiku': { inputPrice: 0.8, outputPrice: 4 },
  'claude-3-opus': { inputPrice: 15, outputPrice: 75 },
  'claude-3-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-3-haiku': { inputPrice: 0.25, outputPrice: 1.25 },
  'claude-opus': { inputPrice: 5, outputPrice: 25 },
  'claude-sonnet': { inputPrice: 3, outputPrice: 15 },
  'claude-haiku': { inputPrice: 1, outputPrice: 5 },

  'gpt-5.5': {
    inputPrice: 5,
    outputPrice: 30,
    inputPriceHigh: 10,
    outputPriceHigh: 45,
  },
  'gpt-5.4': {
    inputPrice: 2.5,
    outputPrice: 15,
    inputPriceHigh: 5,
    outputPriceHigh: 22.5,
  },
  'gpt-5.4-pro': {
    inputPrice: 30,
    outputPrice: 180,
    inputPriceHigh: 60,
    outputPriceHigh: 270,
  },
  'gpt-5.4-mini': { inputPrice: 0.75, outputPrice: 4.5 },
  'gpt-5.4-nano': { inputPrice: 0.2, outputPrice: 1.25 },
  'gpt-5.3': { inputPrice: 1.75, outputPrice: 14 },
  'gpt-5.3-codex': { inputPrice: 1.75, outputPrice: 14 },
  'gpt-5.3-codex-spark': { inputPrice: 1.75, outputPrice: 14 },
  'gpt-5.2': { inputPrice: 1.75, outputPrice: 14 },
  'gpt-5.2-chat-latest': { inputPrice: 1.75, outputPrice: 14 },
  'gpt-5.2-pro': { inputPrice: 21, outputPrice: 168 },
  'gpt-5.1': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5.1-chat-latest': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5.1-codex-max': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5.1-codex': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5.1-codex-mini': { inputPrice: 0.25, outputPrice: 2 },
  'gpt-5': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5-chat-latest': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5-codex': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5-search-api': { inputPrice: 1.25, outputPrice: 10 },
  'gpt-5-mini': { inputPrice: 0.25, outputPrice: 2 },
  'gpt-5-nano': { inputPrice: 0.05, outputPrice: 0.4 },
  'gpt-5-pro': { inputPrice: 15, outputPrice: 120 },
  'gpt-4.1': { inputPrice: 2, outputPrice: 8 },
  'gpt-4.1-mini': { inputPrice: 0.4, outputPrice: 1.6 },
  'gpt-4.1-nano': { inputPrice: 0.1, outputPrice: 0.4 },
  'gpt-4o': { inputPrice: 2.5, outputPrice: 10 },
  'gpt-4o-2024-05-13': { inputPrice: 5, outputPrice: 15 },
  'gpt-4o-legacy': { inputPrice: 5, outputPrice: 15 },
  'gpt-4o-mini': { inputPrice: 0.15, outputPrice: 0.6 },
  'gpt-4o-search-preview': { inputPrice: 2.5, outputPrice: 10 },
  'gpt-4o-mini-search-preview': { inputPrice: 0.15, outputPrice: 0.6 },
  'gpt-4-turbo': { inputPrice: 10, outputPrice: 30 },
  'gpt-4': { inputPrice: 30, outputPrice: 60 },
  'gpt-4-32k': { inputPrice: 60, outputPrice: 120 },
  'gpt-3.5-turbo': { inputPrice: 0.5, outputPrice: 1.5 },
  'gpt-3.5-legacy': { inputPrice: 1.5, outputPrice: 2 },
  'gpt-3.5-16k': { inputPrice: 3, outputPrice: 4 },
  'gpt-realtime': { inputPrice: 4, outputPrice: 16 },
  'gpt-realtime-mini': { inputPrice: 0.6, outputPrice: 2.4 },
  'gpt-4o-realtime-preview': { inputPrice: 5, outputPrice: 20 },
  'gpt-4o-mini-realtime-preview': { inputPrice: 0.6, outputPrice: 2.4 },
  'gpt-audio': { inputPrice: 2.5, outputPrice: 10 },
  'gpt-audio-mini': { inputPrice: 0.6, outputPrice: 2.4 },
  'gpt-4o-audio-preview': { inputPrice: 2.5, outputPrice: 10 },
  'gpt-4o-mini-audio-preview': { inputPrice: 0.15, outputPrice: 0.6 },
  'gpt-image-1.5': { inputPrice: 5, outputPrice: 10 },
  'chatgpt-image-latest': { inputPrice: 5, outputPrice: 10 },
  'gpt-image-1': { inputPrice: 5, outputPrice: 0 },
  'gpt-image-1-mini': { inputPrice: 2, outputPrice: 0 },
  'gpt-oss-20b': { inputPrice: 0.03, outputPrice: 0.14, cacheReadPrice: 0.02 },
  'gpt-oss-120b': { inputPrice: 0.039, outputPrice: 0.18, cacheReadPrice: 0.055 },
  'gpt-oss-120b:exacto': { inputPrice: 0.039, outputPrice: 0.19, cacheReadPrice: 0.04 },
  'gpt-oss-safeguard-20b': { inputPrice: 0.075, outputPrice: 0.3, cacheReadPrice: 0.037 },

  'gemini-3.5-flash': {
    inputPrice: 1.5,
    outputPrice: 9,
    cacheReadPrice: 0.15,
  },
  'gemini-3-5-flash': {
    inputPrice: 1.5,
    outputPrice: 9,
    cacheReadPrice: 0.15,
  },
  'gemini-3.1-pro': {
    inputPrice: 2,
    outputPrice: 12,
    cacheReadPrice: 0.2,
    inputPriceHigh: 4,
    outputPriceHigh: 18,
    cacheReadPriceHigh: 0.4,
  },
  'gemini-3-pro': {
    inputPrice: 2,
    outputPrice: 12,
    inputPriceHigh: 4,
    outputPriceHigh: 18,
  },
  'gemini-3-flash': { inputPrice: 0.5, outputPrice: 3 },
  'gemini-3.1-flash-lite': { inputPrice: 0.25, outputPrice: 1.5 },
  'gemini-2.5-pro': {
    inputPrice: 1.25,
    outputPrice: 10,
    inputPriceHigh: 2.5,
    outputPriceHigh: 15,
  },
  'gemini-2.5-flash': { inputPrice: 0.3, outputPrice: 2.5 },
  'gemini-2.5-flash-lite': { inputPrice: 0.1, outputPrice: 0.4 },
  'gemini-2.0-flash': { inputPrice: 0.1, outputPrice: 0.4 },
  'gemini-2.0-flash-lite': { inputPrice: 0.075, outputPrice: 0.3 },
  'gemini-1.5-pro': { inputPrice: 1.25, outputPrice: 5 },
  'gemini-1.5-flash': { inputPrice: 0.2, outputPrice: 0.6 },
};

const modelAliases: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-1-20250805': 'claude-opus-4-1',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-0',
  'claude-opus-4-20250514': 'claude-opus-4-0',
  'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet',
  'claude-3-7-sonnet-latest': 'claude-3-7-sonnet',
  'claude-3-5-sonnet-20241022': 'claude-3-5-sonnet',
  'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet',
  'claude-3-5-sonnet-latest': 'claude-3-5-sonnet',
  'claude-3-5-haiku-20241022': 'claude-3-5-haiku',
  'claude-3-5-haiku-latest': 'claude-3-5-haiku',
  'claude-3-opus-20240229': 'claude-3-opus',
  'claude-3-opus-latest': 'claude-3-opus',
  'claude-3-sonnet-20240229': 'claude-3-sonnet',
  'claude-3-sonnet-latest': 'claude-3-sonnet',
  'claude-3-haiku-20240307': 'claude-3-haiku',
  'claude-3-haiku-latest': 'claude-3-haiku',
  'gpt-5.1': 'gpt-5',
  'gpt-5.1-chat-latest': 'gpt-5',
  'gpt-5-chat-latest': 'gpt-5',
  'gpt-5.1-codex': 'gpt-5',
  'gpt-5-codex': 'gpt-5',
  'gpt-5.1-codex-mini': 'gpt-5-mini',
  'gpt-5-search-api': 'gpt-5',
  'gpt-4o-2024-05-13': 'gpt-4o-legacy',
  'chatgpt-4o-latest': 'gpt-4o-legacy',
  'gpt-4o-mini-search-preview': 'gpt-4o-mini',
  'gpt-4o-search-preview': 'gpt-4o',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo',
  'gpt-4-1106-preview': 'gpt-4-turbo',
  'gpt-4-1106-vision-preview': 'gpt-4-turbo',
  'gpt-4-0613': 'gpt-4',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0613': 'gpt-4-32k',
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-1106': 'gpt-3.5-legacy',
  'gpt-3.5-turbo-0613': 'gpt-3.5-legacy',
  'gpt-3.5-0301': 'gpt-3.5-legacy',
  'gpt-3.5-turbo-instruct': 'gpt-3.5-legacy',
  'gpt-3.5-turbo-16k-0613': 'gpt-3.5-16k',
  'gemini-claude-opus-4-6-thinking': 'claude-opus-4-6',
  'gemini-claude-opus-4-5-thinking': 'claude-opus-4-5',
  'gemini-claude-sonnet-4-5-thinking': 'claude-sonnet-4-5',
  'gemini-claude-sonnet-4-5': 'claude-sonnet-4-5',
};

const fuzzyPrefixes = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-6',
  'claude-opus-4-5',
  'claude-opus-4-1',
  'claude-sonnet-4-0',
  'claude-opus-4-0',
  'claude-3-7-sonnet',
  'claude-3-5-sonnet',
  'claude-3-5-haiku',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-opus',
  'claude-sonnet',
  'claude-haiku',
  'gemini-3.5-flash',
  'gemini-3-5-flash',
  'gemini-3.1-pro',
  'gemini-3.1-flash-lite',
  'gemini-3-pro',
  'gemini-3-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gpt-oss-safeguard-20b',
  'gpt-oss-120b:exacto',
  'gpt-oss-120b',
  'gpt-oss-20b',
  'gpt-image-1.5',
  'gpt-image-1-mini',
  'gpt-image-1',
  'gpt-audio-mini',
  'gpt-audio',
  'gpt-realtime-mini',
  'gpt-realtime',
  'gpt-5-pro',
  'gpt-5-nano',
  'gpt-5-mini',
  'gpt-5.4-pro',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.4',
  'gpt-5',
  'gpt-4.1-nano',
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-4o-legacy',
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4-32k',
  'gpt-4',
  'gpt-3.5-legacy',
  'gpt-3.5-16k',
  'gpt-3.5-turbo',
  'chatgpt-image-latest',
];

function toSafeTokenCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveModelPricing(model: string): { key: string; pricing: ModelPricing } | null {
  const lowerModel = String(model ?? '').trim().toLowerCase();
  if (!lowerModel) {
    return null;
  }

  const aliased = modelAliases[lowerModel] ?? lowerModel;
  const exact = modelPricing[aliased];
  if (exact) {
    return { key: aliased, pricing: exact };
  }

  const prefix = fuzzyPrefixes.find((item) => lowerModel.startsWith(item));
  if (!prefix) {
    return null;
  }

  const fuzzyPricing = modelPricing[prefix];
  return fuzzyPricing ? { key: prefix, pricing: fuzzyPricing } : null;
}

function getTierThreshold(model: string): number {
  return model.startsWith('gpt-5.5') || model.startsWith('gpt-5.4')
    ? GPT_5_4_TIER_THRESHOLD
    : GEMINI_LONG_CONTEXT_THRESHOLD;
}

function getOpenAICacheMultiplier(model: string): number {
  if (model.startsWith('gpt-5')) {
    return 0.1;
  }
  if (model.startsWith('gpt-4.1')) {
    return 0.25;
  }
  return 0.5;
}

export function calculateModelCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  options: CostCalculationOptions = {}
): number {
  const resolved = resolveModelPricing(model);
  if (!resolved) {
    return 0;
  }

  const input = toSafeTokenCount(inputTokens);
  const output = toSafeTokenCount(outputTokens);
  const cacheRead = toSafeTokenCount(cacheReadTokens);
  const pricing = resolved.pricing;
  const applyLongContextTier = options.applyLongContextTier ?? true;
  const useHighPricing =
    applyLongContextTier &&
    pricing.inputPriceHigh !== undefined &&
    pricing.outputPriceHigh !== undefined &&
    input > getTierThreshold(resolved.key);
  const inputPrice = useHighPricing ? pricing.inputPriceHigh ?? pricing.inputPrice : pricing.inputPrice;
  const outputPrice = useHighPricing ? pricing.outputPriceHigh ?? pricing.outputPrice : pricing.outputPrice;
  const explicitCacheReadPrice = useHighPricing && pricing.cacheReadPriceHigh !== undefined
    ? pricing.cacheReadPriceHigh
    : pricing.cacheReadPrice;
  const cacheReadPrice = explicitCacheReadPrice ?? (
    resolved.key.startsWith('gpt-')
      ? inputPrice * getOpenAICacheMultiplier(resolved.key)
      : inputPrice * CLAUDE_CACHE_READ_MULTIPLIER
  );

  return (
    input * inputPrice +
    output * outputPrice +
    cacheRead * cacheReadPrice
  ) / TOKENS_PER_MILLION;
}
