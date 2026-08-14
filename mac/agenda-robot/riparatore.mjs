// Riparatore AI del robot agenda. Quando un pezzo della pagina non si trova
// più coi selettori noti (MediOnline aggiornato), si chiede all'AI locale
// (Ollama, la stessa gemma della pipeline referti) di ritrovarlo, dandole lo
// screenshot e la struttura della pagina. La proposta dell'AI viene PROVATA
// dal codice prima di essere adottata: se funziona, si salva in
// ~/.referralflow-agenda-selettori.json e dalla volta dopo si torna
// deterministici, senza AI. Tutto resta sul Mac: lo screenshot dell'agenda
// non lascia mai lo studio.

import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { modalitaSolaLettura, radiografiaPagina } from './comune.mjs';

const PERCORSO_SELETTORI = path.join(os.homedir(), '.referralflow-agenda-selettori.json');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:12b';

export function selettoriSalvati() {
  try {
    return JSON.parse(readFileSync(PERCORSO_SELETTORI, 'utf-8'));
  } catch {
    return {};
  }
}

function salvaSelettore(chiave, selettore) {
  const tutti = selettoriSalvati();
  tutti[chiave] = { selettore, origine: 'ai', aggiornato: new Date().toISOString().slice(0, 16) };
  writeFileSync(PERCORSO_SELETTORI, JSON.stringify(tutti, null, 2) + '\n', 'utf-8');
}

async function generaOllama(prompt, immaginePng) {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        images: immaginePng ? [immaginePng.toString('base64')] : undefined,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) return null;
    return (await r.json()).response ?? null;
  } catch {
    return null;
  }
}

// Trova un elemento della pagina in tre tempi:
//   1. il selettore già «imparato» in una riparazione precedente;
//   2. i selettori di base scritti nel codice;
//   3. l'AI locale, con verifica: la proposta si adotta solo se supera
//      `valida`, e in quel caso si salva per le prossime volte.
// Ritorna il locator, o null (e allora il robot si ferma CON avviso).
export async function trovaElemento(page, chiave, selettoriBase, descrizione, valida) {
  const controlla = valida ?? (async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible()));

  const salvato = selettoriSalvati()[chiave]?.selettore;
  for (const sel of [salvato, ...selettoriBase].filter(Boolean)) {
    try {
      const loc = page.locator(sel).first();
      if (await controlla(page.locator(sel))) return loc;
    } catch {
      /* selettore non valido: si passa al prossimo */
    }
  }

  console.log(`[riparatore] «${chiave}» non trovato coi selettori noti: chiedo all'AI locale…`);
  let struttura;
  try {
    struttura = await radiografiaPagina(page);
  } catch {
    struttura = '(struttura non leggibile)';
  }
  let screenshot = null;
  try {
    screenshot = await page.screenshot();
  } catch {
    /* senza screenshot si prova lo stesso, con la sola struttura */
  }

  const base = [
    'Sei il riparatore di un\'automazione web. Il sito è cambiato e un elemento non si trova più.',
    `ELEMENTO DA TROVARE: ${descrizione}`,
    'Qui sotto c\'è la struttura della pagina (tag#id.classi, con {ui:«etichetta»} per i testi visibili).',
    'Rispondi SOLO con un oggetto JSON: {"selettore": "<selettore CSS>"} .',
    'Il selettore deve essere il più specifico possibile (preferisci gli id).',
    '',
    'STRUTTURA:',
    struttura.slice(0, 20000),
  ].join('\n');

  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const risposta = await generaOllama(
      base + (tentativo > 0 ? '\n\nIl selettore proposto prima NON funzionava: proponine uno diverso.' : ''),
      screenshot
    );
    if (!risposta) return null; // Ollama spento: niente riparazione automatica
    let sel;
    try {
      sel = JSON.parse(risposta).selettore;
    } catch {
      continue;
    }
    if (!sel || typeof sel !== 'string') continue;
    try {
      if (await controlla(page.locator(sel))) {
        salvaSelettore(chiave, sel);
        console.log(`[riparatore] «${chiave}» riparato → ${sel} (salvato: dalla prossima volta niente AI)`);
        return page.locator(sel).first();
      }
      console.log(`[riparatore] proposta scartata (non supera la verifica): ${sel}`);
    } catch {
      console.log(`[riparatore] proposta scartata (selettore non valido): ${sel}`);
    }
  }
  return null;
}

// Login con riparazione: i tre pezzi (campo utente, password, invio) passano
// tutti da trovaElemento, quindi sopravvivono ai ritocchi del sito finché
// l'AI locale riesce a ritrovarli. Ritorna true se il login è riuscito.
export async function loginRiparabile(page, conf) {
  const utente = await trovaElemento(
    page,
    'login_utente',
    ['input[type="text"]:visible', 'input:not([type]):visible', 'input[type="email"]:visible'],
    'il campo di testo dove si scrive il NOME UTENTE nel modulo di accesso'
  );
  const password = await trovaElemento(
    page,
    'login_password',
    ['input[type="password"]:visible'],
    'il campo dove si scrive la PASSWORD nel modulo di accesso'
  );
  if (!utente || !password) return false;
  await utente.fill(conf.MEDIONLINE_UTENTE);
  await password.fill(conf.MEDIONLINE_PASSWORD);

  const invio = await trovaElemento(
    page,
    'login_invio',
    [
      'input[value*="Sign" i]:visible',
      'a:has-text("Sign-on")',
      'button:has-text("Sign")',
      'input[type="submit"]:visible',
      'button[type="submit"]:visible',
      'button:visible',
    ],
    'il bottone che INVIA il modulo di accesso (Sign-on / Anmelden / Login / Accedi)'
  );
  if (!invio) return false;
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {}),
    invio.click(),
  ]);
  await page.waitForTimeout(1500);
  // Login riuscito se il campo password non c'è più.
  return (await page.locator('input[type="password"]:visible').count()) === 0;
}

// L'ingresso vero di MediOnline (percorso descritto dall'utente, 2026-08-14):
// dalla pagina d'ingresso si preme «Collegarsi» in alto, si APRE UN'ALTRA
// FINESTRA, e lì si fa il login col bottone «Sign-on». Questa funzione
// percorre tutta la strada e ritorna la finestra su cui proseguire.
// I due clic sono di navigazione (consentiti dalla regola di sola lettura)
// e auto-riparabili come tutto il resto.
export async function accediMediOnline(context, page, conf) {
  const collegarsi = await trovaElemento(
    page,
    'entrata_collegarsi',
    [
      'a:has-text("Collegarsi")',
      'input[value*="Collegarsi" i]:visible',
      'a:has-text("Anmelden")',
      'input[value*="Anmelden" i]:visible',
      'a:has-text("Login")',
      'button:has-text("Login")',
      'a:has-text("Connexion")',
    ],
    'il bottone o link IN ALTO per collegarsi/accedere (Collegarsi / Anmelden / Login / Connexion)'
  );

  let dove = page;
  if (collegarsi) {
    // Il clic può aprire una nuova finestra: la si aspetta e ci si sposta lì.
    const attesa = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await collegarsi.click();
    const nuova = await attesa;
    if (nuova) {
      dove = nuova;
      await modalitaSolaLettura(dove);
      await dove.waitForLoadState('domcontentloaded').catch(() => {});
      console.log('[accesso] si è aperta una nuova finestra: proseguo lì');
    } else {
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    }
  } else {
    console.log('[accesso] bottone «Collegarsi» non trovato: forse il login è già in pagina');
  }

  await dove.waitForTimeout(1000);
  const ok = await loginRiparabile(dove, conf);
  return { pagina: dove, ok };
}
