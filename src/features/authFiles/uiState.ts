export const AUTH_FILES_SORT_MODES = ['default', 'az', 'priority'] as const;

export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];

export const MIN_AUTH_FILES_PAGE_SIZE = 3;

export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  disabledOnly?: boolean;
  enabledOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  sortMode?: AuthFilesSortMode;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';
const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);

export const normalizeAuthFilesPageSize = (value: unknown): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 12;
  return Math.max(MIN_AUTH_FILES_PAGE_SIZE, Math.round(parsed));
};

const normalizeAuthFilesUiState = (state: AuthFilesUiState): AuthFilesUiState => {
  const rawPageSize = (state as { pageSize?: unknown }).pageSize;
  if (typeof rawPageSize !== 'number' && typeof rawPageSize !== 'string') return state;
  return { ...state, pageSize: normalizeAuthFilesPageSize(rawPageSize) };
};

const readAuthFilesUiStateFromStorage = (
  storage: Pick<Storage, 'getItem'> | null | undefined
): AuthFilesUiState | null => {
  if (!storage) return null;
  const raw = storage.getItem(AUTH_FILES_UI_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as AuthFilesUiState;
  return parsed && typeof parsed === 'object' ? normalizeAuthFilesUiState(parsed) : null;
};

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    return (
      readAuthFilesUiStateFromStorage(window.localStorage) ??
      readAuthFilesUiStateFromStorage(window.sessionStorage)
    );
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify(normalizeAuthFilesUiState(state))
    );
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(AUTH_FILES_UI_STATE_KEY);
  } catch {
    // ignore
  }
};
