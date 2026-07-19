export type ProviderRequestBrand = 'openai' | 'claude' | 'gemini' | 'codex';

export interface ProviderHeaderInput {
  key: string;
  value: string;
}

export interface ProviderModelInput {
  name: string;
  alias?: string;
}

export interface ProviderApiKeyEntryInput {
  apiKey?: string;
  existingApiKey?: string;
  proxyUrl?: string;
  authIndex?: string;
}

export interface ProviderApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
}

export type ProviderConnectivityFailureReason =
  | 'base-url-required'
  | 'endpoint-invalid'
  | 'api-key-required'
  | 'model-required';

export type ProviderConnectivityBuildResult =
  | {
      ok: true;
      request: ProviderApiCallRequest;
      timeoutMs: number;
    }
  | {
      ok: false;
      reason: ProviderConnectivityFailureReason;
    };

export interface ProviderConnectivityRequestInput {
  brand: ProviderRequestBrand;
  baseUrl?: string;
  headers?: ProviderHeaderInput[] | Record<string, string | undefined | null>;
  models?: ProviderModelInput[];
  testModel?: string;
  apiKey?: string;
  fallbackApiKey?: string;
  apiKeyEntry?: ProviderApiKeyEntryInput;
  authIndex?: string;
}

export interface ProviderModelDiscoveryRequestInput {
  brand: ProviderRequestBrand;
  baseUrl?: string;
  headers?: ProviderHeaderInput[] | Record<string, string | undefined | null>;
  apiKey?: string;
  fallbackApiKey?: string;
  apiKeyEntries?: ProviderApiKeyEntryInput[];
  authIndex?: string;
}

export interface ProviderModelDiscoveryRequest {
  brand: ProviderRequestBrand;
  endpoint: string;
  apiKey?: string;
  headers: Record<string, string>;
  authIndex?: string;
  retryWithoutAuth: boolean;
}

export const PROVIDER_TEST_TIMEOUT_MS = 30_000;

const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

export const buildProviderHeaderObject = (
  input?: ProviderHeaderInput[] | Record<string, string | undefined | null>
): Record<string, string> => {
  if (!input) return {};

  if (Array.isArray(input)) {
    return input.reduce<Record<string, string>>((acc, item) => {
      const key = String(item?.key ?? '').trim();
      const value = String(item?.value ?? '').trim();
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  return Object.entries(input).reduce<Record<string, string>>((acc, [rawKey, rawValue]) => {
    const key = rawKey.trim();
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (key && value !== undefined && value !== null && value !== '') {
      acc[key] = String(value);
    }
    return acc;
  }, {});
};

export const hasProviderHeader = (
  headers: Record<string, unknown> | null | undefined,
  name: string
): boolean => {
  if (!headers) return false;
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const resolveHeaderValue = (headers: Record<string, string>, name: string): string => {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry ? String(entry[1] ?? '').trim() : '';
};

const resolveBearerTokenFromAuthorization = (headers: Record<string, string>): string => {
  const value = resolveHeaderValue(headers, 'authorization');
  if (!value) return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const firstTrimmed = (...values: Array<string | undefined | null>) => {
  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
};

export const pickProviderTestModel = (
  testModel?: string,
  models: ProviderModelInput[] = []
): string => {
  const explicit = String(testModel ?? '').trim();
  if (explicit) return explicit;
  for (const model of models) {
    const name = String(model?.name ?? '').trim();
    if (name) return name;
  }
  return '';
};

const ensureHttpScheme = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `http://${value}`;

export const normalizeOpenAIBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) return '';
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, '');
  trimmed = trimmed.replace(/\/+$/g, '');
  return ensureHttpScheme(trimmed);
};

export const normalizeClaudeBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) return DEFAULT_CLAUDE_BASE_URL;
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, '');
  trimmed = trimmed.replace(/\/+$/g, '');
  return ensureHttpScheme(trimmed);
};

const normalizeGeminiBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) return DEFAULT_GEMINI_BASE_URL;
  trimmed = trimmed.replace(/\/+$/g, '');
  return ensureHttpScheme(trimmed);
};

export const buildOpenAIModelsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeOpenAIBaseUrl(baseUrl);
  return trimmed ? `${trimmed}/models` : '';
};

export const buildV1ModelsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeOpenAIBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/v1\/models$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
};

export const buildOpenAIChatCompletionsEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeOpenAIBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
};

export const buildCodexResponsesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeOpenAIBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/v1\/responses$/i.test(trimmed)) return trimmed;
  if (/\/v1\/models$/i.test(trimmed)) return trimmed.replace(/\/models$/i, '/responses');
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/responses`;
  return `${trimmed}/v1/responses`;
};

export const buildClaudeMessagesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeClaudeBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (/\/v1\/messages$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
};

const buildGeminiModelResource = (model: string): string => {
  const trimmed = String(model || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/:generateContent$/i, '');
  if (!trimmed) return '';
  if (/^(models|tunedModels)\//i.test(trimmed)) {
    return trimmed.split('/').map(encodeURIComponent).join('/');
  }
  return `models/${encodeURIComponent(trimmed)}`;
};

export const buildGeminiGenerateContentEndpoint = (baseUrl: string, model: string): string => {
  const resource = buildGeminiModelResource(model);
  if (!resource) return '';
  let root = normalizeGeminiBaseUrl(baseUrl).replace(/\/+$/g, '');
  if (/:generateContent$/i.test(root)) return root;
  if (/\/v1beta\/models$/i.test(root)) {
    root = root.replace(/\/models$/i, '');
  } else if (!/\/v1beta$/i.test(root)) {
    root = root.replace(/\/v1beta(?:\/.*)?$/i, '');
    root = `${root}/v1beta`;
  }
  return `${root}/${resource}:generateContent`;
};

const buildOpenAIConnectivityRequest = (
  input: ProviderConnectivityRequestInput
): ProviderConnectivityBuildResult => {
  const baseUrl = String(input.baseUrl ?? '').trim();
  if (!baseUrl) return { ok: false, reason: 'base-url-required' };

  const endpoint = buildOpenAIChatCompletionsEndpoint(baseUrl);
  if (!endpoint) return { ok: false, reason: 'endpoint-invalid' };

  const entryKey = firstTrimmed(input.apiKeyEntry?.apiKey, input.apiKeyEntry?.existingApiKey);
  const authIndex = firstTrimmed(input.apiKeyEntry?.authIndex, input.authIndex) || undefined;
  if (!entryKey && !authIndex) return { ok: false, reason: 'api-key-required' };

  const model = pickProviderTestModel(input.testModel, input.models);
  if (!model) return { ok: false, reason: 'model-required' };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildProviderHeaderObject(input.headers),
  };
  if (!hasProviderHeader(headers, 'authorization')) {
    headers.Authorization = entryKey ? `Bearer ${entryKey}` : 'Bearer $TOKEN$';
  }

  return {
    ok: true,
    timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
    request: {
      authIndex,
      method: 'POST',
      url: endpoint,
      header: headers,
      data: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        max_tokens: 5,
      }),
    },
  };
};

const buildCodexConnectivityRequest = (
  input: ProviderConnectivityRequestInput
): ProviderConnectivityBuildResult => {
  const model = pickProviderTestModel(input.testModel, input.models);
  if (!model) return { ok: false, reason: 'model-required' };

  const endpoint = buildCodexResponsesEndpoint(input.baseUrl ?? '');
  if (!endpoint) return { ok: false, reason: 'endpoint-invalid' };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildProviderHeaderObject(input.headers),
  };
  const apiKey = firstTrimmed(input.apiKey, input.fallbackApiKey);
  const authIndex = firstTrimmed(input.authIndex) || undefined;
  const hasAuthHeader = hasProviderHeader(headers, 'authorization');
  if (!apiKey && !authIndex && !hasAuthHeader) {
    return { ok: false, reason: 'api-key-required' };
  }
  if (!hasAuthHeader) {
    headers.Authorization = apiKey ? `Bearer ${apiKey}` : 'Bearer $TOKEN$';
  }

  return {
    ok: true,
    timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
    request: {
      authIndex,
      method: 'POST',
      url: endpoint,
      header: headers,
      data: JSON.stringify({
        model,
        input: 'Hi',
        stream: false,
      }),
    },
  };
};

const buildGeminiConnectivityRequest = (
  input: ProviderConnectivityRequestInput
): ProviderConnectivityBuildResult => {
  const model = pickProviderTestModel(input.testModel, input.models);
  if (!model) return { ok: false, reason: 'model-required' };

  const endpoint = buildGeminiGenerateContentEndpoint(input.baseUrl ?? '', model);
  if (!endpoint) return { ok: false, reason: 'endpoint-invalid' };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildProviderHeaderObject(input.headers),
  };
  const apiKey = firstTrimmed(input.apiKey, input.fallbackApiKey);
  const authIndex = firstTrimmed(input.authIndex) || undefined;
  const hasApiKeyHeader = hasProviderHeader(headers, 'x-goog-api-key');
  if (!apiKey && !authIndex && !hasApiKeyHeader) {
    return { ok: false, reason: 'api-key-required' };
  }
  if (!hasApiKeyHeader) {
    headers['x-goog-api-key'] = apiKey || '$TOKEN$';
  }

  return {
    ok: true,
    timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
    request: {
      authIndex,
      method: 'POST',
      url: endpoint,
      header: headers,
      data: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 8 },
      }),
    },
  };
};

const buildClaudeConnectivityRequest = (
  input: ProviderConnectivityRequestInput
): ProviderConnectivityBuildResult => {
  const model = pickProviderTestModel(input.testModel, input.models);
  if (!model) return { ok: false, reason: 'model-required' };

  const endpoint = buildClaudeMessagesEndpoint(input.baseUrl ?? '');
  if (!endpoint) return { ok: false, reason: 'endpoint-invalid' };

  const customHeaders = buildProviderHeaderObject(input.headers);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  const apiKey = firstTrimmed(
    input.apiKey,
    input.fallbackApiKey,
    resolveBearerTokenFromAuthorization(customHeaders)
  );
  const authIndex = firstTrimmed(input.authIndex) || undefined;
  const hasApiKeyHeader = hasProviderHeader(headers, 'x-api-key');
  if (!apiKey && !authIndex && !hasApiKeyHeader) {
    return { ok: false, reason: 'api-key-required' };
  }

  if (!hasProviderHeader(headers, 'anthropic-version')) {
    headers['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
  }
  if (!Object.prototype.hasOwnProperty.call(headers, 'Anthropic-Version')) {
    headers['Anthropic-Version'] = headers['anthropic-version'] ?? DEFAULT_ANTHROPIC_VERSION;
  }
  if (!hasApiKeyHeader) {
    headers['x-api-key'] = apiKey || '$TOKEN$';
  }
  if (!Object.prototype.hasOwnProperty.call(headers, 'X-Api-Key')) {
    headers['X-Api-Key'] = headers['x-api-key'];
  }

  return {
    ok: true,
    timeoutMs: PROVIDER_TEST_TIMEOUT_MS,
    request: {
      authIndex,
      method: 'POST',
      url: endpoint,
      header: headers,
      data: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    },
  };
};

export const buildProviderConnectivityRequest = (
  input: ProviderConnectivityRequestInput
): ProviderConnectivityBuildResult => {
  if (input.brand === 'openai') return buildOpenAIConnectivityRequest(input);
  if (input.brand === 'codex') return buildCodexConnectivityRequest(input);
  if (input.brand === 'gemini') return buildGeminiConnectivityRequest(input);
  return buildClaudeConnectivityRequest(input);
};

export const buildProviderModelDiscoveryRequest = (
  input: ProviderModelDiscoveryRequestInput
): ProviderModelDiscoveryRequest => {
  const headers = buildProviderHeaderObject(input.headers);
  const authIndex = firstTrimmed(input.authIndex) || undefined;
  const apiKey = firstTrimmed(input.apiKey, input.fallbackApiKey);

  if (input.brand === 'openai') {
    const firstEntry = (input.apiKeyEntries ?? []).find(
      (entry) => firstTrimmed(entry.apiKey, entry.existingApiKey) || firstTrimmed(entry.authIndex)
    );
    const entryKey = firstTrimmed(firstEntry?.apiKey, firstEntry?.existingApiKey);
    const entryAuthIndex = firstTrimmed(firstEntry?.authIndex, authIndex) || undefined;
    return {
      brand: input.brand,
      endpoint: buildOpenAIModelsEndpoint(input.baseUrl ?? ''),
      apiKey: hasProviderHeader(headers, 'authorization') ? undefined : entryKey || undefined,
      headers,
      authIndex: entryAuthIndex,
      retryWithoutAuth: true,
    };
  }

  if (input.brand === 'codex') {
    return {
      brand: input.brand,
      endpoint: buildV1ModelsEndpoint(input.baseUrl ?? ''),
      apiKey: hasProviderHeader(headers, 'authorization') ? undefined : apiKey || undefined,
      headers,
      authIndex,
      retryWithoutAuth: false,
    };
  }

  if (input.brand === 'gemini') {
    const hasApiKeyHeader = hasProviderHeader(headers, 'x-goog-api-key');
    return {
      brand: input.brand,
      endpoint: buildGeminiModelsEndpoint(input.baseUrl ?? ''),
      apiKey: hasApiKeyHeader ? undefined : apiKey || undefined,
      headers,
      authIndex,
      retryWithoutAuth: false,
    };
  }

  return {
    brand: input.brand,
    endpoint: buildClaudeModelsEndpoint(input.baseUrl ?? ''),
    apiKey: hasProviderHeader(headers, 'x-api-key') ? undefined : apiKey || undefined,
    headers,
    authIndex,
    retryWithoutAuth: false,
  };
};

export const buildClaudeModelsEndpoint = (baseUrl: string): string => {
  const fallback = normalizeClaudeBaseUrl(baseUrl);
  let trimmed = fallback.replace(/\/+$/g, '');
  trimmed = trimmed.replace(/\/v1\/models$/i, '');
  trimmed = trimmed.replace(/\/v1(?:\/.*)?$/i, '');
  return `${trimmed}/v1/models`;
};

export const buildGeminiModelsEndpoint = (baseUrl: string): string => {
  const fallback = normalizeGeminiBaseUrl(baseUrl);
  let trimmed = fallback.replace(/\/+$/g, '');
  trimmed = trimmed.replace(/\/v1beta\/models$/i, '');
  trimmed = trimmed.replace(/\/v1beta(?:\/.*)?$/i, '');
  return `${trimmed}/v1beta/models`;
};
