import { BACKUP_FILE_PREFIX, BACKUP_FILE_EXT, BACKUP_ENCRYPTION_SALT } from './constants';

/**
 * 生成备份文件名，如 cpamc-backup-2026-03-01-00_46_07.json
 */
export function generateBackupFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}_${p(d.getMinutes())}_${p(d.getSeconds())}`;
  return `${BACKUP_FILE_PREFIX}${stamp}${BACKUP_FILE_EXT}`;
}

/**
 * 判断是否为合法的备份文件名
 */
export function isBackupFile(name: string): boolean {
  return name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith(BACKUP_FILE_EXT);
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- 跨设备加密（固定 salt，不绑定设备） ----

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function xorBytes(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const PORTABLE_KEY_BYTES = encodeText(BACKUP_ENCRYPTION_SALT);

export function encryptForBackup(value: string): string {
  if (!value) return value;
  try {
    const encrypted = xorBytes(encodeText(value), PORTABLE_KEY_BYTES);
    return `bkp::${toBase64(encrypted)}`;
  } catch (err) {
    console.error('[WebDAV Backup] Encryption failed, data will NOT be stored:', err);
    throw err;
  }
}

export function decryptFromBackup(payload: string): string {
  if (!payload || !payload.startsWith('bkp::')) return payload;
  try {
    const encrypted = fromBase64(payload.slice(5));
    return decodeText(xorBytes(encrypted, PORTABLE_KEY_BYTES));
  } catch (err) {
    console.error('[WebDAV Backup] Decryption failed:', err);
    throw err;
  }
}

/**
 * 规范化 WebDAV 路径，确保以 / 开头和结尾
 */
export function normalizeDavPath(path: string): string {
  let p = path.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p = p + '/';
  return p;
}

/**
 * 规范化 WebDAV 服务器 URL，去除末尾斜杠
 */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
