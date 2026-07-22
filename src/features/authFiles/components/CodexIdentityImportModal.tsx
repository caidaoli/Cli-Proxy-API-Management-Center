import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  CodexIdentityError,
  countCodexIdentityAccounts,
  parseCodexIdentityAccounts,
  type CodexIdentityAccount,
  type CodexIdentityErrorCode,
} from '@/features/authFiles/codexIdentity';
import styles from './CodexIdentityImportModal.module.scss';

type CodexIdentityImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImport: (accounts: CodexIdentityAccount[]) => Promise<void>;
};

const ERROR_KEYS: Record<CodexIdentityErrorCode, string> = {
  invalid_input: 'auth_files.codex_identity_invalid_input',
  invalid_token: 'auth_files.codex_identity_invalid_token',
  expired_token: 'auth_files.codex_identity_expired_token',
  missing_email: 'auth_files.codex_identity_missing_email',
  duplicate_account: 'auth_files.codex_identity_duplicate_account',
};

export function CodexIdentityImportModal({
  open,
  onClose,
  onImport,
}: CodexIdentityImportModalProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const accountCount = useMemo(() => countCodexIdentityAccounts(input), [input]);

  useEffect(() => {
    if (!open) {
      setInput('');
      setError('');
      setImporting(false);
    }
  }, [open]);

  const handleImport = async () => {
    setError('');
    let accounts: CodexIdentityAccount[];
    try {
      accounts = parseCodexIdentityAccounts(input);
    } catch (parseError: unknown) {
      if (parseError instanceof CodexIdentityError) {
        setError(t(ERROR_KEYS[parseError.code], { account: parseError.account ?? '' }));
      } else {
        setError(t('auth_files.codex_identity_invalid_input'));
      }
      return;
    }

    setImporting(true);
    try {
      await onImport(accounts);
      onClose();
    } catch (importError: unknown) {
      setError(
        importError instanceof Error && importError.message
          ? importError.message
          : t('auth_files.codex_identity_import_failed')
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('auth_files.codex_identity_title')}
      onClose={onClose}
      closeDisabled={importing}
      width={720}
      footer={
        <div className={styles.footer}>
          <Button
            variant="ghost"
            onClick={() => {
              setInput('');
              setError('');
            }}
            disabled={importing || !input}
          >
            {t('auth_files.codex_identity_clear')}
          </Button>
          <div className={styles.footerActions}>
            <Button variant="secondary" onClick={onClose} disabled={importing}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void handleImport()}
              disabled={accountCount === 0}
              loading={importing}
            >
              {t('auth_files.codex_identity_confirm')}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.typeRow}>
          <span>{t('auth_files.codex_identity_type_label')}</span>
          <strong>codex</strong>
        </div>

        <div className={styles.inputShell}>
          <div className={styles.inputHeader}>
            <span>AT / AUTH SESSION</span>
            <strong>
              {t('auth_files.codex_identity_accounts', {
                count: accountCount,
              })}
            </strong>
          </div>
          <textarea
            className={styles.textarea}
            value={input}
            onChange={(event) => {
              setInput(event.currentTarget.value);
              setError('');
            }}
            placeholder={t('auth_files.codex_identity_placeholder')}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            disabled={importing}
            aria-label={t('auth_files.codex_identity_input_label')}
          />
        </div>

        <p className={styles.hint}>{t('auth_files.codex_identity_hint')}</p>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
