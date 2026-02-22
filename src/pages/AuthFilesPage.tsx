import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { copyToClipboard } from '@/utils/clipboard';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  type QuotaProviderType,
  type ResolvedTheme
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileDetailModal } from '@/features/authFiles/components/AuthFileDetailModal';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { readAuthFilesUiState, writeAuthFilesUiState } from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import { authFilesApi, type CodexCleanupEvent } from '@/services/api/authFiles';
import type { AuthFileItem } from '@/types';
import styles from './AuthFilesPage.module.scss';

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [pageSizeInput, setPageSizeInput] = useState('9');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AuthFileItem | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);

  const { keyStats, statusBarByAuthIndex, loadKeyStats } = useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    fileInputRef,
    loadFiles,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    toggleSelect,
    selectAllVisible,
    deselectAll,
    batchSetStatus,
    batchDelete
  } = useAuthFilesData({ refreshKeyStats: loadKeyStats });

  const statusBarCache = useAuthFilesStatusBarCache(files, statusBarByAuthIndex);

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias
  } = useAuthFilesOauth({ viewMode, files });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    loadFiles,
    loadKeyStats
  });

  const disableControls = connectionStatus !== 'connected';
  const [codexCleaning, setCodexCleaning] = useState(false);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleanupTotal, setCleanupTotal] = useState(0);
  const [cleanupCurrent, setCleanupCurrent] = useState(0);
  const [cleanupDeleted, setCleanupDeleted] = useState(0);
  const [cleanupLogs, setCleanupLogs] = useState<string[]>([]);
  const [cleanupDone, setCleanupDone] = useState(false);
  const cleanupAbortRef = useRef<AbortController | null>(null);
  const cleanupLogsEndRef = useRef<HTMLDivElement | null>(null);
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (!persisted) return;

    if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
      setFilter(persisted.filter);
    }
    if (typeof persisted.search === 'string') {
      setSearch(persisted.search);
    }
    if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
      setPage(Math.max(1, Math.round(persisted.page)));
    }
    if (typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)) {
      setPageSize(clampCardPageSize(persisted.pageSize));
    }
  }, []);

  useEffect(() => {
    writeAuthFilesUiState({ filter, search, page, pageSize });
  }, [filter, search, page, pageSize]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

  const commitPageSizeInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const next = clampCardPageSize(value);
    setPageSize(next);
    setPageSizeInput(String(next));
    setPage(1);
  };

  const handlePageSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    setPageSizeInput(rawValue);

    const trimmed = rawValue.trim();
    if (!trimmed) return;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const rounded = Math.round(parsed);
    if (rounded < MIN_CARD_PAGE_SIZE || rounded > MAX_CARD_PAGE_SIZE) return;

    setPageSize(rounded);
    setPage(1);
  };

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadFiles(), loadKeyStats(), loadExcluded(), loadModelAlias()]);
  }, [loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  const handleCodexCleanup = useCallback(async () => {
    setCodexCleaning(true);
    setCleanupModalOpen(true);
    setCleanupTotal(0);
    setCleanupCurrent(0);
    setCleanupDeleted(0);
    setCleanupLogs([]);
    setCleanupDone(false);

    const abort = new AbortController();
    cleanupAbortRef.current = abort;

    try {
      await authFilesApi.codexCleanup((ev: CodexCleanupEvent) => {
        if (ev.type === 'start') {
          setCleanupTotal(ev.total);
          setCleanupLogs((prev) => [...prev, t('auth_files.codex_cleanup_log_start', { total: ev.total })]);
        } else if (ev.type === 'progress') {
          setCleanupCurrent(ev.index);
          const status = ev.deleted
            ? `✗ ${t('auth_files.codex_cleanup_log_deleted')}`
            : ev.error
              ? `⚠ ${ev.error}`
              : `✓ ${t('auth_files.codex_cleanup_log_valid')}`;
          setCleanupLogs((prev) => [...prev, `[${ev.index}/${ev.total}] ${ev.name} — ${status}`]);
          if (ev.deleted) {
            setCleanupDeleted((prev) => prev + 1);
          }
        } else if (ev.type === 'done') {
          setCleanupDone(true);
          setCleanupLogs((prev) => [
            ...prev,
            t('auth_files.codex_cleanup_log_done', { total: ev.total, deleted: ev.deleted }),
          ]);
        }
      }, abort.signal);
      await loadFiles();
    } catch {
      if (!abort.signal.aborted) {
        showNotification(t('auth_files.codex_cleanup_failed'), 'error');
      }
    } finally {
      setCodexCleaning(false);
      cleanupAbortRef.current = null;
    }
  }, [loadFiles, showNotification, t]);

  const handleCleanupModalClose = useCallback(() => {
    if (codexCleaning && cleanupAbortRef.current) {
      cleanupAbortRef.current.abort();
    }
    setCleanupModalOpen(false);
  }, [codexCleaning]);

  useEffect(() => {
    cleanupLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cleanupLogs]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;
    loadFiles();
    loadKeyStats();
    loadExcluded();
    loadModelAlias();
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(loadKeyStats, isCurrentLayer ? 240_000 : null);

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: files.length };
    files.forEach((file) => {
      if (!file.type) return;
      counts[file.type] = (counts[file.type] || 0) + 1;
    });
    return counts;
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.type || '').toString().toLowerCase().includes(term) ||
        (item.provider || '').toString().toLowerCase().includes(term);
      return matchType && matchSearch;
    });
  }, [files, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);

  const showDetails = (file: AuthFileItem) => {
    setSelectedFile(file);
    setDetailModalOpen(true);
  };

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true }
      });
    },
    [filter, navigate]
  );

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true }
      });
    },
    [filter, navigate]
  );

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    const updatePadding = () => {
      const height = actionsEl.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    };

    updatePadding();
    window.addEventListener('resize', updatePadding);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePadding);
    ro?.observe(actionsEl);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePadding);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    gsap.killTweensOf(actionsEl);

    if (currentCount > 0 && previousCount === 0) {
      gsap.fromTo(
        actionsEl,
        { y: 56, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.28, ease: 'power3.out' }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      gsap.to(actionsEl, {
        y: 56,
        autoAlpha: 0,
        duration: 0.22,
        ease: 'power2.in',
        onComplete: () => {
          if (selectionCountRef.current === 0) {
            setBatchActionBarVisible(false);
          }
        }
      });
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  const renderFilterTags = () => (
    <div className={styles.filterTags}>
      {existingTypes.map((type) => {
        const isActive = filter === type;
        const color =
          type === 'all'
            ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
            : getTypeColor(type, resolvedTheme);
        const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#fff';
        return (
          <button
            key={type}
            className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
            style={{
              backgroundColor: isActive ? color.text : color.bg,
              color: isActive ? activeTextColor : color.text,
              borderColor: color.text
            }}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
          >
            <span className={styles.filterTagLabel}>{getTypeLabel(t, type)}</span>
            <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            {files.some((f) => f.type === 'codex' && !f.disabled) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCodexCleanup}
                disabled={disableControls || codexCleaning}
                loading={codexCleaning}
              >
                {t('auth_files.codex_cleanup_button')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDeleteAll({ filter, onResetFilterToAll: () => setFilter('all') })}
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {filter === 'all'
                ? t('auth_files.delete_all_button')
                : `${t('common.delete')} ${getTypeLabel(t, filter)}`}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterControls}>
            <div className={styles.filterItem}>
              <label>{t('auth_files.search_label')}</label>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('auth_files.search_placeholder')}
              />
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.page_size_label')}</label>
              <input
                className={styles.pageSizeSelect}
                type="number"
                min={MIN_CARD_PAGE_SIZE}
                max={MAX_CARD_PAGE_SIZE}
                step={1}
                value={pageSizeInput}
                onChange={handlePageSizeChange}
                onBlur={(e) => commitPageSizeInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <EmptyState title={t('auth_files.search_empty_title')} description={t('auth_files.search_empty_desc')} />
        ) : (
          <div className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''}`}>
            {pageItems.map((file) => (
              <AuthFileCard
                key={file.name}
                file={file}
                selected={selectedFiles.has(file.name)}
                resolvedTheme={resolvedTheme}
                disableControls={disableControls}
                deleting={deleting}
                statusUpdating={statusUpdating}
                quotaFilterType={quotaFilterType}
                keyStats={keyStats}
                statusBarCache={statusBarCache}
                onShowModels={showModels}
                onShowDetails={showDetails}
                onDownload={handleDownload}
                onOpenPrefixProxyEditor={openPrefixProxyEditor}
                onDelete={handleDelete}
                onToggleStatus={handleStatusToggle}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: filtered.length
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
        onEditProvider={openModelAliasEditor}
        onDeleteProvider={deleteModelAlias}
        modelAliasError={modelAliasError}
        modelAlias={modelAlias}
        allProviderModels={allProviderModels}
        onUpdate={handleMappingUpdate}
        onDeleteLink={handleDeleteLink}
        onToggleFork={handleToggleFork}
        onRenameAlias={handleRenameAlias}
        onDeleteAlias={handleDeleteAlias}
      />

      <AuthFileDetailModal
        open={detailModalOpen}
        file={selectedFile}
        onClose={() => setDetailModalOpen(false)}
        onCopyText={copyTextWithNotification}
      />

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

      <AuthFilesPrefixProxyEditorModal
        disableControls={disableControls}
        editor={prefixProxyEditor}
        updatedText={prefixProxyUpdatedText}
        dirty={prefixProxyDirty}
        onClose={closePrefixProxyEditor}
        onSave={handlePrefixProxySave}
        onChange={handlePrefixProxyChange}
      />

      <Modal
        open={cleanupModalOpen}
        title={t('auth_files.codex_cleanup_button')}
        onClose={handleCleanupModalClose}
        width={560}
        footer={
          <Button
            variant={cleanupDone ? 'primary' : 'danger'}
            size="sm"
            onClick={handleCleanupModalClose}
          >
            {cleanupDone ? t('common.close') : t('common.cancel')}
          </Button>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
            <span>
              {cleanupDone
                ? t('auth_files.codex_cleanup_log_done', { total: cleanupTotal, deleted: cleanupDeleted })
                : t('auth_files.codex_cleanup_progress', { current: cleanupCurrent, total: cleanupTotal })}
            </span>
            <span>{cleanupTotal > 0 ? `${Math.round((cleanupCurrent / cleanupTotal) * 100)}%` : '0%'}</span>
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--border-color)', overflow: 'hidden' }}>
            <div
              style={{
                width: cleanupTotal > 0 ? `${(cleanupCurrent / cleanupTotal) * 100}%` : '0%',
                height: '100%',
                borderRadius: 3,
                background: cleanupDone ? 'var(--success-color)' : 'var(--primary-color)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
        <div
          style={{
            maxHeight: 260,
            overflowY: 'auto',
            fontSize: 12,
            fontFamily: 'monospace',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            padding: '8px 10px',
            lineHeight: 1.7,
          }}
        >
          {cleanupLogs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={cleanupLogsEndRef} />
        </div>
      </Modal>

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_all')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
