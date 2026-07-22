import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CodexIdentityError,
  parseCodexIdentityAccounts,
} from '../src/features/authFiles/codexIdentity.ts';
import { authFilesApi, type CodexIdentityImportResult } from '../src/services/api/authFiles.ts';
import { apiClient } from '../src/services/api/client.ts';

const encodeBase64Url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url').replace(/=+$/g, '');

const createToken = (email: string, exp = 2_000_000_000): string =>
  [
    encodeBase64Url({ alg: 'none' }),
    encodeBase64Url({
      exp,
      'https://api.openai.com/auth': {
        chatgpt_account_id: `account-${email}`,
        chatgpt_user_id: `user-${email}`,
        chatgpt_plan_type: 'plus',
      },
      'https://api.openai.com/profile': { email },
    }),
    'signature',
  ].join('.');

test('Codex identity input accepts AT, auth-session JSON, and newline-separated accounts', () => {
  const firstToken = createToken('first@example.com');
  const secondToken = createToken('second@example.com');
  const accounts = parseCodexIdentityAccounts(
    `${firstToken}\n${JSON.stringify({ accessToken: secondToken })}`,
    1_900_000_000
  );

  assert.deepEqual(
    accounts.map(({ accessToken: _, ...account }) => account),
    [
      {
        accountId: 'account-first@example.com',
        userId: 'user-first@example.com',
        email: 'first@example.com',
        planType: 'plus',
      },
      {
        accountId: 'account-second@example.com',
        userId: 'user-second@example.com',
        email: 'second@example.com',
        planType: 'plus',
      },
    ]
  );
});

test('Codex identity input rejects expired and duplicate accounts before registration', () => {
  const expiredToken = createToken('expired@example.com', 100);
  assert.throws(
    () => parseCodexIdentityAccounts(expiredToken, 101),
    (error: unknown) => error instanceof CodexIdentityError && error.code === 'expired_token'
  );

  const duplicateToken = createToken('duplicate@example.com');
  assert.throws(
    () =>
      parseCodexIdentityAccounts(
        `${duplicateToken}\n${JSON.stringify({ accessToken: duplicateToken })}`,
        1_900_000_000
      ),
    (error: unknown) => error instanceof CodexIdentityError && error.code === 'duplicate_account'
  );
});

test('Codex identity import uses the dedicated management endpoint without changing tokens', async () => {
  const originalPost = apiClient.post;
  let capturedUrl = '';
  let capturedData: unknown;
  const expected: CodexIdentityImportResult = {
    status: 'partial',
    imported: 1,
    files: ['codex-first@example.com.json'],
    failed: [{ email: 'second@example.com', error: 'agent registration failed' }],
  };
  apiClient.post = async <T = unknown>(url: string, data?: unknown): Promise<T> => {
    capturedUrl = url;
    capturedData = data;
    return expected as T;
  };

  try {
    const result = await authFilesApi.importCodexIdentity(['token-a', 'token-b']);
    assert.equal(capturedUrl, '/custom/codex-agent-identity/import');
    assert.deepEqual(capturedData, { access_tokens: ['token-a', 'token-b'] });
    assert.deepEqual(result, expected);
  } finally {
    apiClient.post = originalPost;
  }
});
