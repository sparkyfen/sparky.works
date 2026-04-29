function toB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export function icsPayload(p: {
  n: string;
  s: string;
  id: string;
  loc: string;
  u: string;
}): string {
  // Canonical, order-stable representation. Length-prefix each field so e.g.
  // ("a", "bc") and ("ab", "c") can't collide.
  return [p.n, p.s, p.id, p.loc, p.u].map((v) => `${v.length}:${v}`).join("|");
}

export async function sign(secret: string, payload: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toB64url(sig);
}

export async function verify(secret: string, payload: string, sigB64: string): Promise<boolean> {
  try {
    const key = await importKey(secret);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromB64url(sigB64),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}
