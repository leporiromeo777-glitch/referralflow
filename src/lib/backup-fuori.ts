import 'server-only';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// La copia di sicurezza FUORI dal Mac (13.10.2026, [[Piattaforma/Server Mac mini]]). Il backup notturno
// (mac/backup-db.sh) prepara pacchi CIFRATI in ~/ReferralFlow-backup/fuori/; qui l'app li porta sul server dello
// studio — è l'app che ha il permesso di scrivere sui volumi di rete, uno script lanciato da launchd no.
// La destinazione sta in ~/.referralflow-backup.conf (FUORI_SU="/Volumes/…/ReferralFlow-backup"). Sul server si
// scrive SOLO in quella cartella e si toccano solo i file coi nostri nomi. Nei log: numeri e nomi di file (date).
const CASA = os.homedir();
const PRONTI = path.join(CASA, 'ReferralFlow-backup', 'fuori');
const STATO = path.join(CASA, 'ReferralFlow-backup', '.fuori-stato');
const NOSTRI = /^(referralflow-\d{4}-\d{2}-\d{2}\.sql\.gz|allegati-\d{4}-\d{2}-\d{2}-\d{4}\.tar|configurazione-\d{4}-\d{2}-\d{2}\.tar)\.enc$/;
const GIORNI_DATABASE = 30;      // i database e le configurazioni più vecchi si tolgono; i pacchi degli allegati no (ognuno ha file che gli altri non hanno)

export type EsitoFuori = { stato: 'spento' | 'non_collegato' | 'fatto' | 'errore' | 'in_corso'; portati: number; megabyte: number; sul_server: number };

async function destinazione(): Promise<string | null> {
  try {
    const t = await fs.readFile(path.join(CASA, '.referralflow-backup.conf'), 'utf-8');
    const m = /^\s*FUORI_SU\s*=\s*"?([^"\n]+?)"?\s*$/m.exec(t);
    const d = m?.[1].trim() ?? '';
    return d.startsWith('/Volumes/') && d.split('/').length >= 4 ? d : null;
  } catch { return null; }
}
// Collegato davvero? La cartella sotto /Volumes deve essere un altro disco, non una cartella rimasta vuota sul Mac
// (se no i pacchi finirebbero sul disco del Mac credendo di essere al sicuro).
async function collegato(dest: string): Promise<boolean> {
  try {
    const volume = dest.split('/').slice(0, 3).join('/');
    const [a, b] = await Promise.all([fs.stat(volume), fs.stat('/Volumes')]);
    return a.isDirectory() && a.dev !== b.dev;
  } catch { return false; }
}

let inCorso = false;
// `prova`: cartelle date a mano, per le prove (niente configurazione, niente controllo del volume).
export async function portaFuori(prova?: { pronti: string; dest: string; stato: string }): Promise<EsitoFuori> {
  if (inCorso) return { stato: 'in_corso', portati: 0, megabyte: 0, sul_server: 0 };
  inCorso = true;
  let portati = 0, byte = 0;
  try {
    const dest = prova?.dest ?? await destinazione();
    const PRONTI_QUI = prova?.pronti ?? PRONTI, STATO_QUI = prova?.stato ?? STATO;
    if (!dest) return { stato: 'spento', portati: 0, megabyte: 0, sul_server: 0 };
    if (!prova && !(await collegato(dest))) { console.log('[backup] il server dello studio non è collegato: i pacchi aspettano sul Mac'); return { stato: 'non_collegato', portati: 0, megabyte: 0, sul_server: 0 }; }
    await fs.mkdir(dest, { recursive: true });
    const pronti = (await fs.readdir(PRONTI_QUI).catch(() => [] as string[])).filter((n) => NOSTRI.test(n)).sort();
    for (const nome of pronti) {
      const da = path.join(PRONTI_QUI, nome), a = path.join(dest, nome);
      const qui = await fs.stat(da);
      const la = await fs.stat(a).catch(() => null);
      if (!la || la.size !== qui.size) {
        await fs.copyFile(da, `${a}.parziale`);
        const scritto = await fs.stat(`${a}.parziale`);
        if (scritto.size !== qui.size) { await fs.rm(`${a}.parziale`, { force: true }); throw Object.assign(new Error('dimensione'), { code: 'dimensione' }); }
        await fs.rename(`${a}.parziale`, a);
        portati++; byte += qui.size;
      }
      await fs.rm(da, { force: true });      // arrivato e della stessa dimensione: sul Mac il pacco non serve più
    }
    // Sul server: via i database e le configurazioni vecchi (solo file coi nostri nomi).
    const la = (await fs.readdir(dest)).filter((n) => NOSTRI.test(n));
    const limite = Date.now() - GIORNI_DATABASE * 86_400_000;
    for (const n of la) {
      if (n.startsWith('allegati-')) continue;
      const giorno = /(\d{4}-\d{2}-\d{2})/.exec(n)?.[1];
      if (giorno && new Date(`${giorno}T12:00:00`).getTime() < limite) await fs.rm(path.join(dest, n), { force: true });
    }
    const rimasti = (await fs.readdir(dest)).filter((n) => NOSTRI.test(n));
    const database = rimasti.filter((n) => n.startsWith('referralflow-')).sort();
    await fs.writeFile(STATO_QUI, JSON.stringify({ quando: new Date().toISOString(), sul_server: rimasti.length, ultimo_database: database[database.length - 1] ?? null }), { mode: 0o600 });
    if (portati) console.log(`[backup] portati sul server ${portati} pacchi (${Math.round(byte / 1e6)} MB); là ora ${rimasti.length} pacchi, ${database.length} database`);
    return { stato: 'fatto', portati, megabyte: Math.round(byte / 1e6), sul_server: rimasti.length };
  } catch (e: any) {
    console.error(`[backup] copia sul server non riuscita (${e?.code ?? e?.name ?? 'errore'})`);
    return { stato: 'errore', portati, megabyte: Math.round(byte / 1e6), sul_server: 0 };
  } finally { inCorso = false; }
}
