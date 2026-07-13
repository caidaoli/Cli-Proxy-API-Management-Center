import axios from 'axios';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type {
  AuthFilesUploadProgress,
  AuthFilesUploadResult,
} from '@/services/api/authFilesUpload';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import { getTypeLabel, isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';
import type { AuthFilesListQuery } from '@/features/authFiles/listQuery';
import {
  removeSelectedAuthFiles,
  selectAuthFiles,
  toggleAuthFileSelection,
  type AuthFileSelection,
} from '@/features/authFiles/selection';

type DeleteAllOptions = {
  filter: string;
  problemOnly: boolean;
  disabledOnly: boolean;
  enabledOnly: boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
  onResetDisabledOnly: () => void;
  onResetEnabledOnly: () => void;
};

type UploadAuthFilesOptions = {
  successMessage?: string;
};

const isCanceledRequest = (error: unknown): boolean =>
  axios.isCancel(error) ||
  (typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_CANCELED');

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  total: number;
  types: string[];
  typeCounts: Record<string, number>;
  enabledTypeCounts: Record<string, number>;
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  uploadProgress: AuthFilesUploadProgress | null;
  deleting: string | null;
  deletingAll: boolean;
  downloadingAll: boolean;
  statusUpdating: Record<string, boolean>;
  batchStatusUpdating: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: () => Promise<AuthFileItem[]>;
  handleUploadClick: () => void;
  uploadAuthFiles: (filesToUpload: File[], options?: UploadAuthFilesOptions) => Promise<boolean>;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleDownloadAll: () => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  toggleSelect: (file: AuthFileItem) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
};

export type UseAuthFilesDataOptions = {
  query: AuthFilesListQuery;
  loadKeyStatsForFiles: (files: AuthFileItem[]) => Promise<void>;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const { query, loadKeyStatsForFiles } = options;
  const { t } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>(['all']);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({ all: 0 });
  const [enabledTypeCounts, setEnabledTypeCounts] = useState<Record<string, number>>({ all: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<AuthFilesUploadProgress | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [selection, setSelection] = useState<AuthFileSelection>(new Map());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStatusPendingRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadRequestIdRef = useRef(0);
  const selectedFiles = useMemo(() => new Set(selection.keys()), [selection]);
  const selectionCount = selection.size;
  const toggleSelect = useCallback((file: AuthFileItem) => {
    setSelection((prev) => toggleAuthFileSelection(prev, file));
  }, []);

  const selectAllVisible = useCallback((visibleFiles: AuthFileItem[]) => {
    setSelection((prev) =>
      selectAuthFiles(
        prev,
        visibleFiles.filter((file) => !isRuntimeOnlyAuthFile(file))
      )
    );
  }, []);

  const deselectAll = useCallback(() => {
    setSelection(new Map());
  }, []);

  useEffect(() => {
    return () => loadControllerRef.current?.abort();
  }, []);

  const loadFiles = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++loadRequestIdRef.current;
    loadControllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.listPage(query, controller.signal);
      if (requestId !== loadRequestIdRef.current) return [];
      const nextFiles = data?.files || [];
      setFiles(nextFiles);
      setTotal(data?.total ?? 0);
      setTypes(data?.types?.length ? data.types : ['all']);
      setTypeCounts(data?.type_counts ?? { all: 0 });
      setEnabledTypeCounts(data?.enabled_type_counts ?? { all: 0 });
      void loadKeyStatsForFiles(nextFiles);
      return nextFiles;
    } catch (err: unknown) {
      if (isCanceledRequest(err)) return [];
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      if (requestId === loadRequestIdRef.current) {
        setError(errorMessage);
      }
      return [];
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [loadKeyStatsForFiles, query, t]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const uploadAuthFiles = useCallback(
    async (filesToUpload: File[], uploadOptions: UploadAuthFilesOptions = {}) => {
      if (filesToUpload.length === 0) return false;

      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      filesToUpload.forEach((file) => {
        if (!file.name.endsWith('.json')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > MAX_AUTH_FILE_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      if (invalidFiles.length > 0) {
        showNotification(t('auth_files.upload_error_json'), 'error');
      }
      if (oversizedFiles.length > 0) {
        showNotification(
          t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) }),
          'error'
        );
      }

      if (validFiles.length === 0) {
        return false;
      }

      setUploading(true);
      setUploadProgress({ loaded: 0, total: null, percent: null });

      try {
        let uploadResult: AuthFilesUploadResult;
        try {
          uploadResult = await authFilesApi.uploadBatch(validFiles, {
            onProgress: setUploadProgress,
          });
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
          return false;
        }

        const successCount = uploadResult.uploaded;
        const failed = uploadResult.failed;

        if (successCount > 0) {
          const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
          showNotification(
            `${uploadOptions.successMessage ?? t('auth_files.upload_success')}${suffix}`,
            failed.length ? 'warning' : 'success'
          );
          await loadFiles();
        }

        if (failed.length > 0) {
          const details = failed.map((item) => `${item.name}: ${item.message}`).join('; ');
          showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
        }

        return successCount > 0 && failed.length === 0;
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [loadFiles, showNotification, t]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      await uploadAuthFiles(Array.from(fileList));
      event.target.value = '';
    },
    [uploadAuthFiles]
  );

  const handleDelete = useCallback(
    (name: string) => {
      showConfirmation({
        title: t('auth_files.delete_title', { defaultValue: 'Delete File' }),
        message: `${t('auth_files.delete_confirm')} "${name}" ?`,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeleting(name);
          try {
            await authFilesApi.deleteFile(name);
            showNotification(t('auth_files.delete_success'), 'success');
            setSelection((prev) => removeSelectedAuthFiles(prev, [name]));
            await loadFiles();
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : '';
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeleting(null);
          }
        },
      });
    },
    [loadFiles, showConfirmation, showNotification, t]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const {
        filter,
        problemOnly,
        disabledOnly,
        enabledOnly,
        onResetFilterToAll,
        onResetProblemOnly,
        onResetDisabledOnly,
        onResetEnabledOnly,
      } = deleteAllOptions;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const isDisabledOnly = disabledOnly === true;
      const isEnabledOnly = enabledOnly === true;
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('auth_files.filter_all');
      let confirmMessage = t('auth_files.delete_all_confirm');
      if (isDisabledOnly || isEnabledOnly) {
        confirmMessage = t('auth_files.delete_filtered_result_confirm');
      } else if (isProblemOnly) {
        confirmMessage = isFiltered
          ? t('auth_files.delete_problem_filtered_confirm', { type: typeLabel })
          : t('auth_files.delete_problem_confirm');
      } else if (isFiltered) {
        confirmMessage = t('auth_files.delete_filtered_confirm', { type: typeLabel });
      }

      showConfirmation({
        title: t('auth_files.delete_all_title', { defaultValue: 'Delete All Files' }),
        message: confirmMessage,
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          setDeletingAll(true);
          try {
            if (!isFiltered && !isProblemOnly && !isDisabledOnly && !isEnabledOnly) {
              await authFilesApi.deleteAll();
              showNotification(t('auth_files.delete_all_success'), 'success');
              deselectAll();
              await loadFiles();
            } else {
              const result = await authFilesApi.deleteFiltered(query);
              const success = result.deleted ?? result.files?.length ?? 0;
              const failed = result.failed?.length ?? 0;
              const deletedNames = result.files ?? [];
              setSelection((prev) => removeSelectedAuthFiles(prev, deletedNames));

              if (success === 0 && failed === 0) {
                let emptyMessage = t('auth_files.delete_filtered_none', { type: typeLabel });
                if (isDisabledOnly || isEnabledOnly) {
                  emptyMessage = t('auth_files.delete_filtered_result_none');
                } else if (isProblemOnly) {
                  emptyMessage = isFiltered
                    ? t('auth_files.delete_problem_filtered_none', { type: typeLabel })
                    : t('auth_files.delete_problem_none');
                }
                showNotification(emptyMessage, 'info');
                return;
              }

              if (failed === 0 && (isDisabledOnly || isEnabledOnly)) {
                showNotification(
                  t('auth_files.delete_filtered_result_success', { count: success }),
                  'success'
                );
              } else if (failed === 0 && isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_success', {
                        count: success,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_success', { count: success }),
                  'success'
                );
              } else if (failed === 0) {
                showNotification(
                  t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
                  'success'
                );
              } else if (isDisabledOnly || isEnabledOnly) {
                showNotification(
                  t('auth_files.delete_filtered_result_partial', { success, failed }),
                  'warning'
                );
              } else if (isProblemOnly) {
                showNotification(
                  isFiltered
                    ? t('auth_files.delete_problem_filtered_partial', {
                        success,
                        failed,
                        type: typeLabel,
                      })
                    : t('auth_files.delete_problem_partial', { success, failed }),
                  'warning'
                );
              } else {
                showNotification(
                  t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
                  'warning'
                );
              }

              if (isFiltered) {
                onResetFilterToAll();
              }
              if (isProblemOnly) {
                onResetProblemOnly();
              }
              if (isDisabledOnly) {
                onResetDisabledOnly();
              }
              if (isEnabledOnly) {
                onResetEnabledOnly();
              }
              return;
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : '';
            showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
          } finally {
            setDeletingAll(false);
          }
        },
      });
    },
    [deselectAll, loadFiles, query, showConfirmation, showNotification, t]
  );

  const handleDownload = useCallback(
    async (name: string) => {
      try {
        const { blob, filename } = await authFilesApi.downloadFile(name);
        downloadBlob({ filename, blob });
        showNotification(t('auth_files.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [showNotification, t]
  );

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true);
    try {
      const { blob, filename } = await authFilesApi.downloadAll();
      downloadBlob({ filename, blob });
      showNotification(t('auth_files.download_all_success'), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    } finally {
      setDownloadingAll(false);
    }
  }, [showNotification, t]);

  const handleStatusToggle = useCallback(
    async (item: AuthFileItem, enabled: boolean) => {
      const name = item.name;
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, disabled: nextDisabled } : f)));

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: res.disabled } : f))
        );
        setSelection((prev) => {
          if (!prev.has(name)) return prev;
          const next = new Map(prev);
          next.set(name, { disabled: res.disabled });
          return next;
        });
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
        await loadFiles();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: previousDisabled } : f))
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [loadFiles, showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      if (batchStatusPendingRef.current) return;

      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (uniqueNames.some((name) => statusUpdating[name] === true)) return;

      const originalDisabled = new Map<string, boolean>();
      uniqueNames.forEach((name) => {
        const snapshot = selection.get(name);
        if (snapshot) originalDisabled.set(name, snapshot.disabled);
      });
      const targetNames = new Set(originalDisabled.keys());
      const targetNameList = Array.from(targetNames);
      if (targetNameList.length === 0) return;

      const nextDisabled = !enabled;

      batchStatusPendingRef.current = true;
      setBatchStatusUpdating(true);
      setStatusUpdating((prev) => {
        const next = { ...prev };
        targetNameList.forEach((name) => {
          next[name] = true;
        });
        return next;
      });
      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(file.name) ? { ...file, disabled: nextDisabled } : file
        )
      );

      try {
        const results = await Promise.allSettled(
          targetNameList.map((name) => authFilesApi.setStatus(name, nextDisabled))
        );

        let successCount = 0;
        let failCount = 0;
        const failedNames = new Set<string>();
        const confirmedDisabled = new Map<string, boolean>();

        results.forEach((result, index) => {
          const name = targetNameList[index];
          if (result.status === 'fulfilled') {
            successCount++;
            confirmedDisabled.set(name, result.value.disabled);
          } else {
            failCount++;
            failedNames.add(name);
          }
        });

        setFiles((prev) =>
          prev.map((file) => {
            if (failedNames.has(file.name)) {
              return { ...file, disabled: originalDisabled.get(file.name) === true };
            }
            if (confirmedDisabled.has(file.name)) {
              return { ...file, disabled: confirmedDisabled.get(file.name) };
            }
            return file;
          })
        );

        if (failCount === 0) {
          showNotification(
            t('auth_files.batch_status_success', { count: successCount }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
            'warning'
          );
        }

        deselectAll();
        await loadFiles();
      } finally {
        batchStatusPendingRef.current = false;
        setBatchStatusUpdating(false);
        setStatusUpdating((prev) => {
          const next = { ...prev };
          targetNameList.forEach((name) => {
            delete next[name];
          });
          return next;
        });
      }
    },
    [deselectAll, loadFiles, selection, showNotification, statusUpdating, t]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      showConfirmation({
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          const results = await Promise.allSettled(
            uniqueNames.map((name) => authFilesApi.deleteFile(name))
          );

          const deleted: string[] = [];
          let failCount = 0;
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              deleted.push(uniqueNames[index]);
            } else {
              failCount++;
            }
          });

          if (deleted.length > 0) {
            const deletedSet = new Set(deleted);
            setFiles((prev) => prev.filter((file) => !deletedSet.has(file.name)));
          }

          setSelection((prev) => removeSelectedAuthFiles(prev, deleted));

          if (failCount === 0) {
            showNotification(
              `${t('auth_files.delete_all_success')} (${deleted.length})`,
              'success'
            );
          } else {
            showNotification(
              t('auth_files.delete_filtered_partial', {
                success: deleted.length,
                failed: failCount,
                type: t('auth_files.filter_all'),
              }),
              'warning'
            );
          }
          await loadFiles();
        },
      });
    },
    [loadFiles, showConfirmation, showNotification, t]
  );

  return {
    files,
    total,
    types,
    typeCounts,
    enabledTypeCounts,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    uploadProgress,
    deleting,
    deletingAll,
    downloadingAll,
    statusUpdating,
    batchStatusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    uploadAuthFiles,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleDownloadAll,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchSetStatus,
    batchDelete,
  };
}
