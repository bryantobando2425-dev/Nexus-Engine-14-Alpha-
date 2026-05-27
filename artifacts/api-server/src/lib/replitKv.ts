const KV_URL = process.env.REPLIT_DB_URL;

export async function kvSet(key: string, value: string): Promise<void> {
  if (!KV_URL) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(KV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      });
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

export async function kvGet(key: string): Promise<string | null> {
  if (!KV_URL) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${KV_URL}/${encodeURIComponent(key)}`);
      if (res.status === 404) return null;
      if (res.ok) return res.text();
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

export async function kvDelete(key: string): Promise<void> {
  if (!KV_URL) return;
  try {
    await fetch(`${KV_URL}/${encodeURIComponent(key)}`, { method: 'DELETE' });
  } catch {}
}
