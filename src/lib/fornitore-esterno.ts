import 'server-only';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fornitoreAutorizzato, leggiConf } from './fornitori';

// La porta verso il fornitore cloud, una sola per tutta la piattaforma
// (16.9.2026). Prima ce n'era una copia dentro la rotta «Domanda medica»;
// quando è nata la seconda funzione che esce, le copie sarebbero diventate
// due — e due serrature sulla stessa porta divergono sempre.
//
// Indirizzo e chiave sono quelli che la catena dei referti usa già: una chiave
// sola, in un file solo, con i permessi giusti (chmod 600).

const CONF = path.join(os.homedir(), '.referralflow-esterno.conf');

export type Fornitore = { url: string; chiave: string };

// Null vuol dire «non collegato», ed è uno stato normale, non un guasto: la
// funzione lo dice all'utente e si ferma lì, senza che nulla sia uscito.
export function fornitoreEsterno(avvisa: (m: string) => void = () => {}): Fornitore | null {
  try {
    const c = leggiConf(readFileSync(CONF, 'utf-8'));
    if (!c.url || !c.chiave) return null;
    // La guardia: un indirizzo fuori dalla lista autorizzata non si chiama,
    // anche se è scritto nel file di configurazione. Stessa regola della catena.
    if (!fornitoreAutorizzato(c.url)) {
      avvisa('indirizzo NON autorizzato nella configurazione: rifiutato');
      return null;
    }
    return { url: c.url, chiave: c.chiave };
  } catch {
    return null;
  }
}

export type EsitoEsterno =
  | { ok: true; testo: string; ms: number }
  | { ok: false; causa: 'http' | 'rete' | 'vuota'; ms: number; dettaglio: string };

// Una chiamata sola, API compatibile OpenAI. Nei log di chi la usa finiscono
// stato e millisecondi: mai il prompt, mai la risposta.
export async function chiediFornitore(
  f: Fornitore,
  modello: string,
  prompt: string,
  opzioni: { maxToken?: number; timeoutMs?: number } = {}
): Promise<EsitoEsterno> {
  const t0 = Date.now();
  try {
    const r = await fetch(f.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.chiave}` },
      body: JSON.stringify({
        model: modello,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: opzioni.maxToken ?? 1200,
      }),
      signal: AbortSignal.timeout(opzioni.timeoutMs ?? 120_000),
    });
    if (!r.ok) return { ok: false, causa: 'http', ms: Date.now() - t0, dettaglio: `HTTP ${r.status}` };
    const j = await r.json();
    const testo = String(j?.choices?.[0]?.message?.content ?? '').trim();
    if (!testo) return { ok: false, causa: 'vuota', ms: Date.now() - t0, dettaglio: 'risposta senza contenuto' };
    return { ok: true, testo, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, causa: 'rete', ms: Date.now() - t0, dettaglio: String((e as Error)?.name ?? e).slice(0, 40) };
  }
}
