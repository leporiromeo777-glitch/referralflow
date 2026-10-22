import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cartellaDiPaziente, formatoLettera, type Formato } from './regole';

// Dove sono le cartelle dei pazienti sotto la radice (22.10.2026): sotto ogni cartella di medico («Rapporti_Moccetti»,
// «Esami_II livello»…), a qualunque livello fino al sesto. Solo lettura del disco; nessun nome esce di qui nei log.

export type SulDisco = { rel: string; nome: string; formato: Formato; dimensione: number; modificato: Date };
export type Trovata = { rel: string; nome: string; medico: string };

const dirs = (voci: import('node:fs').Dirent[]) => voci.filter((x) => x.isDirectory() && !x.name.startsWith('.') && !x.name.startsWith('~')).map((x) => x.name).sort();

// Quali cartelle di medico si leggono (22.10.2026, dallo studio: «fai il tutto solo dei rapporti di Marco Moccetti»):
// COMUNE_MEDICI, nomi separati da virgola; vuoto = tutte.
export const mediciScelti = (): string[] => (process.env.COMUNE_MEDICI ?? 'Rapporti_Moccetti').split(',').map((x) => x.trim()).filter(Boolean);

export async function cartellePazienti(base: string, nomi: Set<string>, solo: string[] = []): Promise<{ trovate: Trovata[]; medici: string[]; sciolte: number }> {
  const trovate: Trovata[] = [];
  let sciolte = 0;
  const medici = dirs(await fs.readdir(base, { withFileTypes: true })).filter((m) => !solo.length || solo.includes(m));
  const giro = async (rel: string, medico: string, prof: number) => {
    let voci; try { voci = await fs.readdir(path.join(base, rel), { withFileTypes: true }); } catch { return; }
    const sotto = dirs(voci);
    const nome = path.basename(rel);
    if (prof >= 2 && cartellaDiPaziente(nome, sotto.length > 0, nomi)) { trovate.push({ rel, nome, medico }); return; }
    // Lettere sciolte in un contenitore (cartelle per giorno, per anno): per ora restano fuori, si contano.
    if (prof >= 2) sciolte += voci.filter((v) => v.isFile() && formatoLettera(v.name)).length;
    if (prof < 6) for (const s of sotto) await giro(path.join(rel, s), medico, prof + 1);
  };
  for (const m of medici) await giro(m, m, 1);
  return { trovate, medici, sciolte };
}

export async function lettereSulDisco(base: string, rel: string, prof = 0): Promise<SulDisco[]> {
  const out: SulDisco[] = [];
  let voci; try { voci = await fs.readdir(path.join(base, rel), { withFileTypes: true }); } catch { return out; }
  for (const v of voci) {
    const r = path.join(rel, v.name);
    if (v.isDirectory()) { if (prof < 3 && !v.name.startsWith('.')) out.push(...await lettereSulDisco(base, r, prof + 1)); continue; }
    const formato = v.isFile() ? formatoLettera(v.name) : null;
    if (!formato) continue;
    try { const st = await fs.stat(path.join(base, r)); out.push({ rel: r, nome: v.name, formato, dimensione: st.size, modificato: st.mtime }); } catch { /* sparito */ }
  }
  return out;
}
