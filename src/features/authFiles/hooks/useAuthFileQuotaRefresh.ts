import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIMI_CONFIG,
  XAI_CONFIG,
} from '@/components/quota';
import {
  captureQuotaCacheGeneration,
  commitIfQuotaCacheCurrent,
  useNotificationStore,
  useQuotaStore,
} from '@/stores';
import type { AuthFileItem } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import type { QuotaProviderType } from '@/features/authFiles/constants';
import { canRefreshAuthFileQuota } from '@/features/authFiles/quotaDisplay';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

type AuthFileQuotaConfig = {
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  buildLoadingState: () => unknown;
  buildSuccessState: (data: unknown) => unknown;
  buildErrorState: (message: string, status?: number) => unknown;
};

type QuotaRefreshResult =
  | { status: 'success'; name: string }
  | { status: 'failed'; name: string; message: string }
  | { status: 'skipped'; name: string };

type QuotaRefreshOptions = {
  notify?: boolean;
};

type UnknownQuotaSetter = (
  updater: (prev: Record<string, unknown>) => Record<string, unknown>
) => void;

export const getAuthFileQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  if (type === 'xai') return XAI_CONFIG;
  return GEMINI_CLI_CONFIG;
};

const readQuotaState = (fileName: string, quotaType: QuotaProviderType): QuotaState => {
  const state = useQuotaStore.getState();
  if (quotaType === 'antigravity') return state.antigravityQuota[fileName] as QuotaState;
  if (quotaType === 'claude') return state.claudeQuota[fileName] as QuotaState;
  if (quotaType === 'codex') return state.codexQuota[fileName] as QuotaState;
  if (quotaType === 'kimi') return state.kimiQuota[fileName] as QuotaState;
  if (quotaType === 'xai') return state.xaiQuota[fileName] as QuotaState;
  return state.geminiCliQuota[fileName] as QuotaState;
};

const updateQuotaState = (
  quotaType: QuotaProviderType,
  updater: (prev: Record<string, unknown>) => Record<string, unknown>
) => {
  const state = useQuotaStore.getState();
  if (quotaType === 'antigravity') {
    (state.setAntigravityQuota as UnknownQuotaSetter)(updater);
    return;
  }
  if (quotaType === 'claude') {
    (state.setClaudeQuota as UnknownQuotaSetter)(updater);
    return;
  }
  if (quotaType === 'codex') {
    (state.setCodexQuota as UnknownQuotaSetter)(updater);
    return;
  }
  if (quotaType === 'kimi') {
    (state.setKimiQuota as UnknownQuotaSetter)(updater);
    return;
  }
  if (quotaType === 'xai') {
    (state.setXaiQuota as UnknownQuotaSetter)(updater);
    return;
  }
  (state.setGeminiCliQuota as UnknownQuotaSetter)(updater);
};

export function useAuthFileQuotaRefresh() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const refreshQuotaForFile = useCallback(
    async (
      file: AuthFileItem,
      quotaType: QuotaProviderType,
      options: QuotaRefreshOptions = {}
    ): Promise<QuotaRefreshResult> => {
      const notify = options.notify ?? true;
      if (!canRefreshAuthFileQuota(file, quotaType)) {
        return { status: 'skipped', name: file.name };
      }

      const currentQuota = readQuotaState(file.name, quotaType);
      if (currentQuota?.status === 'loading') {
        return { status: 'skipped', name: file.name };
      }

      const config = getAuthFileQuotaConfig(quotaType) as AuthFileQuotaConfig;
      const cacheGeneration = captureQuotaCacheGeneration();

      updateQuotaState(quotaType, (prev) => ({
        ...prev,
        [file.name]: config.buildLoadingState(),
      }));

      try {
        const data = await config.fetchQuota(file, t);
        const committed = commitIfQuotaCacheCurrent(cacheGeneration, () => {
          updateQuotaState(quotaType, (prev) => ({
            ...prev,
            [file.name]: config.buildSuccessState(data),
          }));
          if (notify) {
            showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
          }
        });
        return committed
          ? { status: 'success', name: file.name }
          : { status: 'skipped', name: file.name };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        const committed = commitIfQuotaCacheCurrent(cacheGeneration, () => {
          updateQuotaState(quotaType, (prev) => ({
            ...prev,
            [file.name]: config.buildErrorState(message, status),
          }));
          if (notify) {
            showNotification(
              t('auth_files.quota_refresh_failed', { name: file.name, message }),
              'error'
            );
          }
        });
        return committed
          ? { status: 'failed', name: file.name, message }
          : { status: 'skipped', name: file.name };
      }
    },
    [showNotification, t]
  );

  return { refreshQuotaForFile };
}
