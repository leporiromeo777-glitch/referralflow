// Le proposte di orario della pagina Pressione sono un dispositivo medico
// fabbricato e usato dentro lo studio (docs/legale/dispositivo-in-house-pressione/):
// restano SPENTE finché fascicolo, validazione e notifica non sono a posto.
// Si accendono solo scrivendo PRESSIONE_PROPOSTE=1 nel .env del server. PURO.
export const proposteAccese = (env: Record<string, string | undefined> = process.env): boolean => env.PRESSIONE_PROPOSTE === '1';
