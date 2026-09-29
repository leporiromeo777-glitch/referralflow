import 'server-only';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { parseICal, type ICalEvent } from './ical';
import {
  hrefEvento, leggiCalendari, leggiDatiCalendario, XML_CALENDARI, xmlIntervallo, type CalendarioDav,
} from './caldav-regole';

// Il CalDAV di MediOnline visto dal server (23.9.2026). Senza DB: parla col
// server della Cassa e basta. Le credenziali stanno in un file del Mac
// (~/.referralflow-caldav.conf, chmod 600, scritto a mano), mai nel repo né
// nel database, e non finiscono mai in un log. Il file:
//
//   CALDAV_UTENTE=...
//   CALDAV_PASSWORD=...
//   CALDAV_BASE=https://www.medionline.ch/caldav/calendars/   (facoltativo)
//   CALDAV_SCRITTURA=attiva        (facoltativo; senza, la scrittura è SPENTA)
//   CALDAV_SOLO_CALENDARI=Agenda di prova   (facoltativo: nomi, virgola)
//
// La scrittura in MediOnline si accende SOLO scrivendo a mano
// CALDAV_SCRITTURA=attiva, e solo quando lo studio ha un utente MediOnline
// dedicato e un'agenda di prova (Decisioni/Registro, 23.9 e 29.9.2026).
// CALDAV_SOLO_CALENDARI la limita ai calendari nominati (all'inizio, quello
// di prova). Lettura, controllo del robot e recupero del passato no: sono
// sola lettura e vanno sempre.
//
// Si parla SOLO con l'origine di CALDAV_BASE: un href che punta altrove si
// rifiuta, così una risposta strana del server non ci manda le credenziali
// da un'altra parte.

export type ConfCaldav = { utente: string; password: string; base: URL; scrittura: 'attiva' | 'spenta'; soloCalendari: string[] };
export type EventoDav = ICalEvent & { href: string };

const BASE_PREDEFINITA = 'https://www.medionline.ch/caldav/calendars/';

export function percorsoConf(): string {
  return process.env.CALDAV_CONF || path.join(os.homedir(), '.referralflow-caldav.conf');
}

export async function confCaldav(): Promise<ConfCaldav | null> {
  let testo: string;
  try { testo = await readFile(percorsoConf(), 'utf-8'); } catch { return null; }
  const v = (k: string) => (new RegExp(`^${k}=(.*)$`, 'm').exec(testo)?.[1] ?? '').trim();
  const utente = v('CALDAV_UTENTE'), password = v('CALDAV_PASSWORD');
  if (!utente || !password) return null;
  let base: URL;
  try { base = new URL(v('CALDAV_BASE') || BASE_PREDEFINITA); } catch { return null; }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) return null;
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const scrittura = v('CALDAV_SCRITTURA').toLowerCase() === 'attiva' ? 'attiva' : 'spenta';
  const soloCalendari = v('CALDAV_SOLO_CALENDARI').split(',').map((x) => x.trim()).filter(Boolean);
  return { utente, password, base, scrittura, soloCalendari };
}

function indirizzo(conf: ConfCaldav, hrefOUrl: string): URL {
  const u = new URL(hrefOUrl, conf.base);
  if (u.origin !== conf.base.origin) throw new Error('indirizzo fuori dal server CalDAV');
  return u;
}

export async function dav(conf: ConfCaldav, metodo: string, hrefOUrl: string,
  o: { depth?: string; corpo?: string; tipo?: string; intestazioni?: Record<string, string>; ms?: number } = {}): Promise<{ stato: number; testo: string }> {
  const url = indirizzo(conf, hrefOUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.ms ?? 30_000);
  try {
    const r = await fetch(url, {
      method: metodo,
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from(`${conf.utente}:${conf.password}`).toString('base64')}`,
        ...(o.depth != null ? { Depth: o.depth } : {}),
        ...(o.corpo != null ? { 'Content-Type': o.tipo || 'application/xml; charset=utf-8' } : {}),
        ...(o.intestazioni || {}),
      },
      body: o.corpo,
    });
    return { stato: r.status, testo: await r.text() };
  } catch (e) {
    const nome = (e as Error)?.name;
    throw new Error(nome === 'AbortError' ? 'MediOnline non risponde (timeout)' : 'MediOnline non raggiungibile');
  } finally {
    clearTimeout(timer);
  }
}

export async function elencaCalendari(conf: ConfCaldav): Promise<CalendarioDav[]> {
  const r = await dav(conf, 'PROPFIND', conf.base.pathname, { depth: '1', corpo: XML_CALENDARI });
  if (r.stato === 401) throw new Error('MediOnline rifiuta le credenziali del CalDAV');
  if (r.stato !== 207) throw new Error(`MediOnline risponde ${r.stato} all'elenco dei calendari`);
  return leggiCalendari(r.testo).filter((c) => c.calendario);
}

export async function eventiIntervallo(conf: ConfCaldav, hrefCalendario: string, da: Date, a: Date): Promise<EventoDav[]> {
  const r = await dav(conf, 'REPORT', hrefCalendario, { depth: '1', corpo: xmlIntervallo(da, a), ms: 90_000 });
  if (r.stato !== 207) throw new Error(`MediOnline risponde ${r.stato} alla lettura del calendario`);
  return leggiDatiCalendario(r.testo).flatMap((x) => parseICal(x.ics).map((e) => ({ ...e, href: x.href })));
}

// PUT con «If-None-Match: *»: il server rifiuta se l'indirizzo esiste già,
// quindi scrivere non può mai sovrascrivere un appuntamento.
export async function creaEvento(conf: ConfCaldav, hrefCalendario: string, uid: string, ics: string): Promise<number> {
  const r = await dav(conf, 'PUT', hrefEvento(hrefCalendario, uid), {
    corpo: ics, tipo: 'text/calendar; charset=utf-8', intestazioni: { 'If-None-Match': '*' },
  });
  return r.stato;
}

export async function cancellaEvento(conf: ConfCaldav, hrefCalendario: string, uid: string): Promise<number> {
  return (await dav(conf, 'DELETE', hrefEvento(hrefCalendario, uid))).stato;
}
