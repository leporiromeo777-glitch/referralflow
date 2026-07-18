import 'server-only';

// Validazione centralizzata degli allegati: estensione + tipo MIME dichiarato
// devono corrispondere a uno dei formati ammessi. Blocca eseguibili, script,
// HTML e SVG (può contenere script) anche se qualcuno rinomina l'estensione,
// perché il tipo dichiarato dal browser deve comunque combaciare.
const MIME_BY_EXT: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.dcm': ['application/dicom', 'application/octet-stream'],
  '.xml': ['text/xml', 'application/xml'],
};

// Rotte pubbliche (moduli per il medico inviante): niente DICOM/XML, che
// restano solo per la cartella interna dello studio.
const PUBLIC_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const INTERNAL_EXTENSIONS = new Set(Object.keys(MIME_BY_EXT));

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

function isAllowed(file: File, extensions: ReadonlySet<string>): boolean {
  const ext = extensionOf(file.name);
  if (!extensions.has(ext)) return false;
  const allowedTypes = MIME_BY_EXT[ext];
  // Alcuni browser non dichiarano un MIME type affidabile per certi formati
  // (es. .dcm: stringa vuota o 'application/octet-stream'): in quel caso ci
  // si fida dell'estensione, già ristretta alla lista consentita.
  if (!file.type || file.type === 'application/octet-stream') return true;
  return allowedTypes.includes(file.type);
}

export function isAllowedPublicUpload(file: File): boolean {
  return isAllowed(file, PUBLIC_EXTENSIONS);
}

export function isAllowedInternalUpload(file: File): boolean {
  return isAllowed(file, INTERNAL_EXTENSIONS);
}

// Foto profilo: solo immagini (jpg/png), max 4 MB.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
export const MAX_AVATAR_SIZE = 4 * 1024 * 1024;
export function isAllowedImage(file: File): boolean {
  const ext = extensionOf(file.name);
  if (!IMAGE_EXTENSIONS.has(ext)) return false;
  if (file.type && !file.type.startsWith('image/')) return false;
  return true;
}
