import type { AuthFileFieldsPatch } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types';
import {
  parseExcludedModelsText,
  parsePriorityValue,
  supportsAuthFileUsingApi,
  supportsAuthFileWebsockets,
} from './constants';

export type DisableCoolingChoice = 'unchanged' | 'true' | 'false';

export type BatchFieldsFormState = {
  prefix: string;
  prefixTouched: boolean;
  proxyUrl: string;
  proxyUrlTouched: boolean;
  note: string;
  noteTouched: boolean;
  priority: string;
  priorityTouched: boolean;
  excludedModelsText: string;
  excludedModelsTouched: boolean;
  headersText: string;
  headersTouched: boolean;
  disableCooling: DisableCoolingChoice;
  websockets: boolean;
  websocketsTouched: boolean;
  usingApi: boolean;
  usingApiTouched: boolean;
};

export const createEmptyBatchFieldsForm = (): BatchFieldsFormState => ({
  prefix: '',
  prefixTouched: false,
  proxyUrl: '',
  proxyUrlTouched: false,
  note: '',
  noteTouched: false,
  priority: '',
  priorityTouched: false,
  excludedModelsText: '',
  excludedModelsTouched: false,
  headersText: '',
  headersTouched: false,
  disableCooling: 'unchanged',
  websockets: false,
  websocketsTouched: false,
  usingApi: false,
  usingApiTouched: false,
});

type AuthFileHeaders = Record<string, string>;
type AuthFileHeadersErrorKey =
  | 'auth_files.headers_invalid_json'
  | 'auth_files.headers_invalid_object'
  | 'auth_files.headers_invalid_value';

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validateHeadersValue = (value: unknown): AuthFileHeadersErrorKey | null => {
  if (!isRecordObject(value)) {
    return 'auth_files.headers_invalid_object';
  }

  for (const [, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== 'string') {
      return 'auth_files.headers_invalid_value';
    }
  }

  return null;
};

export const parseBatchHeadersText = (
  text: string
): { value: AuthFileHeaders | null; errorKey: AuthFileHeadersErrorKey | null } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, errorKey: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { value: null, errorKey: 'auth_files.headers_invalid_json' };
  }

  const errorKey = validateHeadersValue(parsed);
  if (errorKey) {
    return { value: null, errorKey };
  }

  return { value: parsed as AuthFileHeaders, errorKey: null };
};

export const buildBatchAuthFileFieldsPatch = (
  form: BatchFieldsFormState
): { patch: AuthFileFieldsPatch; errorKey: string | null } => {
  const patch: AuthFileFieldsPatch = {};

  // Priority
  if (form.priorityTouched) {
    const priorityText = form.priority.trim();
    if (priorityText) {
      const nextPriority = parsePriorityValue(priorityText);
      if (nextPriority === undefined) {
        return { patch: {}, errorKey: 'auth_files.batch_fields_priority_invalid' };
      }
      patch.priority = nextPriority;
    }
  }

  // Headers
  if (form.headersTouched) {
    const { value, errorKey } = parseBatchHeadersText(form.headersText);
    if (errorKey) return { patch: {}, errorKey };
    if (value) patch.headers = value; // empty touched → omit
  }

  // Text fields
  if (form.prefixTouched) patch.prefix = form.prefix.trim();
  if (form.proxyUrlTouched) patch.proxy_url = form.proxyUrl.trim();
  if (form.noteTouched) patch.note = form.note.trim();

  // Excluded models
  if (form.excludedModelsTouched) {
    patch.excluded_models = parseExcludedModelsText(form.excludedModelsText);
  }

  // Disable cooling
  if (form.disableCooling === 'true') patch.disable_cooling = true;
  if (form.disableCooling === 'false') patch.disable_cooling = false;

  // Toggles
  if (form.websocketsTouched) patch.websockets = Boolean(form.websockets);
  if (form.usingApiTouched) patch.using_api = Boolean(form.usingApi);

  return { patch, errorKey: null };
};

export const resolveAuthFileProviderKey = (
  file: Pick<AuthFileItem, 'type' | 'provider'>
): string => {
  const typeStr = String(file.type ?? '').trim().toLowerCase();
  const providerStr = String(file.provider ?? '').trim().toLowerCase();

  // Prefer type if it supports specialty fields
  if (supportsAuthFileWebsockets(typeStr) || supportsAuthFileUsingApi(typeStr)) {
    return typeStr;
  }

  // Fall back to provider if it supports specialty fields
  if (supportsAuthFileWebsockets(providerStr) || supportsAuthFileUsingApi(providerStr)) {
    return providerStr;
  }

  // Default to type
  return typeStr;
};

export const hasPatchKeys = (patch: AuthFileFieldsPatch): boolean =>
  Object.keys(patch).length > 0;

export const filterPatchForFile = (
  patch: AuthFileFieldsPatch,
  providerKey: string
): AuthFileFieldsPatch => {
  const result: AuthFileFieldsPatch = {};

  // Always include common fields
  if ('prefix' in patch) result.prefix = patch.prefix;
  if ('proxy_url' in patch) result.proxy_url = patch.proxy_url;
  if ('note' in patch) result.note = patch.note;
  if ('priority' in patch) result.priority = patch.priority;
  if ('excluded_models' in patch) result.excluded_models = patch.excluded_models;
  if ('headers' in patch) result.headers = patch.headers;
  if ('disable_cooling' in patch) result.disable_cooling = patch.disable_cooling;

  // Specialty fields - only include if provider supports them
  if ('websockets' in patch && supportsAuthFileWebsockets(providerKey)) {
    result.websockets = patch.websockets;
  }
  if ('using_api' in patch && supportsAuthFileUsingApi(providerKey)) {
    result.using_api = patch.using_api;
  }

  return result;
};

export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const run = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
};

// Re-export for hook convenience
export { supportsAuthFileWebsockets, supportsAuthFileUsingApi };
