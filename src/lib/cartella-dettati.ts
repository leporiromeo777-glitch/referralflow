// «Collega la cartella dei dettati» (1.10.2026): la cartella «Audio da
// trascrivere» del Mac server (cartella condivisa della catena, vedi
// Catena/Panoramica) collegata sulla Scrivania di ogni computer dello
// studio, Windows e Mac, solo nella rete dello studio (SMB). Un sito non può
// creare cartelle sul computer: si scarica un file per Windows (.bat) o si
// apre un indirizzo smb:// sul Mac. Parte pura, provata in
// prove-cartella-dettati.test.ts; nessuna credenziale qui dentro: utente e
// password li chiede il computer, la prima volta.

export type Condivisione = { nome: string; percorso: string; ospite: boolean };

// L'uscita di `sharing -l` (macOS): blocchi «name: … path: … smb: { … }».
export function leggiCondivisioni(uscita: string): Condivisione[] {
  const out: Condivisione[] = [];
  for (const blocco of String(uscita || '').split(/\n(?=name:\s)/)) {
    const nome = /^name:\s*(.+)$/m.exec(blocco)?.[1]?.trim();
    const percorso = /^path:\s*(.+)$/m.exec(blocco)?.[1]?.trim();
    const smb = /smb:\s*\{([\s\S]*?)\}/.exec(blocco)?.[1] ?? '';
    if (!nome || !percorso || !/shared:\s*1/.test(smb)) continue;
    const nomeSmb = /name:\s*(.+)/.exec(smb)?.[1]?.trim() || nome;
    out.push({ nome: nomeSmb, percorso, ospite: /guest access:\s*1/.test(smb) });
  }
  return out;
}

export function indirizzoSmb(host: string, nome: string): string {
  return `smb://${host}/${encodeURIComponent(nome)}`;
}

// Nomi e indirizzi che finiscono in uno script: solo caratteri sicuri, così
// nessun valore può spezzare le virgolette del .bat.
const sicuro = (s: string) => String(s || '').replace(/[^A-Za-z0-9 ._()-]/g, '');

// Il .bat per Windows: prova il nome del Mac e, se non risponde, l'indirizzo
// di adesso; la prima volta Windows chiede utente e password della
// condivisione e li ricorda; poi mette il collegamento sulla Scrivania e apre
// la cartella. Righe con CRLF.
export function scriptWindows(o: { host: string; ip: string | null; nome: string; cosa?: string }): string {
  const host = sicuro(o.host), ip = sicuro(o.ip ?? ''), nome = sicuro(o.nome);
  const righe = [
    '@echo off',
    `rem ReferralFlow: collega la cartella ${sicuro(o.cosa ?? 'dei dettati')} sulla Scrivania (solo nella rete dello studio).`,
    `set "CARTELLA=\\\\${host}\\${nome}"`,
    'dir "%CARTELLA%" >nul 2>&1 && goto collegata',
    'echo Collego la cartella: se Windows lo chiede, scrivi utente e password della condivisione dello studio.',
    'net use "%CARTELLA%" /persistent:yes && goto collegata',
    ...(ip ? [
      `set "CARTELLA=\\\\${ip}\\${nome}"`,
      'net use "%CARTELLA%" /persistent:yes && goto collegata',
    ] : []),
    'echo.',
    'echo Non trovo la cartella. Sei nella rete dello studio e il Mac server e acceso?',
    'pause',
    'exit /b 1',
    ':collegata',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\${nome}.lnk'); $s.TargetPath=$env:CARTELLA; $s.Save()"`,
    'start "" explorer "%CARTELLA%"',
    'echo Fatto: il collegamento "' + nome + '" e sulla Scrivania.',
    'timeout /t 5 >nul',
  ];
  return righe.join('\r\n') + '\r\n';
}
