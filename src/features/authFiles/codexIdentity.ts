export type CodexIdentityErrorCode =
  | 'invalid_input'
  | 'invalid_token'
  | 'expired_token'
  | 'missing_email'
  | 'duplicate_account';

export class CodexIdentityError extends Error {
  constructor(
    public readonly code: CodexIdentityErrorCode,
    public readonly account?: string
  ) {
    super(code);
    this.name = 'CodexIdentityError';
  }
}

export type CodexIdentityAccount = {
  accessToken: string;
  accountId: string;
  userId: string;
  email: string;
  planType: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const decodeBase64UrlJson = (value: string): Record<string, unknown> => {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(parsed)) throw new Error('JWT payload is not an object');
    return parsed;
  } catch {
    throw new CodexIdentityError('invalid_token');
  }
};

export const normalizeCodexAccessToken = (value: string): string => {
  let token = value.trim().replace(/^['"]|['"]$/g, '');
  if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, '').trim();
  if (token.split('.').length !== 3) throw new CodexIdentityError('invalid_token');
  return token;
};

const extractSessionToken = (value: unknown): string => {
  if (typeof value === 'string') return normalizeCodexAccessToken(value);
  if (!isRecord(value)) throw new CodexIdentityError('invalid_input');

  for (const key of ['accessToken', 'access_token']) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return normalizeCodexAccessToken(value[key]);
    }
  }

  const token = value.token;
  if (typeof token === 'string' && token.trim()) return normalizeCodexAccessToken(token);
  if (isRecord(token)) {
    for (const key of ['accessToken', 'access_token']) {
      if (typeof token[key] === 'string' && token[key].trim()) {
        return normalizeCodexAccessToken(token[key]);
      }
    }
  }

  throw new CodexIdentityError('invalid_input');
};

const parseInputEntries = (input: string): unknown[] => {
  const trimmed = input.trim();
  if (!trimmed) throw new CodexIdentityError('invalid_input');

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (!line.startsWith('{')) return line;
        try {
          return JSON.parse(line) as unknown;
        } catch {
          throw new CodexIdentityError('invalid_input');
        }
      });
  }
};

export const decodeCodexIdentityAccount = (
  accessToken: string,
  nowSeconds = Date.now() / 1000
): CodexIdentityAccount => {
  const token = normalizeCodexAccessToken(accessToken);
  const payload = decodeBase64UrlJson(token.split('.')[1]);
  const expiresAt = payload.exp;
  if (typeof expiresAt === 'number' && expiresAt <= nowSeconds) {
    throw new CodexIdentityError('expired_token');
  }

  const authInfo = isRecord(payload['https://api.openai.com/auth'])
    ? payload['https://api.openai.com/auth']
    : {};
  const profile = isRecord(payload['https://api.openai.com/profile'])
    ? payload['https://api.openai.com/profile']
    : {};
  const email = String(profile.email ?? '')
    .trim()
    .toLowerCase();
  if (!email) throw new CodexIdentityError('missing_email');

  return {
    accessToken: token,
    accountId: String(authInfo.chatgpt_account_id ?? ''),
    userId: String(authInfo.chatgpt_user_id ?? ''),
    email,
    planType: String(authInfo.chatgpt_plan_type ?? 'free') || 'free',
  };
};

export const parseCodexIdentityAccounts = (
  input: string,
  nowSeconds = Date.now() / 1000
): CodexIdentityAccount[] => {
  const accounts = parseInputEntries(input).map((entry) =>
    decodeCodexIdentityAccount(extractSessionToken(entry), nowSeconds)
  );
  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.email)) {
      throw new CodexIdentityError('duplicate_account', account.email);
    }
    seen.add(account.email);
  }
  return accounts;
};

export const countCodexIdentityAccounts = (input: string): number => {
  try {
    return parseCodexIdentityAccounts(input).length;
  } catch {
    return 0;
  }
};
