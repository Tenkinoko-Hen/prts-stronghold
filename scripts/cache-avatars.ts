import { mkdir, writeFile, stat } from 'node:fs/promises';
import { PRTS_OPERATOR_AVATARS } from '../src/data/prtsAvatars';

const target = new URL('../public/assets/avatars/', import.meta.url);
await mkdir(target, { recursive: true });
const urls = [...new Set(Object.values(PRTS_OPERATOR_AVATARS))];
const pending = [...urls];
const failed: string[] = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (pending.length) {
    const url = pending.pop()!;
    const file = new URL(url.split('/').at(-1)!, target);
    if (await stat(file).then((s) => s.size > 0).catch(() => false)) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${res.status}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    } catch (error) {
      failed.push(url);
      console.error(decodeURIComponent(url.split('/').at(-1)!), String(error));
    }
  }
}));
console.log(`Avatars: ${urls.length - failed.length}/${urls.length}`);
if (failed.length) process.exitCode = 1;
