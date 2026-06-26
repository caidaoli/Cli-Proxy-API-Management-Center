import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const extractConstDeclaration = (source: string, name: string): string => {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf('\n\nconst ', start + 1);
  return source.slice(start, end === -1 ? source.length : end);
};

test('配置响应归一化只接受后端实际输出的 kebab-case 字段', () => {
  const source = readProjectFile('src/services/api/transformers.ts');
  const normalizeBoolean = extractConstDeclaration(source, 'normalizeBoolean');

  assert.doesNotMatch(normalizeBoolean, /typeof value === 'number'/);
  assert.doesNotMatch(normalizeBoolean, /typeof value === 'string'/);
  assert.doesNotMatch(normalizeBoolean, /return Boolean\(value\)/);

  assert.doesNotMatch(source, /record\?\.apiKey/);
  assert.doesNotMatch(source, /record\?\.key/);
  assert.doesNotMatch(source, /record\.proxyUrl/);
  assert.doesNotMatch(source, /record\?\.excludedModels/);
  assert.doesNotMatch(source, /record\?\.excluded_models/);
  assert.doesNotMatch(source, /cloakRaw\.strictMode|cloakRaw\.strict_mode/);
  assert.doesNotMatch(source, /provider\.baseUrl|provider\.id|provider\.testModel/);
  assert.doesNotMatch(source, /raw\.geminiApiKey|raw\.codexApiKey|raw\.claudeApiKey|raw\.vertexApiKey/);
  assert.doesNotMatch(source, /raw\.openaiCompatibility|raw\.openAICompatibility/);
  assert.doesNotMatch(source, /raw\.usageStatisticsEnabled|raw\.requestLog|raw\.loggingToFile/);
  assert.doesNotMatch(source, /raw\.wsAuth|raw\.forceModelPrefix|raw\.routingStrategy/);
});

test('配置响应归一化拒绝非对象响应', () => {
  const source = readProjectFile('src/services/api/transformers.ts');

  assert.match(source, /Invalid config response/);
  assert.doesNotMatch(source, /if \(!isRecord\(raw\)\) \{\s*return config;\s*\}/);
});

test('提供商保存逻辑不再保留 camelCase 或 snake_case 影子字段', () => {
  const source = readProjectFile('src/services/api/providers.ts');

  [
    'authIndex',
    'auth_index',
    'apiKey',
    'baseUrl',
    'base_url',
    'proxyUrl',
    'proxy_url',
    'excludedModels',
    'excluded_models',
    'apiKeyEntries',
    'api_key_entries',
    'apiKeys',
    'api_keys',
    'displayName',
    'display_name',
    'testModel',
    'test_model',
    'strictMode',
    'strict_mode',
    'sensitiveWords',
    'sensitive_words',
    'geminiApiKey',
    'geminiApiKeys',
    'codexApiKey',
    'codexApiKeys',
    'claudeApiKey',
    'claudeApiKeys',
    'vertexApiKey',
    'vertexApiKeys',
    'openaiCompatibility',
    'openAICompatibility',
  ].forEach((field) => {
    assert.equal(source.includes(`'${field}'`), false, field);
  });
});

test('单字段配置与 api-call 响应只读取后端固定字段名', () => {
  const configSource = readProjectFile('src/services/api/config.ts');
  const apiCallSource = readProjectFile('src/services/api/apiCall.ts');

  assert.doesNotMatch(configSource, /data\?\.logsMaxTotalSizeMb/);
  assert.doesNotMatch(configSource, /data\?\.forceModelPrefix/);
  assert.doesNotMatch(configSource, /data\?\.\['routing-strategy'\]/);
  assert.doesNotMatch(configSource, /data\?\.routingStrategy/);

  assert.doesNotMatch(apiCallSource, /response\?\.statusCode/);
  assert.doesNotMatch(apiCallSource, /response\?\.headers/);
});

test('OpenAI 单个 key 条目不保留后端不支持的 headers 字段', () => {
  const typeSource = readProjectFile('src/types/provider.ts');
  const transformerSource = readProjectFile('src/services/api/transformers.ts');
  const providerApiSource = readProjectFile('src/services/api/providers.ts');
  const editLayoutSource = readProjectFile('src/pages/AiProvidersOpenAIEditLayout.tsx');
  const providerUtilsSource = readProjectFile('src/components/providers/utils.ts');

  const apiKeyEntryType = typeSource.match(/export interface ApiKeyEntry \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.doesNotMatch(apiKeyEntryType, /headers\?:/);
  assert.doesNotMatch(transformerSource, /normalizeHeaders\(record\.headers\)/);
  assert.doesNotMatch(providerApiSource, /serializeHeaders\(entry\.headers\)/);
  assert.doesNotMatch(editLayoutSource, /entry\.headers|normalizeKeyHeaders|ApiKeyEntry\['headers'\]/);
  assert.doesNotMatch(providerUtilsSource, /headers: input\?\.headers/);
});
