import type { AuthFileItem } from '../../types/authFile.ts';
import { sortAuthFilesByMode } from '../../features/authFiles/sorting.ts';

export const sortQuotaFiles = (files: readonly AuthFileItem[]): AuthFileItem[] =>
  sortAuthFilesByMode(files, 'default');
