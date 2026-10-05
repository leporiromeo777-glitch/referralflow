// Il service worker della pagina di cortesia (public/sw.js), provato fuori dal
// browser: solo le aperture di pagina, cortesia su rete assente e 502/503/504,
// tutto il resto passa com'è; niente cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function carica(fetchFinto: (r: any) => Promise<any>) {
  const ascoltatori: Record<string, (e: any) => void> = {};
  const ctx: any = {
    self: { addEventListener: (n: string, f: (e: any) => void) => { ascoltatori[n] = f; }, skipWaiting: () => {}, clients: { claim: async () => {} } },
    fetch: fetchFinto, URL,
    Response: class { status: number; corpo: string; headers: any; constructor(corpo: string, o: any) { this.corpo = corpo; this.status = o.status; this.headers = o.headers; } },
  };
  const codice = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  vm.runInNewContext(codice, ctx);
  const apri = async (req: any): Promise<any> => {
    let risposta: Promise<any> | null = null;
    ascoltatori.fetch({ request: req, respondWith: (p: Promise<any>) => { risposta = p; } });
    return risposta ? await risposta : 'non intercettata';
  };
  return { apri, codice };
}
const nav = (url: string) => ({ mode: 'navigate', method: 'GET', url });

test('service worker: cortesia solo quando la pagina non si apre', async () => {
  const su = carica(async () => ({ status: 200, ok: true, vera: true }));
  assert.equal((await su.apri(nav('https://x.test/prototipo/index.html'))).vera, true, 'pagina che risponde: passa com\'è');
  assert.equal(await su.apri({ mode: 'cors', method: 'GET', url: 'https://x.test/api/prototipo/dati' }), 'non intercettata', 'le chiamate dell\'app non si toccano');
  assert.equal(await su.apri({ mode: 'navigate', method: 'POST', url: 'https://x.test/login' }), 'non intercettata', 'i moduli inviati non si toccano');
  for (const stato of [502, 503, 504]) {
    const r = await carica(async () => ({ status: stato })).apri(nav('https://x.test/prototipo/index.html'));
    assert.equal(r.status, 503); assert.match(r.corpo, /ReferralFlow non risponde/);
  }
  assert.equal((await carica(async () => ({ status: 404, pagina404: true })).apri(nav('https://x.test/niente'))).pagina404, true, 'un 404 vero resta un 404');
  const giu = await carica(async () => { throw new TypeError('rete'); }).apri(nav('https://x.test/prototipo/index.html'));
  assert.match(giu.corpo, /si riapre da sola/);
  assert.match((await su.apri(nav('https://x.test/prototipo/index.html?rf-prova-attesa=1'))).corpo, /ReferralFlow non risponde/, 'indirizzo di prova');
  assert.doesNotMatch(su.codice.replace(/\/\/.*$/gm, ''), /caches\.|cache\.put|addAll/, 'niente cache');
});
