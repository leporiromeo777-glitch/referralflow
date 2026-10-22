// Il microfono di ogni medico (20.10.2026, [[Piattaforma/Dittafono]]): che cosa si accetta di salvare. PURO.
//
// Il tasto è quello che la pagina ha IMPARATO (12-dittafono.js): un tasto della tastiera ({ tipo: 'tasto', code }) o un
// bit di un messaggio del microfono da dettatura letto con WebHID ({ tipo: 'hid', vid, pid, rid, i, maschera, premuto,
// tipo0? }). Il microfono si ricorda per NOME (l'etichetta che dà il browser, «SpeechMike III…»): l'identificativo cambia
// da un computer all'altro, il nome no. Tutto il resto si scarta: qui non entra niente che non sia un tasto o un nome.

export type Tasto =
  | { tipo: 'tasto'; code: string; nome: string }
  | { tipo: 'hid'; vid: number; pid: number; rid: number; i: number; maschera: number; premuto: number; tipo0?: number; nome: string };
// `comandi` (22.10.2026): i tasti dei comandi — quale tasto imparato inserisce quale parte della lettera
// («lettera» = la lettera intera; «fino_allergie» = dall'inizio fino alle allergie e intolleranze comprese, o fino alle
// comorbidità se non ci sono; le altre sono le parti dei comandi a voce).
export const COMANDI_TASTO = ['lettera', 'fino_allergie', 'anamnesi', 'frcv', 'comorbidita', 'allergie', 'diagnosi', 'esame', 'ecg', 'eco', 'sforzo', 'holter', 'laboratorio', 'conclusione', 'terapia'] as const;
export type ComandoTasto = (typeof COMANDI_TASTO)[number];
export type Dispositivi = { tasto: Tasto | null; microfono: string | null; dettatura: boolean | null; comandi: Partial<Record<ComandoTasto, Tasto>> | null };

const intero = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const testo = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Il profilo di chi detta: lo stesso id dei medici della catena (minuscole, cifre, - e _).
export function medicoValido(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,60}$/.test(s) ? s : null;
}

// undefined = non valido (si risponde 400); null = nessun tasto (scollegato).
export function tastoValido(v: unknown): Tasto | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const t = v as Record<string, unknown>;
  if (t.tipo === 'tasto') {
    const code = String(t.code ?? '');
    return /^[A-Za-z0-9]{1,40}$/.test(code) ? { tipo: 'tasto', code, nome: testo(t.nome, 80) || `tasto ${code}` } : undefined;
  }
  if (t.tipo === 'hid') {
    const vid = intero(t.vid, 0xffff), pid = intero(t.pid, 0xffff), rid = intero(t.rid, 255), i = intero(t.i, 63), maschera = intero(t.maschera, 255), premuto = intero(t.premuto, 255);
    if (vid === null || pid === null || rid === null || i === null || !maschera || premuto === null || (premuto & ~maschera)) return undefined;
    if (t.tipo0 !== undefined && intero(t.tipo0, 255) === null) return undefined;
    return { tipo: 'hid', vid, pid, rid, i, maschera, premuto, ...(t.tipo0 !== undefined ? { tipo0: t.tipo0 as number } : {}), nome: testo(t.nome, 80) || 'microfono da dettatura' };
  }
  return undefined;
}

// I tasti dei comandi: solo parti previste, ognuna con un tasto valido; due comandi sullo stesso tasto no.
// undefined = non valido; null = nessuno.
export function comandiValidi(v: unknown): Partial<Record<ComandoTasto, Tasto>> | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Partial<Record<ComandoTasto, Tasto>> = {}, visti = new Set<string>();
  for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
    if (!(COMANDI_TASTO as readonly string[]).includes(k)) return undefined;
    const tv = tastoValido(t);
    if (!tv) return undefined;
    const chiave = stessoTasto(tv);
    if (visti.has(chiave)) return undefined;
    visti.add(chiave); out[k as ComandoTasto] = tv;
  }
  return Object.keys(out).length ? out : null;
}
// Che tasto è, al di là del nome: per riconoscere lo stesso tasto usato due volte.
export function stessoTasto(t: Tasto): string {
  return t.tipo === 'tasto' ? `k:${t.code}` : `h:${t.vid}:${t.pid}:${t.rid}:${t.tipo0 ?? '-'}:${t.i}:${t.maschera}`;
}

// Solo i campi mandati cambiano. → i campi da scrivere, o un errore.
export function cambi(b: Record<string, unknown>): { ok: Partial<Dispositivi> } | { errore: string } {
  const out: Partial<Dispositivi> = {};
  if ('tasto' in b) { const t = tastoValido(b.tasto); if (t === undefined) return { errore: 'tasto non valido' }; out.tasto = t; }
  if ('microfono' in b) out.microfono = b.microfono === null ? null : testo(b.microfono, 120) || null;
  if ('dettatura' in b) { if (typeof b.dettatura !== 'boolean') return { errore: 'dettatura non valida' }; out.dettatura = b.dettatura; }
  if ('comandi' in b) { const c = comandiValidi(b.comandi); if (c === undefined) return { errore: 'comandi non validi' }; out.comandi = c; }
  return Object.keys(out).length ? { ok: out } : { errore: 'niente da salvare' };
}
