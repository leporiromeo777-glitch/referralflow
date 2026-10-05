// Pagina Immagini di SOLA CONSULTAZIONE (5.10.2026, decisione dello studio):
// si guardano le immagini e le misure già fatte dall'apparecchio; gli
// strumenti di misura della piattaforma (il «righello») sono spenti. Così
// la piattaforma resta un visore e non un dispositivo medico fabbricato in
// studio. Il codice del righello resta, con le sue prove: si riaccende solo
// con IMAGING_MISURE=1 nel .env del server (e riaprendo il fascicolo di
// validazione descritto in docs/wiki/Piattaforma/Immagini.md).
export function misureAccese(): boolean {
  return process.env.IMAGING_MISURE === '1';
}
