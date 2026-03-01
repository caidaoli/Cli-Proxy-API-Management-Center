import type { WebdavFileInfo } from '../types';

/**
 * 从 href 中提取文件名（最后一段非空路径）
 */
function filenameFromHref(href: string): string {
  try {
    // href 可能是完整 URL 或路径，取最后一段
    const path = href.includes('://') ? new URL(href).pathname : href;
    const segments = path.split('/').filter(Boolean);
    const last = segments.pop() ?? '';
    return decodeURIComponent(last);
  } catch {
    return decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '');
  }
}

/**
 * 解析 PROPFIND XML 响应，提取文件/目录信息
 */
export function parsePropfindResponse(xmlText: string): WebdavFileInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // DOMParser 解析失败不会抛异常，而是返回包含 parsererror 的文档
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent?.slice(0, 200)}`);
  }

  const results: WebdavFileInfo[] = [];

  const responses = doc.getElementsByTagNameNS('DAV:', 'response');

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];

    const hrefEl = response.getElementsByTagNameNS('DAV:', 'href')[0];
    const href = hrefEl?.textContent?.trim() ?? '';

    const displayNameEl = response.getElementsByTagNameNS('DAV:', 'displayname')[0];
    const displayName = displayNameEl?.textContent?.trim() || filenameFromHref(href);

    const contentLengthEl = response.getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
    const contentLength = parseInt(contentLengthEl?.textContent ?? '0', 10) || 0;

    const lastModifiedEl = response.getElementsByTagNameNS('DAV:', 'getlastmodified')[0];
    const lastModified = lastModifiedEl?.textContent?.trim() ?? '';

    const resourceTypeEl = response.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
    const isCollection = resourceTypeEl
      ? resourceTypeEl.getElementsByTagNameNS('DAV:', 'collection').length > 0
      : href.endsWith('/');

    results.push({ href, displayName, contentLength, lastModified, isCollection });
  }

  return results;
}
