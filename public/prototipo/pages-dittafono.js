// ReferralFlow prototype — modulo Dittafono (app PWA local-first incorporata)
// Sorgente: ../../dittafono-clinico (React + Vite). Build copiata in ./dittafono/ (npm run build).
PAGES.dittafono = () => `
  <div class="dittafono-page">
    <iframe class="dittafono-frame" src="dittafono/index.html" title="Dittafono clinico" allow="microphone; screen-wake-lock" loading="eager"></iframe>
    <aside class="dittafono-side">
      <div class="card hero">
        <div class="row" style="gap:10px;align-items:center">${ICONS.mic}<div class="page-title" style="font-size:20px">Dittafono clinico</div></div>
        <p class="meta mt-8">Registra referti, lettere e note vocali direttamente dal telefono. L'audio resta sul dispositivo finché non viene inviato alla pipeline referti.</p>
        <div class="row mt-16" style="gap:8px;flex-wrap:wrap">
          <a class="btn primary" href="dittafono/index.html" target="_blank" rel="noopener">${ICONS.expand}Apri a schermo intero</a>
          <button class="btn" data-toast="Sul telefono: apri il link, poi «Aggiungi alla schermata Home» per installarlo come app.">${ICONS.phone}Installa sul telefono</button>
        </div>
      </div>
      <div class="card tight">
        <div class="section-title">Cosa fa</div>
        <div class="feature">${ICONS.pause}<div><b>Pausa e ripresa senza tagli</b><span>un unico documento audio, anche dopo mille interruzioni</span></div></div>
        <div class="feature">${ICONS.undo}<div><b>Torna indietro e inserisci</b><span>aggiungi la frase dimenticata nel punto giusto, con Annulla/Ripristina</span></div></div>
        <div class="feature">${ICONS.pin}<div><b>Marcatori e note</b><span>segna punti da controllare, dati mancanti, dubbi</span></div></div>
        <div class="feature">${ICONS.shield}<div><b>Local-first e offline</b><span>salvataggio continuo su dispositivo, recupero automatico se l'app si chiude</span></div></div>
        <div class="feature">${ICONS.upload}<div><b>Esporta</b><span>WAV finale continuo, segmenti originali + metadata JSON</span></div></div>
      </div>
      <div class="card tight ai">
        <div class="section-title"><span class="ai-tag"><span class="orb"></span>Prossimo passo</span></div>
        <p class="meta" style="margin:6px 0 0">Invio della registrazione alla pipeline «Analisi audio → Trascrizione → Bozza referto» (Fase 4 roadmap). L'ID univoco della registrazione viene mantenuto lungo tutta la pipeline.</p>
      </div>
    </aside>
  </div>`;
