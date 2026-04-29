import type { Env } from "./env";

export async function cached<T>(
  env: Env,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const fullKey = `cache:${key}`;
  const hit = await env.TOKENS.get<T>(fullKey, "json");
  if (hit !== null) return hit;
  const value = await fn();
  await env.TOKENS.put(fullKey, JSON.stringify(value), {
    expirationTtl: Math.max(60, ttlSeconds),
  });
  return value;
}
