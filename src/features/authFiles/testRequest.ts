import type { ApiCallRequest, ApiCallResult } from '@/services/api/apiCall';
import type { AuthFileItem } from '@/types';

const CODEX_OAUTH_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages?beta=true';
const KIMI_CHAT_URL = 'https://api.kimi.com/coding/v1/chat/completions';
const XAI_OAUTH_RESPONSES_URL = 'https://cli-chat-proxy.grok.com/v1/responses';
const XAI_API_RESPONSES_URL = 'https://api.x.ai/v1/responses';
const ANTIGRAVITY_GENERATE_URL =
  'https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent';
const GEMINI_CLI_GENERATE_URL = 'https://cloudcode-pa.googleapis.com/v1internal:generateContent';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const QWEN_API_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
const IFLOW_API_BASE_URL = 'https://apis.iflow.cn/v1';

export const DEFAULT_AUTH_FILE_TEST_PROMPT =
  '请从1到355之间随机选择一个数字，只输出这个数字，不要有任何其他内容。';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readFirstString = (file: AuthFileItem, ...keys: string[]): string => {
  for (const key of keys) {
    const value = readString(file[key]);
    if (value) return value;
  }
  return '';
};

const readAuthIndex = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return readString(value);
};

const normalizeProvider = (file: AuthFileItem): string =>
  readString(file.type ?? file.provider).toLowerCase();

const isApiKeyCredential = (file: AuthFileItem): boolean => {
  const accountType = readFirstString(file, 'account_type', 'accountType').toLowerCase();
  const usingApi = file.using_api ?? file.usingApi;
  return (
    accountType === 'api_key' ||
    accountType === 'apikey' ||
    usingApi === true ||
    readString(usingApi).toLowerCase() === 'true'
  );
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const appendEndpoint = (baseURL: string, endpoint: string): string => {
  const base = stripTrailingSlash(baseURL);
  if (endpoint.startsWith('/v1/') && base.endsWith('/v1')) {
    return `${base}${endpoint.slice(3)}`;
  }
  return base.endsWith(endpoint) ? base : `${base}${endpoint}`;
};

const jsonRequest = (
  authIndex: string,
  url: string,
  header: Record<string, string>,
  data: Record<string, unknown>
): ApiCallRequest => ({
  authIndex,
  method: 'POST',
  url,
  header: { 'Content-Type': 'application/json', ...header },
  data: JSON.stringify(data),
});

const bearerHeaders = (accept = 'application/json'): Record<string, string> => ({
  Authorization: 'Bearer $TOKEN$',
  Accept: accept,
});

const openAIChatRequest = (
  authIndex: string,
  url: string,
  model: string,
  content: string,
  header: Record<string, string> = bearerHeaders()
): ApiCallRequest =>
  jsonRequest(authIndex, url, header, {
    model,
    messages: [{ role: 'user', content }],
    stream: false,
    max_tokens: 32,
  });

const geminiPayload = (content: string): Record<string, unknown> => ({
  contents: [{ role: 'user', parts: [{ text: content }] }],
  generationConfig: { maxOutputTokens: 32 },
});

const cloudCodePayload = (
  file: AuthFileItem,
  model: string,
  content: string,
  userAgent: 'antigravity' | 'gemini-cli'
): Record<string, unknown> => {
  const project = readFirstString(file, 'project_id', 'projectId', 'project');
  const data: Record<string, unknown> = {
    model,
    userAgent,
    requestType: 'agent',
    requestId: `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    request: geminiPayload(content),
  };
  if (project) data.project = project;
  return data;
};

const readCodexAccountId = (file: AuthFileItem): string => {
  const direct = readString(file.chatgpt_account_id);
  if (direct) return direct;

  const tokenClaims = file.id_token;
  return isRecord(tokenClaims) ? readString(tokenClaims.chatgpt_account_id) : '';
};

function buildCodexRequest(
  file: AuthFileItem,
  authIndex: string,
  model: string,
  content: string
): ApiCallRequest {
  const apiKey = isApiKeyCredential(file);
  const baseURL = readFirstString(file, 'base_url', 'baseUrl');
  const url = baseURL
    ? appendEndpoint(baseURL, '/responses')
    : apiKey
      ? OPENAI_RESPONSES_URL
      : CODEX_OAUTH_RESPONSES_URL;
  const stream = !apiKey;
  const header: Record<string, string> = {
    ...bearerHeaders(stream ? 'text/event-stream' : 'application/json'),
    Originator: 'codex-tui',
    'User-Agent': 'codex-tui',
  };
  const accountId = readCodexAccountId(file);
  if (!apiKey && accountId) header['Chatgpt-Account-Id'] = accountId;

  return jsonRequest(authIndex, url, header, {
    model,
    instructions: '',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: content }],
      },
    ],
    // ChatGPT's Codex endpoint only exposes SSE. /api-call buffers it, so the UI still
    // receives and renders one complete response instead of a streamed response.
    stream,
    store: false,
  });
}

function buildClaudeRequest(
  file: AuthFileItem,
  authIndex: string,
  model: string,
  content: string
): ApiCallRequest {
  const apiKey = isApiKeyCredential(file);
  const baseURL = readFirstString(file, 'base_url', 'baseUrl');
  const header: Record<string, string> = {
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
  };
  header[apiKey ? 'x-api-key' : 'Authorization'] = apiKey ? '$TOKEN$' : 'Bearer $TOKEN$';
  if (!apiKey) header['anthropic-beta'] = 'oauth-2025-04-20';

  return jsonRequest(
    authIndex,
    baseURL ? appendEndpoint(baseURL, '/v1/messages?beta=true') : CLAUDE_MESSAGES_URL,
    header,
    {
      model,
      messages: [{ role: 'user', content }],
      max_tokens: 32,
      stream: false,
    }
  );
}

function buildGeminiApiRequest(
  file: AuthFileItem,
  authIndex: string,
  model: string,
  content: string
): ApiCallRequest {
  const baseURL = readFirstString(file, 'base_url', 'baseUrl') || GEMINI_API_BASE_URL;
  const url = `${stripTrailingSlash(baseURL)}/models/${encodeURIComponent(model)}:generateContent`;
  return jsonRequest(
    authIndex,
    url,
    { 'x-goog-api-key': '$TOKEN$', Accept: 'application/json' },
    geminiPayload(content)
  );
}

function buildVertexRequest(
  file: AuthFileItem,
  authIndex: string,
  model: string,
  content: string
): ApiCallRequest {
  const project = readFirstString(file, 'project_id', 'projectId', 'project');
  if (!project) throw new Error('Vertex credential missing project_id');
  const location = readFirstString(file, 'location', 'region') || 'us-central1';
  const baseURL =
    readFirstString(file, 'base_url', 'baseUrl') || `https://${location}-aiplatform.googleapis.com`;
  const url = `${stripTrailingSlash(baseURL)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  return jsonRequest(authIndex, url, bearerHeaders(), geminiPayload(content));
}

function buildXAIRequest(
  file: AuthFileItem,
  authIndex: string,
  model: string,
  content: string
): ApiCallRequest {
  const apiKey = isApiKeyCredential(file);
  const baseURL = readFirstString(file, 'base_url', 'baseUrl');
  const url = baseURL
    ? appendEndpoint(baseURL, '/responses')
    : apiKey
      ? XAI_API_RESPONSES_URL
      : XAI_OAUTH_RESPONSES_URL;
  const stream = !apiKey;
  const header: Record<string, string> = bearerHeaders(
    stream ? 'text/event-stream' : 'application/json'
  );
  if (!apiKey) {
    header['X-XAI-Token-Auth'] = 'xai-grok-cli';
    header['x-grok-client-version'] = '0.2.93';
    header['User-Agent'] = 'xai-grok-workspace/0.2.93';
  }
  return jsonRequest(authIndex, url, header, {
    model,
    input: content,
    stream,
    store: false,
  });
}

export function buildAuthFileTestRequest(
  file: AuthFileItem,
  model: string,
  content: string,
  modelProvider = ''
): ApiCallRequest {
  const authIndex = readAuthIndex(file.auth_index ?? file.authIndex);
  if (!authIndex) throw new Error('Auth file missing auth_index');

  const normalizedModel = model.trim();
  if (!normalizedModel) throw new Error('Model is required');

  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error('Content is required');

  const fileProvider = normalizeProvider(file);
  const provider =
    fileProvider && fileProvider !== 'unknown' && fileProvider !== 'empty'
      ? fileProvider
      : modelProvider.trim().toLowerCase();
  switch (provider) {
    case 'codex':
      return buildCodexRequest(file, authIndex, normalizedModel, normalizedContent);
    case 'claude':
    case 'anthropic':
      return buildClaudeRequest(file, authIndex, normalizedModel, normalizedContent);
    case 'kimi':
      return openAIChatRequest(authIndex, KIMI_CHAT_URL, normalizedModel, normalizedContent, {
        ...bearerHeaders(),
        'User-Agent': 'CLIProxyAPI',
        'X-Msh-Platform': 'CLIProxyAPI',
        'X-Msh-Version': 'management-center',
        'X-Msh-Device-Name': 'management-center',
        'X-Msh-Device-Model': 'web',
        'X-Msh-Device-Id': readFirstString(file, 'device_id', 'deviceId') || 'management-center',
      });
    case 'qwen': {
      const baseURL = readFirstString(file, 'base_url', 'baseUrl') || QWEN_API_BASE_URL;
      return openAIChatRequest(
        authIndex,
        appendEndpoint(baseURL, '/chat/completions'),
        normalizedModel,
        normalizedContent
      );
    }
    case 'iflow': {
      const baseURL = readFirstString(file, 'base_url', 'baseUrl') || IFLOW_API_BASE_URL;
      return openAIChatRequest(
        authIndex,
        appendEndpoint(baseURL, '/chat/completions'),
        normalizedModel,
        normalizedContent
      );
    }
    case 'gemini':
    case 'aistudio':
      return buildGeminiApiRequest(file, authIndex, normalizedModel, normalizedContent);
    case 'gemini-cli': {
      const baseURL = readFirstString(file, 'base_url', 'baseUrl');
      return jsonRequest(
        authIndex,
        baseURL ? appendEndpoint(baseURL, '/v1internal:generateContent') : GEMINI_CLI_GENERATE_URL,
        { ...bearerHeaders(), 'User-Agent': 'gemini-cli' },
        cloudCodePayload(file, normalizedModel, normalizedContent, 'gemini-cli')
      );
    }
    case 'antigravity': {
      const baseURL = readFirstString(file, 'base_url', 'baseUrl');
      return jsonRequest(
        authIndex,
        baseURL ? appendEndpoint(baseURL, '/v1internal:generateContent') : ANTIGRAVITY_GENERATE_URL,
        { ...bearerHeaders(), 'User-Agent': 'antigravity' },
        cloudCodePayload(file, normalizedModel, normalizedContent, 'antigravity')
      );
    }
    case 'vertex':
      return buildVertexRequest(file, authIndex, normalizedModel, normalizedContent);
    case 'xai':
    case 'grok':
      return buildXAIRequest(file, authIndex, normalizedModel, normalizedContent);
    default: {
      const baseURL = readFirstString(file, 'base_url', 'baseUrl');
      if (!baseURL) throw new Error(`Unsupported credential type: ${provider || 'unknown'}`);
      return openAIChatRequest(
        authIndex,
        appendEndpoint(baseURL, '/chat/completions'),
        normalizedModel,
        normalizedContent
      );
    }
  }
}

const collectTextParts = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => {
    if (typeof part === 'string') return part.trim() ? [part.trim()] : [];
    if (!isRecord(part)) return [];
    const text = readString(part.text);
    return text ? [text] : [];
  });
};

const extractResponseText = (body: unknown): string => {
  if (!isRecord(body)) return '';

  const outputText = readString(body.output_text);
  if (outputText) return outputText;

  const choices = body.choices;
  if (Array.isArray(choices)) {
    const texts = choices.flatMap((choice) => {
      if (!isRecord(choice) || !isRecord(choice.message)) return [];
      const content = choice.message.content;
      if (typeof content === 'string') return content.trim() ? [content.trim()] : [];
      return collectTextParts(content);
    });
    if (texts.length > 0) return texts.join('\n');
  }

  const anthropicText = collectTextParts(body.content);
  if (anthropicText.length > 0) return anthropicText.join('\n');

  const candidates = body.candidates;
  if (Array.isArray(candidates)) {
    const texts = candidates.flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content)) return [];
      return collectTextParts(candidate.content.parts);
    });
    if (texts.length > 0) return texts.join('\n');
  }

  const output = body.output;
  if (Array.isArray(output)) {
    const texts = output.flatMap((item) => (isRecord(item) ? collectTextParts(item.content) : []));
    if (texts.length > 0) return texts.join('\n');
  }

  return isRecord(body.response) ? extractResponseText(body.response) : '';
};

export function formatAuthFileTestResponse(result: ApiCallResult): string {
  const responseText = extractResponseText(result.body);
  if (responseText) return responseText;

  let completedResponse: unknown = null;
  const outputTexts: string[] = [];
  for (const line of result.bodyText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;

    try {
      const event = JSON.parse(data) as unknown;
      if (!isRecord(event)) continue;
      if (event.type === 'response.completed' && isRecord(event.response)) {
        completedResponse = event.response;
      }
      if (event.type === 'response.output_text.done') {
        const text = readString(event.text);
        if (text) outputTexts.push(text);
      }
    } catch {
      // Malformed SSE is returned verbatim below.
    }
  }

  const completedText = extractResponseText(completedResponse);
  if (completedText) return completedText;
  if (outputTexts.length > 0) return outputTexts.join('\n');
  if (result.body !== null && typeof result.body === 'object') {
    return JSON.stringify(result.body, null, 2);
  }
  return result.bodyText || '';
}
