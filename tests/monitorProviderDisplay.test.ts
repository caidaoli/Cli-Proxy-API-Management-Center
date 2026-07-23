import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProviderDisplay,
  getProviderDisplayParts,
  resolveProvider,
} from '../src/utils/monitor.ts';

const CODEX_SOURCE = 'codex-32816962-caidaoli+2@gmail.com-team.json';
const ANTIGRAVITY_SOURCE = 'antigravity-caidaoli@gmail.com.json';
const GEMINI_FILE = 'gemini-putthzli.json';
const GEMINI_EMAIL = 'user@gmail.com';
const API_KEY = 'sk-alpha1234';

const providerMap: Record<string, string> = {
  [CODEX_SOURCE]: 'Codex',
  [ANTIGRAVITY_SOURCE]: 'Antigravity',
  [GEMINI_FILE]: 'Gemini',
  [API_KEY]: 'OpenAI',
};

test('resolveProvider 优先精确匹配 provider-map', () => {
  assert.equal(resolveProvider(CODEX_SOURCE, providerMap), 'Codex');
  assert.equal(resolveProvider(ANTIGRAVITY_SOURCE, providerMap), 'Antigravity');
  assert.equal(resolveProvider(API_KEY, providerMap), 'OpenAI');
  assert.equal(resolveProvider('unknown-key', providerMap), null);
});

test('codex/antigravity 凭证文件不走 Gemini g- 格式，命中 map 后显示渠道名', () => {
  assert.equal(
    formatProviderDisplay(CODEX_SOURCE, providerMap),
    'Codex (codex-*m-team)'
  );
  assert.equal(
    formatProviderDisplay(ANTIGRAVITY_SOURCE, providerMap),
    'Antigravity (antigr*il.com)'
  );

  assert.deepEqual(getProviderDisplayParts(CODEX_SOURCE, providerMap), {
    provider: 'Codex',
    masked: 'codex-*m-team',
  });
  assert.deepEqual(getProviderDisplayParts(ANTIGRAVITY_SOURCE, providerMap), {
    provider: 'Antigravity',
    masked: 'antigr*il.com',
  });
});

test('codex/antigravity 凭证文件在 map 缺失时也不伪装成 Gemini', () => {
  // 旧逻辑：任意 .json 都加 g- 前缀 → g-cod*eam / g-ant*com
  assert.notEqual(formatProviderDisplay(CODEX_SOURCE, {}), 'g-cod*eam');
  assert.notEqual(formatProviderDisplay(ANTIGRAVITY_SOURCE, {}), 'g-ant*com');

  assert.equal(formatProviderDisplay(CODEX_SOURCE, {}), 'codex-*m-team');
  assert.equal(formatProviderDisplay(ANTIGRAVITY_SOURCE, {}), 'antigr*il.com');

  assert.deepEqual(getProviderDisplayParts(CODEX_SOURCE, {}), {
    provider: null,
    masked: 'codex-*m-team',
  });
});

test('真正的 Gemini OAuth 来源保留 g- 紧凑显示', () => {
  assert.equal(formatProviderDisplay(GEMINI_FILE, {}), 'g-put*zli');
  assert.equal(formatProviderDisplay(GEMINI_EMAIL, {}), 'g-user');

  // map 命中时优先展示渠道名，不再强制 g-
  assert.equal(formatProviderDisplay(GEMINI_FILE, providerMap), 'Gemini (gemi*hzli)');
  assert.deepEqual(getProviderDisplayParts(GEMINI_FILE, providerMap), {
    provider: 'Gemini',
    masked: 'gemi*hzli',
  });
});

test('API Key 仍使用 maskSecret 风格并拼接 provider', () => {
  assert.equal(formatProviderDisplay(API_KEY, providerMap), 'OpenAI (sk-a***1234)');
  assert.equal(formatProviderDisplay(API_KEY, {}), 'sk-a***1234');
  assert.deepEqual(getProviderDisplayParts(API_KEY, providerMap), {
    provider: 'OpenAI',
    masked: 'sk-a***1234',
  });
});

test('空/unknown source 保持原样', () => {
  assert.equal(formatProviderDisplay('', {}), '-');
  assert.equal(formatProviderDisplay('unknown', {}), 'unknown');
  assert.deepEqual(getProviderDisplayParts('-', {}), {
    provider: null,
    masked: '-',
  });
});
