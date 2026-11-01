// Letter-pair (Dice) similarity, tolerant of spelling variants such as
// "Toor Dal" / "toor daal" / "Tur dal". 1 = identical, 0 = nothing shared.
function pairs(s: string) {
  const clean = s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();
  const out: string[] = [];
  for (const word of clean.split(" ")) {
    for (let i = 0; i < word.length - 1; i++) out.push(word.slice(i, i + 2));
    if (word.length === 1) out.push(word);
  }
  return out;
}

export function similarity(a: string, b: string) {
  const pa = pairs(a);
  const pb = pairs(b);
  if (!pa.length || !pb.length) return 0;
  const counts = new Map<string, number>();
  for (const p of pa) counts.set(p, (counts.get(p) ?? 0) + 1);
  let hits = 0;
  for (const p of pb) {
    const n = counts.get(p) ?? 0;
    if (n > 0) {
      hits++;
      counts.set(p, n - 1);
    }
  }
  return (2 * hits) / (pa.length + pb.length);
}

export function closest<T>(name: string, list: T[], key: (t: T) => string[], threshold = 0.6) {
  let best: { item: T; score: number } | null = null;
  for (const item of list) {
    for (const k of key(item)) {
      if (!k) continue;
      const score = similarity(name, k);
      if (score >= threshold && (!best || score > best.score)) best = { item, score };
    }
  }
  return best;
}
