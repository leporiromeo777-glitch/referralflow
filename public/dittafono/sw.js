// La vecchia applicazione «Dittafono clinico» teneva in cache sé stessa con questo
// service worker. Il dittafono ora è una pagina di ReferralFlow: questo file
// sostituisce il vecchio, svuota le sue cache, si toglie da solo e porta chi
// ha la vecchia app aperta alla pagina nuova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { const kk = await caches.keys(); await Promise.all(kk.map((k) => caches.delete(k))); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try { const cc = await self.clients.matchAll({ type: 'window' }); cc.forEach((c) => c.navigate('/prototipo/index.html#/dittafono')); } catch (_) {}
  })());
});
