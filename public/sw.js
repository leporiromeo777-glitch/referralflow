// ReferralFlow — pagina di cortesia mentre il server si aggiorna (5.10.2026).
// Quando la piattaforma si ricompila (1–2 minuti a ogni aggiornamento) il
// sito risponde 502 con una pagina vuota: chi apriva l'app in quel momento
// vedeva una schermata bianca. Questo service worker fa UNA cosa sola: se
// l'apertura di una pagina fallisce (rete assente, 502/503/504) mostra una
// pagina che lo dice e riprova da sola. NON mette niente in cache: nessun
// file vecchio può restare in giro per colpa sua.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const ATTESA = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ReferralFlow</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#F6F6F3;color:#22302b;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:420px;padding:24px;text-align:center}h1{font-size:19px;margin:0 0 8px;color:#0d5c48}p{margin:0 0 6px;color:#4a5a54}
.p{width:28px;height:28px;margin:0 auto 16px;border:3px solid #cfdad5;border-top-color:#0d5c48;border-radius:50%;animation:g 1s linear infinite}
@keyframes g{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.p{animation:none}}</style></head>
<body><main><div class="p"></div><h1>ReferralFlow non risponde in questo momento</h1>
<p>Se si sta aggiornando dura uno o due minuti: la pagina si riapre da sola appena è pronta.</p>
<p id="s" style="font-size:13px"></p></main>
<script>
let n = 0;
async function riprova() {
  n++;
  try {
    const r = await fetch(location.href, { cache: 'no-store', credentials: 'include' });
    if (r.ok || (r.status >= 300 && r.status < 500)) { location.reload(); return; }
  } catch (e) {}
  document.getElementById('s').textContent = n > 24 ? 'Ci sta mettendo più del solito: se sei fuori dallo studio controlla la rete.' : '';
  setTimeout(riprova, 5000);
}
setTimeout(riprova, 4000);
</script></body></html>`;

const cortesia = () => new Response(ATTESA, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.mode !== 'navigate' || r.method !== 'GET') return;
  e.respondWith((async () => {
    // `?rf-prova-attesa` mostra la pagina di cortesia per provarla.
    if (new URL(r.url).searchParams.has('rf-prova-attesa')) return cortesia();
    try {
      const risposta = await fetch(r);
      // Il riprova della pagina di cortesia passa di qui: un 502 resta 502.
      return [502, 503, 504].includes(risposta.status) ? cortesia() : risposta;
    } catch (err) {
      return cortesia();
    }
  })());
});
