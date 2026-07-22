import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import type { AuthFileItem } from '@/types';
import {
  buildAuthFileTestRequest,
  DEFAULT_AUTH_FILE_TEST_PROMPT,
  formatAuthFileTestResponse,
} from '@/features/authFiles/testRequest';
import styles from '@/pages/AuthFilesPage.module.scss';

type TestResult = {
  state: 'idle' | 'sending' | 'success' | 'error';
  text: string;
};

export type AuthFileTestModalProps = {
  open: boolean;
  file: AuthFileItem | null;
  onClose: () => void;
};

export function AuthFileTestModal({ open, file, onClose }: AuthFileTestModalProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<
    { id: string; display_name?: string; type?: string; owned_by?: string }[]
  >([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [content, setContent] = useState(DEFAULT_AUTH_FILE_TEST_PROMPT);
  const [result, setResult] = useState<TestResult>({ state: 'idle', text: '' });
  const requestGenerationRef = useRef(0);
  const sendAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !file) return;

    const generation = ++requestGenerationRef.current;
    setModels([]);
    setSelectedModel('');
    setContent(DEFAULT_AUTH_FILE_TEST_PROMPT);
    setResult({ state: 'idle', text: '' });
    setModelsLoading(true);

    void authFilesApi
      .getModelsForAuthFile(file.name)
      .then((nextModels) => {
        if (requestGenerationRef.current !== generation) return;
        setModels(nextModels);
        setSelectedModel(nextModels[0]?.id ?? '');
      })
      .catch((error: unknown) => {
        if (requestGenerationRef.current !== generation) return;
        const message = error instanceof Error ? error.message : t('common.unknown_error');
        setResult({
          state: 'error',
          text: t('auth_files.test_models_failed', { message }),
        });
      })
      .finally(() => {
        if (requestGenerationRef.current === generation) {
          setModelsLoading(false);
        }
      });

    return () => {
      requestGenerationRef.current += 1;
      sendAbortRef.current?.abort();
      sendAbortRef.current = null;
    };
  }, [file, open, t]);

  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        label:
          model.display_name && model.display_name !== model.id
            ? `${model.display_name} (${model.id})`
            : model.id,
      })),
    [models]
  );

  const handleClose = useCallback(() => {
    requestGenerationRef.current += 1;
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    onClose();
  }, [onClose]);

  const handleSend = useCallback(async () => {
    if (!file || !selectedModel || !content.trim() || result.state === 'sending') return;

    const generation = ++requestGenerationRef.current;
    const abortController = new AbortController();
    sendAbortRef.current?.abort();
    sendAbortRef.current = abortController;
    setResult({ state: 'sending', text: t('auth_files.test_sending') });

    try {
      const selectedModelInfo = models.find((model) => model.id === selectedModel);
      const request = buildAuthFileTestRequest(
        file,
        selectedModel,
        content,
        selectedModelInfo?.type ?? selectedModelInfo?.owned_by
      );
      const response = await apiCallApi.request(request, {
        signal: abortController.signal,
        timeout: 120_000,
      });
      if (requestGenerationRef.current !== generation) return;

      const responseText = formatAuthFileTestResponse(response);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        setResult({
          state: 'error',
          text: [getApiCallErrorMessage(response), responseText].filter(Boolean).join('\n\n'),
        });
        return;
      }

      setResult({
        state: 'success',
        text: [`HTTP ${response.statusCode}`, responseText].filter(Boolean).join('\n\n'),
      });
    } catch (error: unknown) {
      if (requestGenerationRef.current !== generation || abortController.signal.aborted) return;
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      setResult({ state: 'error', text: message });
    } finally {
      if (requestGenerationRef.current === generation) {
        sendAbortRef.current = null;
      }
    }
  }, [content, file, models, result.state, selectedModel, t]);

  const sending = result.state === 'sending';
  const sendDisabled = modelsLoading || sending || !selectedModel || !content.trim();

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('auth_files.test_title', { name: file?.name ?? '' })}
      width={620}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            {t('common.close')}
          </Button>
          <Button size="sm" onClick={() => void handleSend()} disabled={sendDisabled}>
            {sending && <LoadingSpinner size={14} />}
            {t('auth_files.test_send')}
          </Button>
        </>
      }
    >
      <div className={styles.testModalContent}>
        <div className={styles.testAccountSummary}>
          <span>{t('auth_files.test_account')}</span>
          <strong>{file?.name ?? '-'}</strong>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="auth-file-test-model">{t('auth_files.test_model')}</label>
          {modelOptions.length > 0 ? (
            <Select
              id="auth-file-test-model"
              value={selectedModel}
              options={modelOptions}
              onChange={setSelectedModel}
              ariaLabel={t('auth_files.test_model')}
              disabled={sending}
            />
          ) : (
            <input
              id="auth-file-test-model"
              className="input"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.currentTarget.value)}
              placeholder={
                modelsLoading ? t('auth_files.models_loading') : t('auth_files.test_model_empty')
              }
              disabled={modelsLoading || sending}
              autoComplete="off"
            />
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="auth-file-test-content">{t('auth_files.test_content')}</label>
          <textarea
            id="auth-file-test-content"
            className={styles.textarea}
            rows={5}
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            disabled={sending}
          />
          <span className={styles.fieldHint}>{t('auth_files.test_non_stream_hint')}</span>
        </div>

        <div
          className={`${styles.testResult} ${
            result.state === 'success'
              ? styles.testResultSuccess
              : result.state === 'error'
                ? styles.testResultError
                : ''
          }`}
          role="status"
          aria-live="polite"
        >
          {result.text || t('auth_files.test_ready')}
        </div>
      </div>
    </Modal>
  );
}
