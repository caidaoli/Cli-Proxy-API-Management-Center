import type { AuthFileItem } from '@/types';

export type AuthFileSelection = Map<string, { disabled: boolean }>;

export const toggleAuthFileSelection = (
  selection: AuthFileSelection,
  file: AuthFileItem
): AuthFileSelection => {
  const next = new Map(selection);
  if (next.has(file.name)) {
    next.delete(file.name);
  } else {
    next.set(file.name, { disabled: file.disabled === true });
  }
  return next;
};

export const selectAuthFiles = (
  selection: AuthFileSelection,
  files: AuthFileItem[]
): AuthFileSelection => {
  const next = new Map(selection);
  files.forEach((file) => {
    next.set(file.name, { disabled: file.disabled === true });
  });
  return next;
};

export const removeSelectedAuthFiles = (
  selection: AuthFileSelection,
  names: Iterable<string>
): AuthFileSelection => {
  const next = new Map(selection);
  for (const name of names) {
    next.delete(name);
  }
  return next;
};
