import bcrypt from 'bcryptjs';

const { OS_SYSTEM_SERVER, OS_APP_KEY, OS_APP_SECRET } = process.env;

interface AccessTokenResponse {
  code: number;
  data: { access_token: string };
  message?: string;
}

// 缓存 access token（有效期 5 分钟，提前 30 秒刷新）
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(
  group: string,
  dataType: string,
  version: string,
  ops: string[]
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!OS_SYSTEM_SERVER || !OS_APP_KEY || !OS_APP_SECRET) {
    throw new Error('Missing OS_SYSTEM_SERVER / OS_APP_KEY / OS_APP_SECRET env vars');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${OS_APP_KEY}${timestamp}${OS_APP_SECRET}`;
  const hash = await bcrypt.hash(input, 10);

  const res = await fetch(`http://${OS_SYSTEM_SERVER}/permission/v1alpha1/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_key: OS_APP_KEY,
      timestamp,
      token: hash,
      perm: { group, dataType, version, ops },
    }),
  });

  const data: AccessTokenResponse = await res.json() as AccessTokenResponse;
  if (data.code !== 0) {
    throw new Error(`system-server auth failed: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    token: data.data.access_token,
    expiresAt: Date.now() + 4.5 * 60 * 1000,
  };

  return cachedToken.token;
}

export async function callSystemServer(
  dataType: string,
  group: string,
  version: string,
  op: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const token = await getAccessToken(group, dataType, version, [op]);

  const res = await fetch(
    `http://${OS_SYSTEM_SERVER}/system-server/v1alpha1/${dataType}/${group}/${version}/${op}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': token,
      },
      body: JSON.stringify(body),
    }
  );

  return res.json();
}
