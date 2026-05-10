import type { AuthFileItem } from '../../types/authFile.ts';
import type { AuthFilesSortMode } from './uiState.ts';
import { parsePriorityValue } from './priority.ts';

const compareByName = (a: AuthFileItem, b: AuthFileItem): number => a.name.localeCompare(b.name);

const getPriority = (file: AuthFileItem): number =>
  parsePriorityValue(file.priority ?? file['priority']) ?? 0;

const compareByPriorityThenName = (a: AuthFileItem, b: AuthFileItem): number => {
  const priorityCompare = getPriority(b) - getPriority(a);
  return priorityCompare !== 0 ? priorityCompare : compareByName(a, b);
};

export const sortAuthFilesByMode = (
  files: readonly AuthFileItem[],
  sortMode: AuthFilesSortMode
): AuthFileItem[] => {
  const copy = [...files];

  if (sortMode === 'az') {
    return copy.sort(compareByName);
  }

  return copy.sort(compareByPriorityThenName);
};
