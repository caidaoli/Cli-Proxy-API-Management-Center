import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthFileTestRequest,
  DEFAULT_AUTH_FILE_TEST_PROMPT,
  formatAuthFileTestResponse,
} from '../src/features/authFiles/testRequest.ts';

const payloadOf = (request: ReturnType<typeof buildAuthFileTestRequest>) =>
  JSON.parse(request.data ?? '{}') as Record<string, unknown>;

test('Codex OAuth 测试绑定 auth_index，并在 api-call 缓冲上游 SSE 后返回', () => {
  const request = buildAuthFileTestRequest(
    {
      name: 'codex-user.json',
      type: 'codex',
      account_type: 'oauth',
      auth_index: 'auth-17',
      id_token: { chatgpt_account_id: 'account-42' },
    },
    'gpt-5.6',
    DEFAULT_AUTH_FILE_TEST_PROMPT
  );
  const payload = payloadOf(request);

  assert.equal(request.authIndex, 'auth-17');
  assert.equal(request.url, 'https://chatgpt.com/backend-api/codex/responses');
  assert.equal(request.header?.Authorization, 'Bearer $TOKEN$');
  assert.equal(request.header?.['Chatgpt-Account-Id'], 'account-42');
  assert.equal(payload.model, 'gpt-5.6');
  assert.deepEqual(payload.input, [
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: DEFAULT_AUTH_FILE_TEST_PROMPT }],
    },
  ]);
  assert.equal(payload.stream, true);
  assert.equal(request.header?.Accept, 'text/event-stream');
});

test('API Key 凭证使用供应商原生非流式协议', () => {
  const codex = buildAuthFileTestRequest(
    { name: 'codex-key', type: 'codex', account_type: 'api_key', auth_index: 1 },
    'gpt-5.6',
    'hi'
  );
  assert.equal(codex.url, 'https://api.openai.com/v1/responses');
  assert.equal(payloadOf(codex).stream, false);

  const claude = buildAuthFileTestRequest(
    { name: 'claude-key', type: 'claude', account_type: 'api_key', auth_index: 2 },
    'claude-sonnet-4-5',
    'hi'
  );
  assert.equal(claude.url, 'https://api.anthropic.com/v1/messages?beta=true');
  assert.equal(claude.header?.['x-api-key'], '$TOKEN$');
  assert.equal(claude.header?.Authorization, undefined);
  assert.equal(payloadOf(claude).stream, false);

  const claudeOAuth = buildAuthFileTestRequest(
    { name: 'claude-oauth', type: 'claude', account_type: 'oauth', auth_index: 22 },
    'claude-sonnet-4-5',
    'hi'
  );
  assert.equal(claudeOAuth.header?.Authorization, 'Bearer $TOKEN$');
  assert.equal(claudeOAuth.header?.['anthropic-beta'], 'oauth-2025-04-20');

  const xai = buildAuthFileTestRequest(
    { name: 'xai-key', type: 'xai', account_type: 'api_key', auth_index: 3 },
    'grok-4',
    'hi'
  );
  assert.equal(xai.url, 'https://api.x.ai/v1/responses');
  assert.equal(payloadOf(xai).stream, false);
});

test('OpenAI 兼容凭证使用 chat/completions 非流式协议', () => {
  for (const [type, expectedURL] of [
    ['kimi', 'https://api.kimi.com/coding/v1/chat/completions'],
    ['qwen', 'https://coding.dashscope.aliyuncs.com/v1/chat/completions'],
    ['iflow', 'https://apis.iflow.cn/v1/chat/completions'],
  ] as const) {
    const request = buildAuthFileTestRequest(
      { name: `${type}.json`, type, auth_index: type },
      'test-model',
      'hi'
    );
    const payload = payloadOf(request);
    assert.equal(request.url, expectedURL, type);
    assert.equal(payload.stream, false, type);
    assert.deepEqual(payload.messages, [{ role: 'user', content: 'hi' }], type);
  }
});

test('Gemini、Cloud Code 与 Vertex 凭证使用各自的 generateContent 协议', () => {
  const gemini = buildAuthFileTestRequest(
    { name: 'gemini.json', type: 'gemini', auth_index: 4 },
    'gemini 3',
    'hi'
  );
  assert.equal(
    gemini.url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini%203:generateContent'
  );
  assert.equal(gemini.header?.['x-goog-api-key'], '$TOKEN$');

  const aiStudio = buildAuthFileTestRequest(
    { name: 'aistudio.json', type: 'aistudio', auth_index: 44 },
    'gemini-2.5-flash',
    'hi'
  );
  assert.equal(aiStudio.header?.['x-goog-api-key'], '$TOKEN$');
  assert.equal(payloadOf(aiStudio).stream, undefined);

  const geminiCLI = buildAuthFileTestRequest(
    {
      name: 'gemini-cli.json',
      type: 'gemini-cli',
      auth_index: 45,
      project_id: 'project-g',
    },
    'gemini-2.5-pro',
    'hi'
  );
  assert.equal(geminiCLI.url, 'https://cloudcode-pa.googleapis.com/v1internal:generateContent');
  assert.equal(payloadOf(geminiCLI).userAgent, 'gemini-cli');

  const antigravity = buildAuthFileTestRequest(
    {
      name: 'antigravity.json',
      type: 'antigravity',
      auth_index: 5,
      project_id: 'project-a',
    },
    'gemini-3-pro',
    'hi'
  );
  const antigravityPayload = payloadOf(antigravity);
  assert.equal(
    antigravity.url,
    'https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent'
  );
  assert.equal(antigravityPayload.project, 'project-a');
  assert.equal(antigravityPayload.requestType, 'agent');
  assert.deepEqual((antigravityPayload.request as Record<string, unknown>).contents, [
    { role: 'user', parts: [{ text: 'hi' }] },
  ]);

  const vertex = buildAuthFileTestRequest(
    {
      name: 'vertex.json',
      type: 'vertex',
      auth_index: 6,
      project_id: 'project-v',
      location: 'asia-east1',
    },
    'gemini-2.5-pro',
    'hi'
  );
  assert.equal(
    vertex.url,
    'https://asia-east1-aiplatform.googleapis.com/v1/projects/project-v/locations/asia-east1/publishers/google/models/gemini-2.5-pro:generateContent'
  );
  assert.equal(vertex.header?.Authorization, 'Bearer $TOKEN$');
});

test('xAI OAuth 凭证使用 CLI Responses 协议并由 api-call 缓冲', () => {
  const request = buildAuthFileTestRequest(
    { name: 'xai-oauth.json', type: 'xai', account_type: 'oauth', auth_index: 7 },
    'grok-code-fast-1',
    'hi'
  );

  assert.equal(request.url, 'https://cli-chat-proxy.grok.com/v1/responses');
  assert.equal(request.header?.['X-XAI-Token-Auth'], 'xai-grok-cli');
  assert.equal(payloadOf(request).stream, true);
});

test('未知凭证可根据模型供应商回退，或使用自定义 OpenAI 兼容地址', () => {
  const inferred = buildAuthFileTestRequest(
    { name: 'runtime.json', type: 'unknown', auth_index: 8 },
    'claude-sonnet-4-5',
    'hi',
    'claude'
  );
  assert.equal(inferred.url, 'https://api.anthropic.com/v1/messages?beta=true');

  const custom = buildAuthFileTestRequest(
    {
      name: 'custom.json',
      type: 'unknown',
      auth_index: 9,
      base_url: 'https://example.test/v1',
    },
    'custom-model',
    'hi'
  );
  assert.equal(custom.url, 'https://example.test/v1/chat/completions');
  assert.equal(payloadOf(custom).stream, false);
});

test('测试结果归一化 Responses、Chat Completions、Claude 和 Gemini 文本', () => {
  const bodies = [
    {
      output: [{ type: 'message', content: [{ type: 'output_text', text: '173' }] }],
    },
    { choices: [{ message: { content: '173' } }] },
    { content: [{ type: 'text', text: '173' }] },
    { response: { candidates: [{ content: { parts: [{ text: '173' }] } }] } },
  ];

  for (const body of bodies) {
    assert.equal(
      formatAuthFileTestResponse({ statusCode: 200, header: {}, bodyText: '', body }),
      '173'
    );
  }
});

test('上游 SSE 在 api-call 完整返回后只提取最终文本', () => {
  const bodyText =
    'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"284"}\n\n' +
    'event: response.completed\ndata: {"type":"response.completed","response":{"output":[]}}\n';
  const text = formatAuthFileTestResponse({
    statusCode: 200,
    header: {},
    body: bodyText,
    bodyText,
  });

  assert.equal(text, '284');
});
