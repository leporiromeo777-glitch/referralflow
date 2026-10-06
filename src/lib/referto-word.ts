import 'server-only';
import { query } from './db';
import { generaDocxReferto, ricomponiParagrafi } from './referto-docx';
import { profiloMedico } from './referti-medici';
import { appellativo, conTitolo, dataCh, dataVisitaDalTesto, destinatarioAffidabile, destinatarioDalSaluto, destinatarioInRubrica, scegliInRubrica, siglaDaEmail } from './referti-lettera';
import { agganciaRiferimenti, documentiDelPaziente } from './referti-allegati';
import { bloccoAllegato } from './referti-allegato-blocco';
import { bloccoCopiaConoscenza } from './referti-copia';
import { attorno, vociCopia, type Attorno } from './referti-inviante';

// Il referto in Word con la carta intestata dello studio (stampo in
// modelli/referto-carta-intestata.docx): pronto da rifinire e spedire.
// La carta segue il MEDICO che ha dettato (profilo pubblicato dal Mac):
// nome e righe d'intestazione, titolo del rapporto, riga «Copia».
// Formato «lettera» (2026-09-07, dalla versione della segretaria):
// destinatario su più righe («Egregio Signor», nome, specialità, e-mail),
// data della DETTATURA con la sigla di chi scrive, titolo con la data della
// visita. Il nome del file è NEUTRO: niente nome del paziente.
// Dal 26.9.2026 è una funzione (prima stava nella rotta /api/referti/docx):
// la usa anche la mail preparata per l'inviante, così il Word è lo stesso.

export type WordReferto = { docx: Buffer; nomeFile: string; stato: string; intorno: Attorno | null; dataBase: string };

export async function costruisciWord(sessione: { studioId: string; email?: string | null }, id: string): Promise<WordReferto | { errore: string; status: number }> {
  const [b] = await query<{
    stato: string; testo_finale: string | null; payload: any;
    campi_confermati: any; created_at: string;
    studio_nome: string; titolare: string | null; studio_telefono: string | null; studio_email: string | null;
    reviewed_email: string | null;
  }>(
    `select b.stato, b.testo_finale, b.payload, b.campi_confermati, b.created_at::text,
            s.nome as studio_nome, s.titolare, s.telefono as studio_telefono, s.notify_email as studio_email,
            u.email as reviewed_email
       from referti_bozze b join studios s on s.id = b.studio_id
       left join users u on u.id = b.reviewed_by
      where b.id = $1 and b.studio_id = $2`,
    [id, sessione.studioId]
  );
  if (!b) return { errore: 'Non trovato', status: 404 };

  const testo = ((b.testo_finale ?? b.payload?.testo_corretto ?? '') as string).trim();
  if (!testo) return { errore: 'Referto vuoto', status: 404 };

  // I campi confermati dalla revisione vincono su quelli estratti.
  const campo = (nome: string): string => {
    const v = b.campi_confermati?.[nome] ?? b.payload?.campi_estratti?.[nome];
    const s = typeof v === 'string' ? v.trim() : '';
    return s && s.toLowerCase() !== 'non indicato' ? s : '';
  };

  const pazienteNome = campo('nome_paziente');
  const nascita = campo('data_nascita');
  const destinatarioNome = campo('medico_destinatario') || campo('medico_inviante');

  // Il medico che ha dettato: profilo pubblicato dal Mac (carta intestata
  // sua); altrimenti il titolare dello studio; altrimenti lo studio.
  const dettante = b.payload?.medico && typeof b.payload.medico === 'object' ? b.payload.medico : null;
  const profilo = await profiloMedico(sessione.studioId, dettante?.id);
  const nomeMedico = (profilo?.nome ?? (typeof dettante?.nome === 'string' ? dettante.nome : '') ?? '').trim();
  const titolare = (b.titolare ?? '').trim();
  const medico = nomeMedico ? conTitolo(nomeMedico) : titolare ? conTitolo(titolare) : b.studio_nome;
  const formato = profilo?.formato ?? 'rapporto';

  // Righe dell'intestazione: dal profilo, con {telefono}/{email} dallo
  // studio; una riga con un segnaposto non risolvibile viene tolta.
  const telefono = (b.studio_telefono ?? '').trim();
  const emailStudio = (b.studio_email ?? '').trim();
  const intestazione = (profilo?.intestazione ?? [])
    .map((r) => r.replace('{telefono}', telefono).replace('{email}', emailStudio))
    .filter((r) => !/\{[a-z_]+\}/.test(r) && !/:\s*$/.test(r))
    .join('\n');

  // Date (prassi della segretaria, confronto del 2026-09-07): «Lugano, …» è
  // il giorno in cui la lettera viene SCRITTA (oggi), con la sigla di chi
  // ha confermato (o di chi scarica); nel titolo va la data della
  // DETTATURA (dal dittafono o dai metadati audio; altrimenti l'arrivo).
  const dettatoIl = typeof b.payload?.dettato_il === 'string' ? b.payload.dettato_il : '';
  const dataDettato = dataCh(dettatoIl) || dataCh(b.created_at);
  const dataOggi = dataCh(new Date().toISOString());
  const sigla = siglaDaEmail(b.reviewed_email ?? sessione.email ?? '');
  // La segretaria data la lettera al giorno del dettato (12 lettere su 12,
  // visto il 12.9.2026), non al giorno in cui la scarica.
  const dataBase = dataDettato || dataOggi;
  const data = formato === 'lettera' && sigla ? `${dataBase}/${sigla}` : dataBase;

  // Destinatario: nel formato lettera su più righe, con e-mail e specialità
  // dalla rubrica dei medici invianti se il cognome corrisponde. Se il nome
  // estratto è solo chi ha eseguito un esame citato nel testo (saluto
  // generico «Caro collega»), non è il destinatario: righe vuote da compilare.
  // Se i campi non danno un destinatario affidabile, lo dà il saluto della
  // lettera stessa («Cara dottoressa Bianchi,»), col suo genere.
  const dalSaluto = formato === 'lettera' ? destinatarioDalSaluto(testo) : null;
  const daiCampi = destinatarioNome && destinatarioAffidabile(testo, destinatarioNome) ? destinatarioNome : '';
  const nomeDest = daiCampi || dalSaluto?.nome || '';
  const femminile = (daiCampi ? /\b(dr\.?ssa|dott\.?ssa|dottoressa|signora)\b/i.test(daiCampi) : false) || (!daiCampi && (dalSaluto?.femminile ?? false));
  let destinatario = nomeDest ? conTitolo(nomeDest.replace(/^dr\.?\s*(med\.?)?\s*/i, ''), femminile) : ' ';
  let via = 'Via email';
  // Inviante collegato, copia per conoscenza, allegati (ECG compreso): la
  // stessa funzione della pagina di revisione (26.9.2026).
  const intorno = await attorno(sessione.studioId, id).catch(() => null);
  if (formato === 'lettera') {
    // Se il referto è collegato a un inviante e il destinatario è lui, i suoi
    // dati vengono dal legame (scelto una volta, anche a mano), non da una
    // nuova ricerca per nome.
    const scelto = intorno?.inviante.scelto ?? null;
    const legato = scelto && nomeDest && scegliInRubrica(nomeDest, [{ nome: scelto.nome, email: null, studio: null, specialita: null }])
      ? { email: scelto.email, specialita: scelto.specialita, studio: '' } : null;
    const rubrica = legato ?? (nomeDest ? await destinatarioInRubrica(sessione.studioId, nomeDest) : null);
    const righe = nomeDest
      ? [appellativo(nomeDest, femminile), destinatario,
         rubrica?.specialita ? `FMH ${rubrica.specialita}` : '',
         rubrica?.email ? `Via e-mail: ${rubrica.email}` : 'Via e-mail']
      : ['Egregio Signor', 'Dr. med. ', 'Via e-mail'];
    destinatario = righe.filter(Boolean).join('\n');
    via = '';
  }

  // Titolo: dal profilo ({data_visita} = data della dettatura; se nel testo
  // c'è «visita del …»/«in data …» conta per il formato rapporto).
  const dataVisita = formato === 'lettera' ? dataDettato : (dataVisitaDalTesto(testo) || dataDettato);
  const titolo = (profilo?.titolo_rapporto || 'VISITA AMBULATORIALE, RAPPORTO').replace('{data_visita}', dataVisita);
  // Riga «Copia»: dal profilo (Moschovitis la tiene, Moccetti no).
  let copia = profilo ? profilo.copia : 'Copia: alla paziente';
  // Copia per conoscenza (26.9.2026): dal dettato o dalla revisione, con
  // l'indirizzo della rubrica.
  if (intorno) {
    const cc = bloccoCopiaConoscenza(vociCopia(intorno));
    if (cc) copia = [copia, cc].filter(Boolean).join('\n');
  }
  // Blocco «Allegato:» come lo scrive la segretaria (12.9.2026): documenti
  // agganciati alle note per la segreteria, documenti citati nel testo e,
  // dal 26.9.2026, l'ECG della cartella quando il medico ne parla. Dal
  // 26.9.2026 anche nel formato rapporto. Senza documenti non compare.
  if (intorno?.allegati.length) {
    const blocco = bloccoAllegato([], '', [], intorno.allegati.map((a) => a.etichetta));
    if (blocco) copia = [copia, blocco].filter(Boolean).join('\n');
  } else if (formato === 'lettera' && !intorno && pazienteNome) {
    const note = Array.isArray(b.payload?.note_segreteria)
      ? (b.payload.note_segreteria as unknown[]).filter((n): n is string => typeof n === 'string') : [];
    try {
      const rif = note.length ? await agganciaRiferimenti(sessione.studioId, pazienteNome, note) : [];
      const cartella = await documentiDelPaziente(sessione.studioId, pazienteNome);
      const blocco = bloccoAllegato(rif, testo, cartella);
      if (blocco) copia = [copia, blocco].filter(Boolean).join('\n');
    } catch { /* best-effort */ }
  }

  const docx = await generaDocxReferto({
    medico,
    intestazione,
    telefono,
    destinatario,
    via,
    data,
    titolo,
    // Formato lettera: riga «Paziente» sopra il nome, come nelle lettere
    // della segretaria (9 su 12, visto il 12.9.2026).
    paziente: (formato === 'lettera' && pazienteNome ? 'Paziente\n' : '') + ([pazienteNome, nascita].filter(Boolean).join(' – ') || ' '),
    piede: [pazienteNome, nascita].filter(Boolean).join(', ') + (formato === 'lettera' ? '' : (dataDettato ? `  ${dataDettato}` : '')),
    testo: ricomponiParagrafi(testo),
    copia,
    // Nella lettera due paragrafi vuoti tra destinatario e data (segretaria).
    spaziDestinatario: formato === 'lettera' ? 2 : undefined,
    // Grassetto come nella lettera vecchia del paziente (6.10.2026).
    grassetti: !b.payload?.forma_lettera?.spento && Array.isArray(b.payload?.forma_lettera?.grassetti) ? b.payload.forma_lettera.grassetti : [],
  });

  const nomeFile = `referto-${dataBase.replaceAll('.', '-') || 'bozza'}.docx`;
  return { docx, nomeFile, stato: b.stato, intorno, dataBase };
}
