import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  BatchFieldsFormState,
  DisableCoolingChoice,
} from '@/features/authFiles/batchFieldsPatch';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesBatchFieldsEditorModalProps = {
  open: boolean;
  saving: boolean;
  disableControls: boolean;
  selectedCount: number;
  form: BatchFieldsFormState;
  headersError: string | null;
  priorityError: string | null;
  showWebsockets: boolean;
  showUsingApi: boolean;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
  onChange: <K extends keyof BatchFieldsFormState>(key: K, value: BatchFieldsFormState[K]) => void;
};

export function AuthFilesBatchFieldsEditorModal(props: AuthFilesBatchFieldsEditorModalProps) {
  const { t } = useTranslation();
  const {
    open,
    saving,
    disableControls,
    selectedCount,
    form,
    headersError,
    priorityError,
    showWebsockets,
    showUsingApi,
    canApply,
    onClose,
    onApply,
    onChange,
  } = props;

  const disableCoolingOptions = [
    {
      value: 'unchanged',
      label: t('auth_files.batch_fields_unchanged'),
    },
    { value: 'true', label: t('auth_files.batch_fields_disable_cooling_true') },
    { value: 'false', label: t('auth_files.batch_fields_disable_cooling_false') },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      width={720}
      title={t('auth_files.batch_fields_title', { count: selectedCount })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onApply}
            loading={saving}
            disabled={!canApply || disableControls || saving}
          >
            {t('auth_files.batch_fields_apply')}
          </Button>
        </>
      }
    >
      <div className={styles.prefixProxyEditor}>
        <div
          className="hint"
          style={{
            textAlign: 'left',
            fontStyle: 'normal',
            color: 'var(--text-secondary)',
            marginBottom: '8px',
          }}
        >
          {t('auth_files.batch_fields_hint', { count: selectedCount })}
        </div>
        <div className={styles.prefixProxyFields}>
          <Input
            label={t('auth_files.prefix_label')}
            value={form.prefix}
            disabled={disableControls || saving}
            onChange={(e) => onChange('prefix', e.target.value)}
          />

          <Input
            label={t('auth_files.proxy_url_label')}
            value={form.proxyUrl}
            placeholder={t('auth_files.proxy_url_placeholder')}
            disabled={disableControls || saving}
            onChange={(e) => onChange('proxyUrl', e.target.value)}
          />

          <Input
            label={t('auth_files.priority_label')}
            value={form.priority}
            placeholder={t('auth_files.priority_placeholder')}
            hint={t('auth_files.priority_hint')}
            error={priorityError || undefined}
            disabled={disableControls || saving}
            onChange={(e) => onChange('priority', e.target.value)}
          />

          <div className="form-group">
            <label>{t('auth_files.excluded_models_label')}</label>
            <textarea
              className="input"
              value={form.excludedModelsText}
              placeholder={t('auth_files.excluded_models_placeholder')}
              rows={4}
              disabled={disableControls || saving}
              onChange={(e) => onChange('excludedModelsText', e.target.value)}
            />
            <div className="hint">{t('auth_files.excluded_models_hint')}</div>
          </div>

          <div className="form-group">
            <label>{t('auth_files.headers_label')}</label>
            <textarea
              className={`input ${headersError ? styles.prefixProxyTextareaInvalid : ''}`}
              value={form.headersText}
              placeholder={t('auth_files.headers_placeholder')}
              rows={4}
              aria-invalid={Boolean(headersError)}
              disabled={disableControls || saving}
              onChange={(e) => onChange('headersText', e.target.value)}
            />
            {headersError && <div className="error-box">{headersError}</div>}
            <div className="hint">{t('auth_files.batch_fields_headers_clear_hint')}</div>
          </div>

          <div className="form-group">
            <label>{t('auth_files.disable_cooling_label')}</label>
            <Select
              value={form.disableCooling}
              options={disableCoolingOptions}
              disabled={disableControls || saving}
              onChange={(val) => onChange('disableCooling', val as DisableCoolingChoice)}
            />
            <div className="hint">{t('auth_files.disable_cooling_hint')}</div>
          </div>

          <Input
            label={t('auth_files.note_label')}
            value={form.note}
            placeholder={t('auth_files.note_placeholder')}
            hint={t('auth_files.note_hint')}
            disabled={disableControls || saving}
            onChange={(e) => onChange('note', e.target.value)}
          />

          {showWebsockets && (
            <div className="form-group">
              <label>{t('auth_files.websockets_label')}</label>
              <ToggleSwitch
                checked={form.websockets}
                disabled={disableControls || saving}
                ariaLabel={t('auth_files.websockets_label')}
                onChange={(value) => onChange('websockets', value)}
              />
              <div className="hint">{t('auth_files.websockets_hint')}</div>
            </div>
          )}

          {showUsingApi && (
            <div className="form-group">
              <label>{t('auth_files.using_api_label')}</label>
              <ToggleSwitch
                checked={form.usingApi}
                disabled={disableControls || saving}
                ariaLabel={t('auth_files.using_api_label')}
                onChange={(value) => onChange('usingApi', value)}
              />
              <div className="hint">{t('auth_files.using_api_hint')}</div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
