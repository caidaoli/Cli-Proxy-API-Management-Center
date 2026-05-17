import type { AuthFileItem } from '../../types/authFile.ts';
import { resolveAuthProvider } from '../../utils/quota/validators.ts';

export type QuotaProviderType = 'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kimi';

export const QUOTA_PROVIDER_TYPES = new Set<QuotaProviderType>([
  'antigravity',
  'claude',
  'codex',
  'gemini-cli',
  'kimi',
]);

export const resolveAuthFileQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

export const resolveVisibleAuthFileQuotaType = (
  file: AuthFileItem,
  quotaFilterType: QuotaProviderType | null
): QuotaProviderType | null => {
  const fileQuotaType = resolveAuthFileQuotaType(file);
  if (!fileQuotaType) return null;
  if (quotaFilterType && fileQuotaType !== quotaFilterType) return null;
  return fileQuotaType;
};
