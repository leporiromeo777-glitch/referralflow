#!/bin/bash
# ReferralFlow — pulizia dei dati di prova dell'anteprima.
#
#   bash mac/pulisci-dati-demo.sh
#
# Cancella DALLO STUDIO l'anagrafica finta dell'anteprima: pazienti demo,
# referral demo, medici invianti demo (Dr. Rossi, Dr.ssa Bianchi, Bonomo),
# consulti demo, appuntamenti finti e i medici interni di prova
# (Dr. Ferrari / Dr. Bernasconi).
#
# NON tocca: utenti e accessi, referti dettati (bozze, audio, dizionario),
# l'agenda letta dal robot (feed e appuntamenti), i medici che hai creato tu
# con le sigle, le impostazioni dello studio e le finestre di disponibilità.
#
# Nota: anche eventuali referral/pazienti inseriti A MANO per prova vengono
# cancellati (a oggi nello studio i dati veri sono referti e agenda).
set -euo pipefail

BREW="$([ -d /opt/homebrew ] && echo /opt/homebrew || echo /usr/local)"
export PATH="$BREW/bin:$BREW/opt/postgresql@16/bin:/usr/bin:/bin"

echo "Questa pulizia cancella per sempre i dati di prova (vedi intestazione dello script)."
read -r -p "Per procedere scrivi SI e premi Invio: " CONFERMA
if [ "$CONFERMA" != "SI" ]; then
  echo "Annullato: non è stato toccato nulla."
  exit 0
fi

psql referralflow -v ON_ERROR_STOP=1 << 'SQL'
do $$
declare
  sid uuid;
  n_ref int; n_paz int; n_doc int; n_app int; n_con int; n_prov int;
begin
  select id into sid from studios where slug = 'studio-demo';
  if sid is null then
    raise notice 'Studio demo non trovato: niente da pulire.';
    return;
  end if;

  -- Gli appuntamenti VERI (letti dal robot, feed_id presente) si sganciano
  -- da eventuali referral demo e dai medici di prova prima delle cancellazioni.
  update appointments set referral_id = null
   where studio_id = sid and feed_id is not null and referral_id is not null;
  update appointments a set provider_id = null
   where studio_id = sid and provider_id in (
     select id from providers where studio_id = sid
      and nome in ('Dr. Ferrari', 'Dr. Bernasconi', 'Dr. Bonomo'));

  delete from appointments where studio_id = sid and feed_id is null;
  get diagnostics n_app = row_count;

  delete from referrals where studio_id = sid;      -- storia/allegati/questionari a cascata
  get diagnostics n_ref = row_count;

  delete from patients where studio_id = sid;       -- documenti della cartella a cascata
  get diagnostics n_paz = row_count;

  delete from consulti where studio_id = sid;
  get diagnostics n_con = row_count;

  delete from referring_doctors where studio_id = sid;  -- consulti residui a cascata
  get diagnostics n_doc = row_count;

  delete from providers where studio_id = sid
    and nome in ('Dr. Ferrari', 'Dr. Bernasconi', 'Dr. Bonomo');
  get diagnostics n_prov = row_count;

  raise notice 'Pulizia fatta: % referral, % pazienti, % invianti, % consulti, % appuntamenti finti, % medici di prova.',
    n_ref, n_paz, n_doc, n_con, n_app, n_prov;
end $$;
SQL

echo
echo "Fatto. Restano intatti: utenti, referti dettati, agenda del robot,"
echo "medici con le sigle, impostazioni. Se il nome dello studio porta"
echo "ancora «(demo)», l'admin può cambiarlo da Impostazioni → Studio."
