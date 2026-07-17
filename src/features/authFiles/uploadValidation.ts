import { MAX_AUTH_ARCHIVE_SIZE, MAX_AUTH_FILE_SIZE } from '../../utils/constants.ts';

/** Value for <input type="file" accept> on auth-files upload. */
export const AUTH_UPLOAD_ACCEPT =
  '.json,.zip,.tar,.tar.gz,.tgz,application/json,application/zip,application/x-zip-compressed,application/x-tar,application/gzip,application/x-gzip';

export function isAuthUploadJsonFile(name: string): boolean {
  return name.trim().toLowerCase().endsWith('.json');
}

export function isAuthUploadArchiveFile(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    lower.endsWith('.zip') ||
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz') ||
    lower.endsWith('.tar')
  );
}

export function isAuthUploadAllowedFile(name: string): boolean {
  return isAuthUploadJsonFile(name) || isAuthUploadArchiveFile(name);
}

/** Per-file client-side size cap. Archives use the larger backend bulk limit. */
export function maxAuthUploadFileSize(name: string): number {
  return isAuthUploadArchiveFile(name) ? MAX_AUTH_ARCHIVE_SIZE : MAX_AUTH_FILE_SIZE;
}
