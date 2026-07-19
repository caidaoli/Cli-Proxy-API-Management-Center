import { useCallback, useMemo, useReducer } from 'react';
import { isMap, parse as parseYaml, parseDocument } from 'yaml';
import type {
  PluginStoreAuthApplyTo,
  PluginStoreAuthRule,
  PluginStoreAuthType,
  PayloadFilterRule,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadRule,
  VisualConfigValues,
  VisualConfigValidationErrors,
  PayloadParamValidationErrorCode,
} from '@/types/visualConfig';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractApiKeyValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }

  const record = asRecord(raw);
  if (!record) return null;

  const candidates = [record['api-key'], record.apiKey, record.key, record.Key];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parseApiKeysText(raw: unknown): string {
  if (!Array.isArray(raw)) return '';

  const keys: string[] = [];
  for (const item of raw) {
    const key = extractApiKeyValue(item);
    if (key) keys.push(key);
  }
  return keys.join('\n');
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

const PLUGIN_STORE_AUTH_TYPES: PluginStoreAuthType[] = [
  'none',
  'bearer',
  'basic',
  'header',
  'github-token',
];
const PLUGIN_STORE_AUTH_APPLY_TO: PluginStoreAuthApplyTo[] = ['registry', 'metadata', 'artifact'];

function parsePluginStoreAuthType(raw: unknown): PluginStoreAuthType {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return PLUGIN_STORE_AUTH_TYPES.includes(value as PluginStoreAuthType)
    ? (value as PluginStoreAuthType)
    : 'none';
}

function parsePluginStoreAuthApplyTo(raw: unknown): PluginStoreAuthApplyTo[] {
  return parseStringList(raw)
    .map((item) => item.toLowerCase())
    .filter((item): item is PluginStoreAuthApplyTo =>
      PLUGIN_STORE_AUTH_APPLY_TO.includes(item as PluginStoreAuthApplyTo)
    );
}

function parsePluginStoreAuthRules(raw: unknown): PluginStoreAuthRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): PluginStoreAuthRule | null => {
      const record = asRecord(item);
      if (!record) return null;
      const rule: PluginStoreAuthRule = {
        id: `plugin-store-auth-${index}`,
        match: typeof record.match === 'string' ? record.match : '',
        applyTo: parsePluginStoreAuthApplyTo(record['apply-to'] ?? record.apply_to),
        type: parsePluginStoreAuthType(record.type),
        tokenEnv: typeof record['token-env'] === 'string' ? record['token-env'] : '',
        usernameEnv: typeof record['username-env'] === 'string' ? record['username-env'] : '',
        passwordEnv: typeof record['password-env'] === 'string' ? record['password-env'] : '',
        headerName: typeof record['header-name'] === 'string' ? record['header-name'] : '',
        headerValueEnv:
          typeof record['header-value-env'] === 'string' ? record['header-value-env'] : '',
        allowInsecure: Boolean(record['allow-insecure'] ?? record.allow_insecure),
      };
      return rule.match.trim() ||
        rule.type !== 'none' ||
        rule.applyTo.length > 0 ||
        rule.tokenEnv.trim() ||
        rule.usernameEnv.trim() ||
        rule.passwordEnv.trim() ||
        rule.headerName.trim() ||
        rule.headerValueEnv.trim() ||
        rule.allowInsecure
        ? rule
        : null;
    })
    .filter((rule): rule is PluginStoreAuthRule => Boolean(rule));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function arePluginStoreAuthRulesEqual(
  left: PluginStoreAuthRule[],
  right: PluginStoreAuthRule[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (
      a.match !== b.match ||
      a.type !== b.type ||
      a.tokenEnv !== b.tokenEnv ||
      a.usernameEnv !== b.usernameEnv ||
      a.passwordEnv !== b.passwordEnv ||
      a.headerName !== b.headerName ||
      a.headerValueEnv !== b.headerValueEnv ||
      a.allowInsecure !== b.allowInsecure
    ) {
      return false;
    }
    if (!areStringArraysEqual(a.applyTo, b.applyTo)) return false;
  }
  return true;
}

type ApiKeysStorageMode = 'legacy' | 'auth-provider';
type ApiKeysEntryMode = 'string' | 'object';

type ApiKeysStorageMetadata = {
  source: ApiKeysStorageMode;
  providerListKey?: 'api-keys' | 'api-key-entries';
  entryMode: ApiKeysEntryMode;
  originalEntries: unknown[];
  syncLegacy: boolean;
};

const DEFAULT_API_KEYS_STORAGE_METADATA: ApiKeysStorageMetadata = {
  source: 'legacy',
  entryMode: 'string',
  originalEntries: [],
  syncLegacy: false,
};

function replaceApiKeyValue(entry: unknown, apiKey: string): unknown {
  const record = asRecord(entry);
  if (!record) return apiKey;

  if ('api-key' in record) return { ...record, 'api-key': apiKey };
  if ('apiKey' in record) return { ...record, apiKey };
  if ('key' in record) return { ...record, key: apiKey };
  if ('Key' in record) return { ...record, Key: apiKey };

  return { ...record, 'api-key': apiKey };
}

function buildApiKeyEntries(
  apiKeys: string[],
  metadata: ApiKeysStorageMetadata
): Array<string | Record<string, unknown>> {
  return apiKeys.map((apiKey, index) => {
    const originalEntry = metadata.originalEntries[index];
    if (metadata.entryMode === 'object') {
      const replaced = replaceApiKeyValue(originalEntry, apiKey);
      return asRecord(replaced) ?? { 'api-key': apiKey };
    }

    const record = asRecord(originalEntry);
    return record
      ? { ...record, ...(replaceApiKeyValue(record, apiKey) as Record<string, unknown>) }
      : apiKey;
  });
}

function resolveApiKeysStorage(parsed: Record<string, unknown>): {
  text: string;
  metadata: ApiKeysStorageMetadata;
} {
  const legacyEntries = Array.isArray(parsed['api-keys']) ? parsed['api-keys'] : [];
  const auth = asRecord(parsed.auth);
  const providers = asRecord(auth?.providers);
  const configApiKeyProvider = asRecord(providers?.['config-api-key']);

  if (configApiKeyProvider) {
    const providerEntries = Array.isArray(configApiKeyProvider['api-key-entries'])
      ? configApiKeyProvider['api-key-entries']
      : Array.isArray(configApiKeyProvider['api-keys'])
        ? configApiKeyProvider['api-keys']
        : [];
    const providerListKey = Array.isArray(configApiKeyProvider['api-key-entries'])
      ? 'api-key-entries'
      : 'api-keys';

    return {
      text: parseApiKeysText(providerEntries),
      metadata: {
        source: 'auth-provider',
        providerListKey,
        entryMode:
          providerListKey === 'api-key-entries' ||
          providerEntries.some((entry) => Boolean(asRecord(entry)))
            ? 'object'
            : 'string',
        originalEntries: providerEntries,
        syncLegacy: legacyEntries.length > 0,
      },
    };
  }

  return {
    text: parseApiKeysText(legacyEntries),
    metadata: {
      source: 'legacy',
      entryMode: legacyEntries.some((entry) => Boolean(asRecord(entry))) ? 'object' : 'string',
      originalEntries: legacyEntries,
      syncLegacy: false,
    },
  };
}

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlPath = string[];

function docHas(doc: YamlDocument, path: YamlPath): boolean {
  return doc.hasIn(path);
}

function ensureMapInDoc(doc: YamlDocument, path: YamlPath): void {
  const existing = doc.getIn(path, true);
  if (isMap(existing)) return;
  // Use a YAML node here; plain objects are not treated as collections by subsequent `setIn`.
  doc.setIn(path, doc.createNode({}));
}

function deleteIfMapEmpty(doc: YamlDocument, path: YamlPath): void {
  const value = doc.getIn(path, true);
  if (!isMap(value)) return;
  if (value.items.length === 0) doc.deleteIn(path);
}

function setBooleanInDoc(doc: YamlDocument, path: YamlPath, value: boolean): void {
  if (value) {
    doc.setIn(path, true);
    return;
  }
  if (docHas(doc, path)) doc.setIn(path, false);
}

const PAYLOAD_DIRTY_FIELDS = [
  'payloadDefaultRules',
  'payloadDefaultRawRules',
  'payloadOverrideRules',
  'payloadOverrideRawRules',
  'payloadFilterRules',
] as const;

function hasPayloadDirtyFields(dirtyFields: Set<string>): boolean {
  return PAYLOAD_DIRTY_FIELDS.some((field) => dirtyFields.has(field));
}
function setStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed !== '') {
    doc.setIn(path, safe);
    return;
  }
  // Preserve existing empty-string keys to avoid dropping template blocks/comments.
  // Only keep the key when it already exists in the YAML.
  if (docHas(doc, path)) {
    doc.setIn(path, '');
  }
}

function setStringListInDoc(doc: YamlDocument, path: YamlPath, values: string[]): void {
  const nextValues = values.map((value) => value.trim()).filter(Boolean);
  if (nextValues.length > 0) {
    doc.setIn(path, nextValues);
    return;
  }
  if (docHas(doc, path)) doc.deleteIn(path);
}

function setIntFromStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed === '') {
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    doc.setIn(path, parsed);
    return;
  }
}

function getNonNegativeIntegerError(value: string): 'non_negative_integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'non_negative_integer';
  return Number(trimmed) >= 0 ? undefined : 'non_negative_integer';
}

function getPortError(value: string): 'port_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'port_range';
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= 65535 ? undefined : 'port_range';
}

export function getVisualConfigValidationErrors(
  values: VisualConfigValues
): VisualConfigValidationErrors {
  return {
    port: getPortError(values.port),
    logsMaxTotalSizeMb: getNonNegativeIntegerError(values.logsMaxTotalSizeMb),
    requestRetry: getNonNegativeIntegerError(values.requestRetry),
    maxRetryCredentials: getNonNegativeIntegerError(values.maxRetryCredentials),
    maxRetryInterval: getNonNegativeIntegerError(values.maxRetryInterval),
    'streaming.keepaliveSeconds': getNonNegativeIntegerError(values.streaming.keepaliveSeconds),
    'streaming.bootstrapRetries': getNonNegativeIntegerError(values.streaming.bootstrapRetries),
    'streaming.nonstreamKeepaliveInterval': getNonNegativeIntegerError(
      values.streaming.nonstreamKeepaliveInterval
    ),
  };
}

export function getPayloadParamValidationError(
  param: PayloadParamEntry
): PayloadParamValidationErrorCode | undefined {
  const trimmedValue = param.value.trim();

  switch (param.valueType) {
    case 'number': {
      if (!trimmedValue) return 'payload_invalid_number';
      const parsed = Number(trimmedValue);
      return Number.isFinite(parsed) ? undefined : 'payload_invalid_number';
    }
    case 'boolean': {
      const normalized = trimmedValue.toLowerCase();
      return normalized === 'true' || normalized === 'false'
        ? undefined
        : 'payload_invalid_boolean';
    }
    case 'json': {
      if (!trimmedValue) return 'payload_invalid_json';
      try {
        JSON.parse(param.value);
        return undefined;
      } catch {
        return 'payload_invalid_json';
      }
    }
    default:
      return undefined;
  }
}

function hasPayloadParamValidationErrors(rules: PayloadRule[]): boolean {
  return rules.some((rule) =>
    rule.params.some((param) => Boolean(getPayloadParamValidationError(param)))
  );
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function arePayloadModelEntriesEqual(
  left: PayloadRule['models'],
  right: PayloadRule['models']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.name !== b.name || a.protocol !== b.protocol) return false;
  }
  return true;
}

function arePayloadParamEntriesEqual(
  left: PayloadRule['params'],
  right: PayloadRule['params']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.path !== b.path || a.valueType !== b.valueType || a.value !== b.value) {
      return false;
    }
  }
  return true;
}

function arePayloadRulesEqual(left: PayloadRule[], right: PayloadRule[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (!arePayloadParamEntriesEqual(a.params, b.params)) return false;
  }
  return true;
}

function arePayloadFilterRulesEqual(
  left: PayloadFilterRule[],
  right: PayloadFilterRule[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (a.params.length !== b.params.length) return false;
    for (let j = 0; j < a.params.length; j += 1) {
      if (a.params[j] !== b.params[j]) return false;
    }
  }
  return true;
}

function parsePayloadParamValue(raw: unknown): { valueType: PayloadParamValueType; value: string } {
  if (typeof raw === 'number') {
    return { valueType: 'number', value: String(raw) };
  }

  if (typeof raw === 'boolean') {
    return { valueType: 'boolean', value: String(raw) };
  }

  if (raw === null || typeof raw === 'object') {
    try {
      const json = JSON.stringify(raw, null, 2);
      return { valueType: 'json', value: json ?? 'null' };
    } catch {
      return { valueType: 'json', value: String(raw) };
    }
  }

  return { valueType: 'string', value: String(raw ?? '') };
}

function parseRawPayloadParamValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;

  try {
    const json = JSON.stringify(raw, null, 2);
    return json ?? '';
  } catch {
    return String(raw ?? '');
  }
}

function parsePayloadProtocol(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return raw.trim() ? raw : undefined;
}

function parsePayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => {
          const parsedValue = parsePayloadParamValue(value);
          return {
            id: `param-${index}-${pIndex}`,
            path,
            valueType: parsedValue.valueType,
            value: parsedValue.value,
          };
        })
      : [];

    return { id: `payload-rule-${index}`, models, params };
  });
}

function parsePayloadFilterRules(rules: unknown): PayloadFilterRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `filter-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRaw = record.params;
    const params = Array.isArray(paramsRaw) ? paramsRaw.map(String) : [];

    return { id: `payload-filter-rule-${index}`, models, params };
  });
}

function parseRawPayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `raw-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => ({
          id: `raw-param-${index}-${pIndex}`,
          path,
          valueType: 'json' as const,
          value: parseRawPayloadParamValue(value),
        }))
      : [];

    return { id: `payload-raw-rule-${index}`, models, params };
  });
}

function serializePayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        let value: unknown = param.value;
        if (param.valueType === 'number') {
          const num = Number(param.value);
          value = Number.isFinite(num) ? num : param.value;
        } else if (param.valueType === 'boolean') {
          value = param.value === 'true';
        } else if (param.valueType === 'json') {
          try {
            value = JSON.parse(param.value);
          } catch {
            value = param.value;
          }
        }
        params[param.path.trim()] = value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializePayloadFilterRulesForYaml(
  rules: PayloadFilterRule[]
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params = (Array.isArray(rule.params) ? rule.params : [])
        .map((path) => String(path).trim())
        .filter(Boolean);

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializeRawPayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        params[param.path.trim()] = param.value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializeStringListForYaml(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function serializePluginStoreAuthForYaml(
  rules: PluginStoreAuthRule[]
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const match = rule.match.trim();
      if (!match) return null;
      const item: Record<string, unknown> = {
        match,
        type: rule.type,
      };
      const applyTo = serializeStringListForYaml(rule.applyTo);
      if (applyTo.length > 0) item['apply-to'] = applyTo;
      if (rule.tokenEnv.trim()) item['token-env'] = rule.tokenEnv.trim();
      if (rule.usernameEnv.trim()) item['username-env'] = rule.usernameEnv.trim();
      if (rule.passwordEnv.trim()) item['password-env'] = rule.passwordEnv.trim();
      if (rule.headerName.trim()) item['header-name'] = rule.headerName.trim();
      if (rule.headerValueEnv.trim()) item['header-value-env'] = rule.headerValueEnv.trim();
      if (rule.allowInsecure) item['allow-insecure'] = true;
      return item;
    })
    .filter((rule): rule is Record<string, unknown> => Boolean(rule));
}

type VisualConfigState = {
  visualValues: VisualConfigValues;
  baselineValues: VisualConfigValues;
  dirtyFields: Set<string>;
  visualParseError: string | null;
  apiKeysStorageMetadata: ApiKeysStorageMetadata;
};

type VisualConfigAction =
  | {
      type: 'load_success';
      values: VisualConfigValues;
      apiKeysStorageMetadata: ApiKeysStorageMetadata;
    }
  | {
      type: 'load_error';
      error: string;
    }
  | {
      type: 'set_values';
      values: Partial<VisualConfigValues>;
    };

function createInitialVisualConfigState(): VisualConfigState {
  const initialValues = deepClone(DEFAULT_VISUAL_VALUES);
  return {
    visualValues: initialValues,
    baselineValues: deepClone(initialValues),
    dirtyFields: new Set(),
    visualParseError: null,
    apiKeysStorageMetadata: DEFAULT_API_KEYS_STORAGE_METADATA,
  };
}

function mergeVisualConfigValues(
  currentValues: VisualConfigValues,
  patch: Partial<VisualConfigValues>
): VisualConfigValues {
  const nextValues: VisualConfigValues = { ...currentValues, ...patch } as VisualConfigValues;
  if (patch.streaming) {
    nextValues.streaming = { ...currentValues.streaming, ...patch.streaming };
  }
  return nextValues;
}

function getNextDirtyFields(
  currentDirtyFields: Set<string>,
  patch: Partial<VisualConfigValues>,
  nextValues: VisualConfigValues,
  baselineValues: VisualConfigValues
): Set<string> {
  const nextDirtyFields = new Set(currentDirtyFields);
  const updateDirty = (key: string, isEqual: boolean) => {
    if (isEqual) {
      nextDirtyFields.delete(key);
    } else {
      nextDirtyFields.add(key);
    }
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'host')) {
    updateDirty('host', nextValues.host === baselineValues.host);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'port')) {
    updateDirty('port', nextValues.port === baselineValues.port);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsEnable')) {
    updateDirty('tlsEnable', nextValues.tlsEnable === baselineValues.tlsEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsCert')) {
    updateDirty('tlsCert', nextValues.tlsCert === baselineValues.tlsCert);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsKey')) {
    updateDirty('tlsKey', nextValues.tlsKey === baselineValues.tlsKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmAllowRemote')) {
    updateDirty('rmAllowRemote', nextValues.rmAllowRemote === baselineValues.rmAllowRemote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmSecretKey')) {
    updateDirty('rmSecretKey', nextValues.rmSecretKey === baselineValues.rmSecretKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableControlPanel')) {
    updateDirty(
      'rmDisableControlPanel',
      nextValues.rmDisableControlPanel === baselineValues.rmDisableControlPanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmPanelRepo')) {
    updateDirty('rmPanelRepo', nextValues.rmPanelRepo === baselineValues.rmPanelRepo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authDir')) {
    updateDirty('authDir', nextValues.authDir === baselineValues.authDir);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'apiKeysText')) {
    updateDirty('apiKeysText', nextValues.apiKeysText === baselineValues.apiKeysText);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pluginsEnabled')) {
    updateDirty('pluginsEnabled', nextValues.pluginsEnabled === baselineValues.pluginsEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pluginStoreSources')) {
    updateDirty(
      'pluginStoreSources',
      areStringArraysEqual(nextValues.pluginStoreSources, baselineValues.pluginStoreSources)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pluginStoreAuth')) {
    updateDirty(
      'pluginStoreAuth',
      arePluginStoreAuthRulesEqual(nextValues.pluginStoreAuth, baselineValues.pluginStoreAuth)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'debug')) {
    updateDirty('debug', nextValues.debug === baselineValues.debug);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'commercialMode')) {
    updateDirty('commercialMode', nextValues.commercialMode === baselineValues.commercialMode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'loggingToFile')) {
    updateDirty('loggingToFile', nextValues.loggingToFile === baselineValues.loggingToFile);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'logsMaxTotalSizeMb')) {
    updateDirty(
      'logsMaxTotalSizeMb',
      nextValues.logsMaxTotalSizeMb === baselineValues.logsMaxTotalSizeMb
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsEnabled')) {
    updateDirty(
      'usageStatisticsEnabled',
      nextValues.usageStatisticsEnabled === baselineValues.usageStatisticsEnabled
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'proxyUrl')) {
    updateDirty('proxyUrl', nextValues.proxyUrl === baselineValues.proxyUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'forceModelPrefix')) {
    updateDirty(
      'forceModelPrefix',
      nextValues.forceModelPrefix === baselineValues.forceModelPrefix
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requestRetry')) {
    updateDirty('requestRetry', nextValues.requestRetry === baselineValues.requestRetry);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryCredentials')) {
    updateDirty(
      'maxRetryCredentials',
      nextValues.maxRetryCredentials === baselineValues.maxRetryCredentials
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryInterval')) {
    updateDirty(
      'maxRetryInterval',
      nextValues.maxRetryInterval === baselineValues.maxRetryInterval
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'wsAuth')) {
    updateDirty('wsAuth', nextValues.wsAuth === baselineValues.wsAuth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'gptImage2BaseModel')) {
    updateDirty(
      'gptImage2BaseModel',
      nextValues.gptImage2BaseModel === baselineValues.gptImage2BaseModel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexIdentityConfuse')) {
    updateDirty(
      'codexIdentityConfuse',
      nextValues.codexIdentityConfuse === baselineValues.codexIdentityConfuse
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchProject')) {
    updateDirty(
      'quotaSwitchProject',
      nextValues.quotaSwitchProject === baselineValues.quotaSwitchProject
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchPreviewModel')) {
    updateDirty(
      'quotaSwitchPreviewModel',
      nextValues.quotaSwitchPreviewModel === baselineValues.quotaSwitchPreviewModel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaAntigravityCredits')) {
    updateDirty(
      'quotaAntigravityCredits',
      nextValues.quotaAntigravityCredits === baselineValues.quotaAntigravityCredits
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingStrategy')) {
    updateDirty('routingStrategy', nextValues.routingStrategy === baselineValues.routingStrategy);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinity')) {
    updateDirty(
      'routingSessionAffinity',
      nextValues.routingSessionAffinity === baselineValues.routingSessionAffinity
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinityTTL')) {
    updateDirty(
      'routingSessionAffinityTTL',
      nextValues.routingSessionAffinityTTL === baselineValues.routingSessionAffinityTTL
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRules')) {
    updateDirty(
      'payloadDefaultRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRules, baselineValues.payloadDefaultRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRawRules')) {
    updateDirty(
      'payloadDefaultRawRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRawRules, baselineValues.payloadDefaultRawRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRules')) {
    updateDirty(
      'payloadOverrideRules',
      arePayloadRulesEqual(nextValues.payloadOverrideRules, baselineValues.payloadOverrideRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRawRules')) {
    updateDirty(
      'payloadOverrideRawRules',
      arePayloadRulesEqual(
        nextValues.payloadOverrideRawRules,
        baselineValues.payloadOverrideRawRules
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadFilterRules')) {
    updateDirty(
      'payloadFilterRules',
      arePayloadFilterRulesEqual(nextValues.payloadFilterRules, baselineValues.payloadFilterRules)
    );
  }
  if (patch.streaming) {
    const streamingPatch = patch.streaming;
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'keepaliveSeconds')) {
      updateDirty(
        'streaming.keepaliveSeconds',
        nextValues.streaming.keepaliveSeconds === baselineValues.streaming.keepaliveSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'bootstrapRetries')) {
      updateDirty(
        'streaming.bootstrapRetries',
        nextValues.streaming.bootstrapRetries === baselineValues.streaming.bootstrapRetries
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'nonstreamKeepaliveInterval')) {
      updateDirty(
        'streaming.nonstreamKeepaliveInterval',
        nextValues.streaming.nonstreamKeepaliveInterval ===
          baselineValues.streaming.nonstreamKeepaliveInterval
      );
    }
  }

  return nextDirtyFields;
}

function visualConfigReducer(
  state: VisualConfigState,
  action: VisualConfigAction
): VisualConfigState {
  switch (action.type) {
    case 'load_success':
      return {
        visualValues: action.values,
        baselineValues: deepClone(action.values),
        dirtyFields: new Set(),
        visualParseError: null,
        apiKeysStorageMetadata: action.apiKeysStorageMetadata,
      };
    case 'load_error':
      return {
        ...state,
        visualParseError: action.error,
      };
    case 'set_values': {
      const nextValues = mergeVisualConfigValues(state.visualValues, action.values);
      const nextDirtyFields = getNextDirtyFields(
        state.dirtyFields,
        action.values,
        nextValues,
        state.baselineValues
      );

      return {
        ...state,
        visualValues: nextValues,
        dirtyFields: nextDirtyFields,
      };
    }
    default:
      return state;
  }
}

export function useVisualConfig() {
  const [state, dispatch] = useReducer(
    visualConfigReducer,
    undefined,
    createInitialVisualConfigState
  );
  const { visualValues, visualParseError, dirtyFields, apiKeysStorageMetadata } = state;
  const visualDirty = dirtyFields.size > 0;
  const visualValidationErrors = useMemo(
    () => getVisualConfigValidationErrors(visualValues),
    [visualValues]
  );
  const visualHasPayloadValidationErrors = useMemo(
    () =>
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRawRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRawRules),
    [
      visualValues.payloadDefaultRules,
      visualValues.payloadDefaultRawRules,
      visualValues.payloadOverrideRules,
      visualValues.payloadOverrideRawRules,
    ]
  );

  const loadVisualValuesFromYaml = useCallback((yamlContent: string) => {
    try {
      const document = parseDocument(yamlContent);
      if (document.errors.length > 0) {
        throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
      }

      const parsedRaw: unknown = parseYaml(yamlContent) || {};
      const parsed = asRecord(parsedRaw) ?? {};
      const tls = asRecord(parsed.tls);
      const remoteManagement = asRecord(parsed['remote-management']);
      const quotaExceeded = asRecord(parsed['quota-exceeded']);
      const routing = asRecord(parsed.routing);
      const payload = asRecord(parsed.payload);
      const streaming = asRecord(parsed.streaming);
      const plugins = asRecord(parsed.plugins);
      const codex = asRecord(parsed.codex);
      const apiKeysStorage = resolveApiKeysStorage(parsed);

      const newValues: VisualConfigValues = {
        host: typeof parsed.host === 'string' ? parsed.host : '',
        port: String(parsed.port ?? ''),

        tlsEnable: Boolean(tls?.enable),
        tlsCert: typeof tls?.cert === 'string' ? tls.cert : '',
        tlsKey: typeof tls?.key === 'string' ? tls.key : '',

        rmAllowRemote: Boolean(remoteManagement?.['allow-remote']),
        rmSecretKey:
          typeof remoteManagement?.['secret-key'] === 'string'
            ? remoteManagement['secret-key']
            : '',
        rmDisableControlPanel: Boolean(remoteManagement?.['disable-control-panel']),
        rmPanelRepo:
          typeof remoteManagement?.['panel-github-repository'] === 'string'
            ? remoteManagement['panel-github-repository']
            : typeof remoteManagement?.['panel-repo'] === 'string'
              ? remoteManagement['panel-repo']
              : '',

        authDir: typeof parsed['auth-dir'] === 'string' ? parsed['auth-dir'] : '',
        apiKeysText: apiKeysStorage.text,
        pluginsEnabled: Boolean(plugins?.enabled),
        pluginStoreSources: parseStringList(plugins?.['store-sources']),
        pluginStoreAuth: parsePluginStoreAuthRules(plugins?.['store-auth']),

        debug: Boolean(parsed.debug),
        commercialMode: Boolean(parsed['commercial-mode']),
        loggingToFile: Boolean(parsed['logging-to-file']),
        logsMaxTotalSizeMb: String(parsed['logs-max-total-size-mb'] ?? ''),
        usageStatisticsEnabled: Boolean(parsed['usage-statistics-enabled']),

        proxyUrl: typeof parsed['proxy-url'] === 'string' ? parsed['proxy-url'] : '',
        forceModelPrefix: Boolean(parsed['force-model-prefix']),
        requestRetry: String(parsed['request-retry'] ?? ''),
        maxRetryCredentials: String(parsed['max-retry-credentials'] ?? ''),
        maxRetryInterval: String(parsed['max-retry-interval'] ?? ''),

        gptImage2BaseModel:
          typeof parsed['gpt-image-2-base-model'] === 'string'
            ? parsed['gpt-image-2-base-model']
            : '',
        codexIdentityConfuse: Boolean(codex?.['identity-confuse']),
        wsAuth: Boolean(parsed['ws-auth']),

        quotaSwitchProject: Boolean(quotaExceeded?.['switch-project'] ?? true),
        quotaSwitchPreviewModel: Boolean(quotaExceeded?.['switch-preview-model'] ?? true),
        quotaAntigravityCredits: Boolean(quotaExceeded?.['antigravity-credits'] ?? false),

        routingStrategy:
          routing?.strategy === 'fill-first'
            ? 'fill-first'
            : routing?.strategy === 'sf' || routing?.strategy === 'sequential-fill'
              ? 'sf'
              : 'round-robin',
        routingSessionAffinity: Boolean(
          routing?.['session-affinity'] ?? routing?.sessionAffinity ?? routing?.['sessionAffinity']
        ),
        routingSessionAffinityTTL:
          typeof routing?.['session-affinity-ttl'] === 'string'
            ? routing['session-affinity-ttl']
            : typeof routing?.sessionAffinityTTL === 'string'
              ? routing.sessionAffinityTTL
              : typeof routing?.['sessionAffinityTTL'] === 'string'
                ? routing['sessionAffinityTTL']
                : '',

        payloadDefaultRules: parsePayloadRules(payload?.default),
        payloadDefaultRawRules: parseRawPayloadRules(payload?.['default-raw']),
        payloadOverrideRules: parsePayloadRules(payload?.override),
        payloadOverrideRawRules: parseRawPayloadRules(payload?.['override-raw']),
        payloadFilterRules: parsePayloadFilterRules(payload?.filter),

        streaming: {
          keepaliveSeconds: String(streaming?.['keepalive-seconds'] ?? ''),
          bootstrapRetries: String(streaming?.['bootstrap-retries'] ?? ''),
          nonstreamKeepaliveInterval: String(parsed['nonstream-keepalive-interval'] ?? ''),
        },
      };

      dispatch({
        type: 'load_success',
        values: newValues,
        apiKeysStorageMetadata: apiKeysStorage.metadata,
      });
      return { ok: true as const };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid YAML';
      dispatch({ type: 'load_error', error: message });
      return { ok: false as const, error: message };
    }
  }, []);

  const applyVisualChangesToYaml = useCallback(
    (currentYaml: string): string => {
      try {
        const doc = parseDocument(currentYaml);
        if (doc.errors.length > 0) return currentYaml;
        if (!isMap(doc.contents)) {
          doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
        }
        const values = visualValues;
        const shouldWritePluginStoreAuth = dirtyFields.has('pluginStoreAuth');

        if (dirtyFields.has('host')) setStringInDoc(doc, ['host'], values.host);
        if (dirtyFields.has('port')) setIntFromStringInDoc(doc, ['port'], values.port);

        const tlsDirty =
          dirtyFields.has('tlsEnable') || dirtyFields.has('tlsCert') || dirtyFields.has('tlsKey');
        if (tlsDirty) {
          ensureMapInDoc(doc, ['tls']);
          if (dirtyFields.has('tlsEnable')) {
            setBooleanInDoc(doc, ['tls', 'enable'], values.tlsEnable);
          }
          if (dirtyFields.has('tlsCert')) setStringInDoc(doc, ['tls', 'cert'], values.tlsCert);
          if (dirtyFields.has('tlsKey')) setStringInDoc(doc, ['tls', 'key'], values.tlsKey);
          deleteIfMapEmpty(doc, ['tls']);
        }

        const remoteManagementDirty =
          dirtyFields.has('rmAllowRemote') ||
          dirtyFields.has('rmSecretKey') ||
          dirtyFields.has('rmDisableControlPanel') ||
          dirtyFields.has('rmPanelRepo');
        if (remoteManagementDirty) {
          ensureMapInDoc(doc, ['remote-management']);
          if (dirtyFields.has('rmAllowRemote')) {
            setBooleanInDoc(doc, ['remote-management', 'allow-remote'], values.rmAllowRemote);
          }
          if (dirtyFields.has('rmSecretKey')) {
            setStringInDoc(doc, ['remote-management', 'secret-key'], values.rmSecretKey);
          }
          if (dirtyFields.has('rmDisableControlPanel')) {
            setBooleanInDoc(
              doc,
              ['remote-management', 'disable-control-panel'],
              values.rmDisableControlPanel
            );
          }
          if (dirtyFields.has('rmPanelRepo')) {
            setStringInDoc(
              doc,
              ['remote-management', 'panel-github-repository'],
              values.rmPanelRepo
            );
          }
          if (dirtyFields.has('rmPanelRepo') && docHas(doc, ['remote-management', 'panel-repo'])) {
            doc.deleteIn(['remote-management', 'panel-repo']);
          }
          deleteIfMapEmpty(doc, ['remote-management']);
        }

        if (dirtyFields.has('authDir')) setStringInDoc(doc, ['auth-dir'], values.authDir);
        if (dirtyFields.has('apiKeysText')) {
          const apiKeys = values.apiKeysText
            .split('\n')
            .map((key) => key.trim())
            .filter(Boolean);
          const apiKeyEntries = buildApiKeyEntries(apiKeys, apiKeysStorageMetadata);

          if (apiKeysStorageMetadata.source === 'auth-provider') {
            ensureMapInDoc(doc, ['auth']);
            ensureMapInDoc(doc, ['auth', 'providers']);
            ensureMapInDoc(doc, ['auth', 'providers', 'config-api-key']);

            const providerListKey = apiKeysStorageMetadata.providerListKey ?? 'api-key-entries';
            const providerPath = ['auth', 'providers', 'config-api-key', providerListKey];

            if (apiKeys.length > 0) {
              doc.setIn(providerPath, apiKeyEntries);
            } else if (docHas(doc, providerPath)) {
              doc.deleteIn(providerPath);
            }

            deleteIfMapEmpty(doc, ['auth', 'providers', 'config-api-key']);
            deleteIfMapEmpty(doc, ['auth', 'providers']);
            deleteIfMapEmpty(doc, ['auth']);

            if (apiKeysStorageMetadata.syncLegacy) {
              if (apiKeys.length > 0) {
                doc.setIn(['api-keys'], apiKeys);
              } else if (docHas(doc, ['api-keys'])) {
                doc.deleteIn(['api-keys']);
              }
            }
          } else if (apiKeys.length > 0) {
            doc.setIn(['api-keys'], apiKeyEntries);
          } else if (docHas(doc, ['api-keys'])) {
            doc.deleteIn(['api-keys']);
          }
        }

        const pluginsDirty =
          dirtyFields.has('pluginsEnabled') ||
          dirtyFields.has('pluginStoreSources') ||
          shouldWritePluginStoreAuth;
        if (pluginsDirty) {
          ensureMapInDoc(doc, ['plugins']);
          if (dirtyFields.has('pluginsEnabled')) {
            setBooleanInDoc(doc, ['plugins', 'enabled'], values.pluginsEnabled);
          }
          if (dirtyFields.has('pluginStoreSources')) {
            setStringListInDoc(doc, ['plugins', 'store-sources'], values.pluginStoreSources);
          }
          if (shouldWritePluginStoreAuth) {
            const storeAuth = serializePluginStoreAuthForYaml(values.pluginStoreAuth);
            if (storeAuth.length > 0) {
              doc.setIn(['plugins', 'store-auth'], storeAuth);
            } else if (docHas(doc, ['plugins', 'store-auth'])) {
              doc.deleteIn(['plugins', 'store-auth']);
            }
          }
          deleteIfMapEmpty(doc, ['plugins']);
        }

        if (dirtyFields.has('debug')) setBooleanInDoc(doc, ['debug'], values.debug);
        if (dirtyFields.has('commercialMode')) {
          setBooleanInDoc(doc, ['commercial-mode'], values.commercialMode);
        }
        if (dirtyFields.has('loggingToFile')) {
          setBooleanInDoc(doc, ['logging-to-file'], values.loggingToFile);
        }
        if (dirtyFields.has('logsMaxTotalSizeMb')) {
          setIntFromStringInDoc(doc, ['logs-max-total-size-mb'], values.logsMaxTotalSizeMb);
        }
        if (dirtyFields.has('usageStatisticsEnabled')) {
          setBooleanInDoc(doc, ['usage-statistics-enabled'], values.usageStatisticsEnabled);
        }

        if (dirtyFields.has('proxyUrl')) setStringInDoc(doc, ['proxy-url'], values.proxyUrl);
        if (dirtyFields.has('forceModelPrefix')) {
          setBooleanInDoc(doc, ['force-model-prefix'], values.forceModelPrefix);
        }
        if (dirtyFields.has('requestRetry')) {
          setIntFromStringInDoc(doc, ['request-retry'], values.requestRetry);
        }
        if (dirtyFields.has('maxRetryCredentials')) {
          setIntFromStringInDoc(doc, ['max-retry-credentials'], values.maxRetryCredentials);
        }
        if (dirtyFields.has('maxRetryInterval')) {
          setIntFromStringInDoc(doc, ['max-retry-interval'], values.maxRetryInterval);
        }
        if (dirtyFields.has('gptImage2BaseModel')) {
          setStringInDoc(doc, ['gpt-image-2-base-model'], values.gptImage2BaseModel);
        }
        if (dirtyFields.has('wsAuth')) setBooleanInDoc(doc, ['ws-auth'], values.wsAuth);

        if (dirtyFields.has('codexIdentityConfuse')) {
          ensureMapInDoc(doc, ['codex']);
          setBooleanInDoc(doc, ['codex', 'identity-confuse'], values.codexIdentityConfuse);
          deleteIfMapEmpty(doc, ['codex']);
        }

        const quotaDirty =
          dirtyFields.has('quotaSwitchProject') ||
          dirtyFields.has('quotaSwitchPreviewModel') ||
          dirtyFields.has('quotaAntigravityCredits');
        if (quotaDirty) {
          ensureMapInDoc(doc, ['quota-exceeded']);
          if (dirtyFields.has('quotaSwitchProject')) {
            doc.setIn(['quota-exceeded', 'switch-project'], values.quotaSwitchProject);
          }
          if (dirtyFields.has('quotaSwitchPreviewModel')) {
            doc.setIn(['quota-exceeded', 'switch-preview-model'], values.quotaSwitchPreviewModel);
          }
          if (dirtyFields.has('quotaAntigravityCredits')) {
            doc.setIn(['quota-exceeded', 'antigravity-credits'], values.quotaAntigravityCredits);
          }
          deleteIfMapEmpty(doc, ['quota-exceeded']);
        }

        const routingDirty =
          dirtyFields.has('routingStrategy') ||
          dirtyFields.has('routingSessionAffinity') ||
          dirtyFields.has('routingSessionAffinityTTL');
        if (routingDirty) {
          ensureMapInDoc(doc, ['routing']);
          if (dirtyFields.has('routingStrategy')) {
            doc.setIn(['routing', 'strategy'], values.routingStrategy);
          }
          if (dirtyFields.has('routingSessionAffinity')) {
            setBooleanInDoc(doc, ['routing', 'session-affinity'], values.routingSessionAffinity);
          }
          if (dirtyFields.has('routingSessionAffinityTTL')) {
            setStringInDoc(
              doc,
              ['routing', 'session-affinity-ttl'],
              values.routingSessionAffinityTTL
            );
          }
          deleteIfMapEmpty(doc, ['routing']);
        }

        const keepaliveSeconds =
          typeof values.streaming?.keepaliveSeconds === 'string'
            ? values.streaming.keepaliveSeconds
            : '';
        const bootstrapRetries =
          typeof values.streaming?.bootstrapRetries === 'string'
            ? values.streaming.bootstrapRetries
            : '';
        const nonstreamKeepaliveInterval =
          typeof values.streaming?.nonstreamKeepaliveInterval === 'string'
            ? values.streaming.nonstreamKeepaliveInterval
            : '';

        const streamingDirty =
          dirtyFields.has('streaming.keepaliveSeconds') ||
          dirtyFields.has('streaming.bootstrapRetries');
        if (streamingDirty) {
          ensureMapInDoc(doc, ['streaming']);
          if (dirtyFields.has('streaming.keepaliveSeconds')) {
            setIntFromStringInDoc(doc, ['streaming', 'keepalive-seconds'], keepaliveSeconds);
          }
          if (dirtyFields.has('streaming.bootstrapRetries')) {
            setIntFromStringInDoc(doc, ['streaming', 'bootstrap-retries'], bootstrapRetries);
          }
          deleteIfMapEmpty(doc, ['streaming']);
        }

        if (dirtyFields.has('streaming.nonstreamKeepaliveInterval')) {
          setIntFromStringInDoc(doc, ['nonstream-keepalive-interval'], nonstreamKeepaliveInterval);
        }

        if (hasPayloadDirtyFields(dirtyFields)) {
          ensureMapInDoc(doc, ['payload']);
          if (dirtyFields.has('payloadDefaultRules')) {
            if (values.payloadDefaultRules.length > 0) {
              doc.setIn(
                ['payload', 'default'],
                serializePayloadRulesForYaml(values.payloadDefaultRules)
              );
            } else if (docHas(doc, ['payload', 'default'])) {
              doc.deleteIn(['payload', 'default']);
            }
          }
          if (dirtyFields.has('payloadDefaultRawRules')) {
            if (values.payloadDefaultRawRules.length > 0) {
              doc.setIn(
                ['payload', 'default-raw'],
                serializeRawPayloadRulesForYaml(values.payloadDefaultRawRules)
              );
            } else if (docHas(doc, ['payload', 'default-raw'])) {
              doc.deleteIn(['payload', 'default-raw']);
            }
          }
          if (dirtyFields.has('payloadOverrideRules')) {
            if (values.payloadOverrideRules.length > 0) {
              doc.setIn(
                ['payload', 'override'],
                serializePayloadRulesForYaml(values.payloadOverrideRules)
              );
            } else if (docHas(doc, ['payload', 'override'])) {
              doc.deleteIn(['payload', 'override']);
            }
          }
          if (dirtyFields.has('payloadOverrideRawRules')) {
            if (values.payloadOverrideRawRules.length > 0) {
              doc.setIn(
                ['payload', 'override-raw'],
                serializeRawPayloadRulesForYaml(values.payloadOverrideRawRules)
              );
            } else if (docHas(doc, ['payload', 'override-raw'])) {
              doc.deleteIn(['payload', 'override-raw']);
            }
          }
          if (dirtyFields.has('payloadFilterRules')) {
            if (values.payloadFilterRules.length > 0) {
              doc.setIn(
                ['payload', 'filter'],
                serializePayloadFilterRulesForYaml(values.payloadFilterRules)
              );
            } else if (docHas(doc, ['payload', 'filter'])) {
              doc.deleteIn(['payload', 'filter']);
            }
          }
          deleteIfMapEmpty(doc, ['payload']);
        }

        return doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
      } catch {
        return currentYaml;
      }
    },
    [apiKeysStorageMetadata, dirtyFields, visualValues]
  );

  const setVisualValues = useCallback((newValues: Partial<VisualConfigValues>) => {
    dispatch({ type: 'set_values', values: newValues });
  }, []);

  return {
    visualValues,
    visualDirty,
    visualParseError,
    visualValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  };
}

export const VISUAL_CONFIG_PROTOCOL_OPTIONS = [
  {
    value: '',
    labelKey: 'config_management.visual.payload_rules.provider_default',
    defaultLabel: 'Default',
  },
  {
    value: 'openai',
    labelKey: 'config_management.visual.payload_rules.provider_openai',
    defaultLabel: 'OpenAI',
  },
  {
    value: 'openai-response',
    labelKey: 'config_management.visual.payload_rules.provider_openai_response',
    defaultLabel: 'OpenAI Response',
  },
  {
    value: 'gemini',
    labelKey: 'config_management.visual.payload_rules.provider_gemini',
    defaultLabel: 'Gemini',
  },
  {
    value: 'claude',
    labelKey: 'config_management.visual.payload_rules.provider_claude',
    defaultLabel: 'Claude',
  },
  {
    value: 'codex',
    labelKey: 'config_management.visual.payload_rules.provider_codex',
    defaultLabel: 'Codex',
  },
  {
    value: 'antigravity',
    labelKey: 'config_management.visual.payload_rules.provider_antigravity',
    defaultLabel: 'Antigravity',
  },
] as const;

export const VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS = [
  {
    value: 'string',
    labelKey: 'config_management.visual.payload_rules.value_type_string',
    defaultLabel: 'String',
  },
  {
    value: 'number',
    labelKey: 'config_management.visual.payload_rules.value_type_number',
    defaultLabel: 'Number',
  },
  {
    value: 'boolean',
    labelKey: 'config_management.visual.payload_rules.value_type_boolean',
    defaultLabel: 'Boolean',
  },
  {
    value: 'json',
    labelKey: 'config_management.visual.payload_rules.value_type_json',
    defaultLabel: 'JSON',
  },
] as const satisfies ReadonlyArray<{
  value: PayloadParamValueType;
  labelKey: string;
  defaultLabel: string;
}>;
