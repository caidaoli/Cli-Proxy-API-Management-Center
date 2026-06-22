import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const oauthPageSource = readFileSync(
  new URL('../src/pages/OAuthPage.tsx', import.meta.url),
  'utf8'
);

test('OAuth 页面不再暴露 Gemini CLI 登录和项目 ID 输入', () => {
  assert.doesNotMatch(oauthPageSource, /gemini-cli/);
  assert.doesNotMatch(oauthPageSource, /gemini_cli_project_id/);
  assert.doesNotMatch(oauthPageSource, /projectIdError/);
});

test('OAuth 成功态提供重新登录和查看认证文件入口', () => {
  assert.match(oauthPageSource, /useNavigate\(/);
  assert.match(oauthPageSource, /state\.status === 'success'\s*\?\s*t\('auth_login\.login_another_account'\)/);
  assert.match(oauthPageSource, /state\.status === 'success' && \(/);
  assert.match(oauthPageSource, /navigate\('\/auth-files'\)/);
  assert.match(oauthPageSource, /t\('auth_login\.view_auth_files'\)/);
});
