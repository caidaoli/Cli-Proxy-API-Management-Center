/**
 * 版本相关 API
 */

import { apiClient } from './client';

export const versionApi = {
  checkLatest: () => apiClient.get<Record<string, unknown>>('/latest-version'),
  checkLatestPanel: () => apiClient.get<Record<string, unknown>>('/panel/latest-version'),
  updatePanel: () => apiClient.post<Record<string, unknown>>('/panel/update')
};
