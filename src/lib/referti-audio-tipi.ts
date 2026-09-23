// Formati audio accettati per i dettati (upload dalla pagina e audio consegnato
// dalla catena): estensione → content type.
export const TIPI_AUDIO: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aiff': 'audio/aiff', '.caf': 'audio/x-caf',
  // Dittafono Philips DPM (2026-09-07): DSS classico e DSS Pro. Il file
  // resta com'è (lo decodifica ffmpeg sul Mac dello studio); per il
  // riascolto nel browser la rotta audio lo converte al volo in WAV.
  '.dss': 'audio/x-dss', '.ds2': 'audio/x-dss',
};
export const MAX_BYTES_AUDIO = 200 * 1024 * 1024;
