// Le proposte di orario della pagina Pressione sono un dispositivo medico
// fabbricato e usato dentro lo studio (docs/legale/dispositivo-in-house-pressione/):
// spente di serie; si accendono solo scrivendo PRESSIONE_PROPOSTE=1 nel .env del
// server. Sul server dello studio lo studio le ha accese l'8.10.2026, prima che
// fascicolo, validazione e notifica fossero a posto (wiki, Decisioni/Registro). PURO.
export const proposteAccese = (env: Record<string, string | undefined> = process.env): boolean => env.PRESSIONE_PROPOSTE === '1';
