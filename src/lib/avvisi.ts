import 'server-only';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// Notifiche sul telefono (ntfy, 29.9.2026), le stesse della sentinella
// (mac/sentinella.sh): canale in ~/.referralflow-avvisi.conf (NTFY_URL=…),
// mai nel repo. Testi SEMPRE neutri: numeri e stati, mai pazienti, nomi di
// file o contenuti clinici. Senza canale non manda niente.
async function canale(): Promise<string | null> {
  if (process.env.NTFY_URL) return process.env.NTFY_URL;
  try {
    const conf = await fs.readFile(path.join(os.homedir(), '.referralflow-avvisi.conf'), 'utf8');
    const m = /^NTFY_URL=(\S+)/m.exec(conf);
    return m ? m[1].replace(/"/g, '') : null;
  } catch {
    return null;
  }
}

export async function inviaAvviso(testo: string, opz: { priorita?: 'min' | 'low' | 'default' | 'high'; tag?: string } = {}): Promise<boolean> {
  const url = await canale();
  if (!url) return false;
  try {
    const r = await fetch(url, {
      method: 'POST', body: testo,
      headers: { Title: 'ReferralFlow', Priority: opz.priorita ?? 'default', Tags: opz.tag ?? 'bar_chart' },
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
