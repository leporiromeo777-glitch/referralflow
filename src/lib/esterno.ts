import 'server-only';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Chiamata al modello ESTERNO dall'applicazione (9.9.2026): stessa
// configurazione della catena (~/.referralflow-esterno.conf: attivo, url,
// chiave, modello, max_gettoni) e stessa regola: solo fornitori autorizzati
// (env REFERTI_FORNITORI, default Infomaniak, Svizzera). Il testo che passa
// di qui è già pseudonimizzato da chi chiama. Mai contenuti nei log.

export type ConfEsterno = { attivo: boolean; url: string; chiave: string; modello: string; maxGettoni: number };

const FORNITORI = (process.env.REFERTI_FORNITORI ?? 'https://api.infomaniak.com/').split(',').map((s) => s.trim()).filter(Boolean);

export function confEsterno(): ConfEsterno | null {
  try {
    const p = process.env.REFERTI_ESTERNO_CONF || path.join(os.homedir(), '.referralflow-esterno.conf');
    const righe = fs.readFileSync(p, 'utf8').split('\n');
    const kv: Record<string, string> = {};
    for (const r of righe) { const i = r.indexOf('='); if (i > 0) kv[r.slice(0, i).trim()] = r.slice(i + 1).trim(); }
    const url = kv.url ?? '';
    if (kv.attivo !== '1' || !url || !kv.chiave || !kv.modello) return null;
    if (!FORNITORI.some((f) => url.startsWith(f))) return null;
    return { attivo: true, url, chiave: kv.chiave, modello: kv.modello, maxGettoni: Number(kv.max_gettoni) || 4000 };
  } catch { return null; }
}

export async function chiamaEsterno(prompt: string, opz: { json?: boolean; timeoutMs?: number } = {}): Promise<string | null> {
  const c = confEsterno();
  if (!c) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opz.timeoutMs ?? 90_000);
  try {
    const r = await fetch(c.url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.chiave}` },
      body: JSON.stringify({
        model: c.modello, temperature: 0, max_tokens: c.maxGettoni,
        messages: [{ role: 'user', content: prompt }],
        ...(opz.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const testo = d?.choices?.[0]?.message?.content;
    return typeof testo === 'string' ? testo : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function estraiJson(testo: string | null): any {
  if (!testo) return null;
  const i = testo.indexOf('{'), j = testo.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(testo.slice(i, j + 1)); } catch { return null; }
}
