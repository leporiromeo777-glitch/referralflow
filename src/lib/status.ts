export const STATUS: Record<string, { label: string; tone: string }> = {
  ricevuta: { label: 'Ricevuta', tone: 'gray' },
  triage: { label: 'Triage', tone: 'gray' },
  da_prenotare: { label: 'Da prenotare', tone: 'warn' },
  prenotata: { label: 'Prenotata', tone: 'accent' },
  vista: { label: 'Paziente visto', tone: 'accent' },
  referto_inviato: { label: 'Referto inviato', tone: 'success' },
  chiusa: { label: 'Chiusa', tone: 'gray' },
};

export const NEXT_STATUS: Record<string, string | undefined> = {
  ricevuta: 'triage',
  triage: 'da_prenotare',
  da_prenotare: 'prenotata',
  prenotata: 'vista',
  vista: 'referto_inviato',
  referto_inviato: 'chiusa',
  chiusa: undefined,
};

export const NEXT_ACTION: Record<string, string> = {
  ricevuta: 'Smista (triage)',
  triage: 'Segna da prenotare',
  da_prenotare: 'Prenota',
  prenotata: 'Segna paziente visto',
  vista: 'Invia esito al medico',
  referto_inviato: 'Chiudi referral',
};

export const URGENZA: Record<string, { label: string; tone: string }> = {
  urgente: { label: 'Urgente', tone: 'danger' },
  normale: { label: 'Normale', tone: 'gray' },
  programmabile: { label: 'Programmabile', tone: 'gray' },
};
