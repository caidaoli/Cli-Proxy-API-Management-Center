import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import { useNotificationStore } from '@/stores';
import {
  type BatchFieldsFormState,
  createEmptyBatchFieldsForm,
  parseBatchHeadersText,
  buildBatchAuthFileFieldsPatch,
  buildBatchAuthFileFieldsUpdates,
  resolveAuthFileProviderKey,
  hasPatchKeys,
  supportsAuthFileWebsockets,
  supportsAuthFileUsingApi,
} from '@/features/authFiles/batchFieldsPatch';
import { parsePriorityValue } from '@/features/authFiles/constants';

export type UseAuthFilesBatchFieldsEditorOptions = {
  disableControls: boolean;
  files: AuthFileItem[];
  selectedNames: string[];
  loadFiles: () => Promise<unknown>;
  deselectAll: () => void;
};

export type UseAuthFilesBatchFieldsEditorResult = {
  open: boolean;
  form: BatchFieldsFormState;
  saving: boolean;
  headersError: string | null;
  priorityError: string | null;
  showWebsockets: boolean;
  showUsingApi: boolean;
  selectedCount: number;
  canApply: boolean;
  openBatchFieldsEditor: () => void;
  closeBatchFieldsEditor: () => void;
  setField: <K extends keyof BatchFieldsFormState>(key: K, value: BatchFieldsFormState[K]) => void;
  handleApply: () => Promise<void>;
};

export function useAuthFilesBatchFieldsEditor(
  options: UseAuthFilesBatchFieldsEditorOptions
): UseAuthFilesBatchFieldsEditorResult {
  const { disableControls, files, selectedNames, loadFiles, deselectAll } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BatchFieldsFormState>(createEmptyBatchFieldsForm());

  const selectedCount = selectedNames.length;

  const selectedItems = useMemo(() => {
    return selectedNames.map((name) => {
      const file = files.find((f) => f.name === name);
      return file || ({ name } as AuthFileItem);
    });
  }, [selectedNames, files]);

  const showWebsockets = useMemo(() => {
    return selectedItems.some((item) =>
      supportsAuthFileWebsockets(resolveAuthFileProviderKey(item))
    );
  }, [selectedItems]);

  const showUsingApi = useMemo(() => {
    return selectedItems.some((item) => supportsAuthFileUsingApi(resolveAuthFileProviderKey(item)));
  }, [selectedItems]);

  const headersError = useMemo(() => {
    if (!form.headersTouched) return null;
    const { errorKey } = parseBatchHeadersText(form.headersText);
    return errorKey ? t(errorKey) : null;
  }, [form.headersText, form.headersTouched, t]);

  const priorityError = useMemo(() => {
    if (!form.priorityTouched) return null;
    const priorityText = form.priority.trim();
    if (!priorityText) return null;
    const parsed = parsePriorityValue(priorityText);
    return parsed === undefined ? t('auth_files.batch_fields_priority_invalid') : null;
  }, [form.priority, form.priorityTouched, t]);

  const openBatchFieldsEditor = useCallback(() => {
    if (disableControls || selectedNames.length === 0 || saving) {
      return;
    }
    setForm(createEmptyBatchFieldsForm());
    setOpen(true);
  }, [disableControls, selectedNames.length, saving]);

  const closeBatchFieldsEditor = useCallback(() => {
    if (saving) return;
    setOpen(false);
  }, [saving]);

  const setField = useCallback(
    <K extends keyof BatchFieldsFormState>(key: K, value: BatchFieldsFormState[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'prefix') {
          next.prefixTouched = true;
        } else if (key === 'proxyUrl') {
          next.proxyUrlTouched = true;
        } else if (key === 'note') {
          next.noteTouched = true;
        } else if (key === 'priority') {
          next.priorityTouched = true;
        } else if (key === 'excludedModelsText') {
          next.excludedModelsTouched = true;
        } else if (key === 'headersText') {
          next.headersTouched = true;
        } else if (key === 'websockets') {
          next.websocketsTouched = true;
        } else if (key === 'usingApi') {
          next.usingApiTouched = true;
        }
        return next;
      });
    },
    []
  );

  const { patch, errorKey } = useMemo(() => {
    return buildBatchAuthFileFieldsPatch(form);
  }, [form]);

  const canApply = useMemo(() => {
    return Boolean(
      !disableControls &&
      !saving &&
      open &&
      selectedNames.length > 0 &&
      hasPatchKeys(patch) &&
      !errorKey &&
      !headersError &&
      !priorityError
    );
  }, [
    disableControls,
    saving,
    open,
    selectedNames.length,
    patch,
    errorKey,
    headersError,
    priorityError,
  ]);

  const handleApply = useCallback(async () => {
    if (!canApply) return;

    const { patch: finalPatch, errorKey: finalErrorKey } = buildBatchAuthFileFieldsPatch(form);
    if (finalErrorKey) {
      showNotification(t(finalErrorKey), 'error');
      return;
    }

    setSaving(true);

    try {
      const { updates, skippedCount } = buildBatchAuthFileFieldsUpdates(selectedItems, finalPatch);
      if (updates.length === 0) {
        showNotification(t('auth_files.batch_fields_all_skipped'), 'info');
        return;
      }

      const result = await authFilesApi.patchFieldsBatch(updates);
      const successCount = result.updated;
      const failedCount = result.failed.length;

      if (successCount === selectedItems.length) {
        showNotification(t('auth_files.batch_fields_success', { count: successCount }), 'success');
      } else if (failedCount === selectedItems.length) {
        showNotification(t('auth_files.batch_fields_all_failed', { failed: failedCount }), 'error');
      } else {
        showNotification(
          t('auth_files.batch_fields_partial', {
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
          }),
          'warning'
        );
      }

      await loadFiles();

      if (successCount > 0) {
        deselectAll();
        setOpen(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showNotification(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [canApply, form, selectedItems, deselectAll, loadFiles, showNotification, t]);

  return {
    open,
    form,
    saving,
    headersError,
    priorityError,
    showWebsockets,
    showUsingApi,
    selectedCount,
    canApply,
    openBatchFieldsEditor,
    closeBatchFieldsEditor,
    setField,
    handleApply,
  };
}
