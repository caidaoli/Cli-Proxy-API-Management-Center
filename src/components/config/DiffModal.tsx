import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DIFF_CONTEXT_LINES, buildDiffCards, type DiffChunkCard } from './diffModalUtils';
import styles from './DiffModal.module.scss';

type DiffModalProps = {
  open: boolean;
  original: string;
  modified: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function DiffModal({
  open,
  original,
  modified,
  onConfirm,
  onCancel,
  loading = false,
}: DiffModalProps) {
  const { t } = useTranslation();

  const diffCards = useMemo<DiffChunkCard[]>(() => {
    return buildDiffCards(original, modified);
  }, [modified, original]);

  return (
    <Modal
      open={open}
      title={t('config_management.diff.title')}
      onClose={onCancel}
      width="min(1200px, 90vw)"
      className={styles.diffModal}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} loading={loading} disabled={loading}>
            {t('config_management.diff.confirm')}
          </Button>
        </>
      }
    >
      <div className={styles.content}>
        {diffCards.length === 0 ? (
          <div className={styles.emptyState}>{t('config_management.diff.no_changes')}</div>
        ) : (
          <div className={styles.diffList}>
            {diffCards.map((card, index) => (
              <article key={card.id} className={styles.diffCard}>
                <div className={styles.diffCardHeader}>#{index + 1}</div>
                <div className={styles.diffColumns}>
                  <section className={styles.diffColumn}>
                    <header className={styles.diffColumnHeader}>
                      <span>{t('config_management.diff.current')}</span>
                      <span className={styles.lineMeta}>
                        <span className={styles.lineRange}>L{card.current.changedRangeLabel}</span>
                        <span className={styles.contextRange}>
                          ±{DIFF_CONTEXT_LINES}: L{card.current.contextRangeLabel}
                        </span>
                      </span>
                    </header>
                    <div className={styles.codeList}>
                      {card.current.lines.map((line) => (
                        <div
                          key={`${card.id}-a-${line.lineNumber}`}
                          className={`${styles.codeLine} ${line.changed ? styles.codeLineChanged : ''}`}
                        >
                          <span className={styles.codeLineNumber}>{line.lineNumber}</span>
                          <code className={styles.codeLineText}>{line.text || ' '}</code>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className={styles.diffColumn}>
                    <header className={styles.diffColumnHeader}>
                      <span>{t('config_management.diff.modified')}</span>
                      <span className={styles.lineMeta}>
                        <span className={styles.lineRange}>L{card.modified.changedRangeLabel}</span>
                        <span className={styles.contextRange}>
                          ±{DIFF_CONTEXT_LINES}: L{card.modified.contextRangeLabel}
                        </span>
                      </span>
                    </header>
                    <div className={styles.codeList}>
                      {card.modified.lines.map((line) => (
                        <div
                          key={`${card.id}-b-${line.lineNumber}`}
                          className={`${styles.codeLine} ${line.changed ? styles.codeLineChanged : ''}`}
                        >
                          <span className={styles.codeLineNumber}>{line.lineNumber}</span>
                          <code className={styles.codeLineText}>{line.text || ' '}</code>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
