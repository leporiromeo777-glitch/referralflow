'use client';

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { uploadPatientDocument } from './actions';
import { DocumentScanner } from './DocumentScanner';

// Caricamento della cartella pensato per il telefono: «Scansiona» scatta la
// foto e apre lo scanner con angoli regolabili (ritaglio + raddrizzamento);
// «Scegli dai file» carica PDF o immagini già pronti. Tutto si accumula in una
// lista e si invia insieme. L'input mandato dal form è uno solo (carrier),
// riempito via DataTransfer con tutti i file scelti.
function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  const label =
    count > 1 ? `Aggiungi ${count} documenti alla cartella` : 'Aggiungi alla cartella';
  return (
    <button className="btn btn-primary" type="submit" disabled={pending || count === 0}>
      {pending ? 'Carico…' : label}
    </button>
  );
}

function nomeFile(f: File): string {
  return f.name && f.name.trim() ? f.name : 'documento';
}

export function CartellaUpload({
  referralId,
  patientId,
  categorie,
}: {
  referralId: string;
  patientId: string;
  categorie: Record<string, string>;
}) {
  const carrierRef = useRef<HTMLInputElement>(null); // l'unico input inviato dal form
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [scanFile, setScanFile] = useState<File | null>(null);

  // Riporta la lista nell'input che il form invierà davvero.
  function sync(next: File[]) {
    setFiles(next);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (carrierRef.current) carrierRef.current.files = dt.files;
  }
  function aggiungiFile(arr: File[]) {
    if (arr.length === 0) return;
    sync([...files, ...arr]);
  }
  function togli(i: number) {
    sync(files.filter((_, j) => j !== i));
  }

  return (
    <form action={uploadPatientDocument} className="cu-form">
      <input type="hidden" name="referral_id" value={referralId} />
      <input type="hidden" name="patient_id" value={patientId} />

      {/* input inviato dal form: gestito via DataTransfer, mai aperto a mano */}
      <input ref={carrierRef} type="file" name="file" multiple className="cu-hidden" tabIndex={-1} />
      {/* scatto per lo scanner: capture apre la fotocamera del telefono */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="cu-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setScanFile(f);
          e.target.value = '';
        }}
      />
      {/* PDF o immagini già pronti, anche più elementi insieme */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,application/pdf,.dcm,.xml"
        multiple
        className="cu-hidden"
        onChange={(e) => {
          if (e.target.files) aggiungiFile(Array.from(e.target.files));
          e.target.value = '';
        }}
      />

      <div className="cu-buttons">
        <button type="button" className="btn cu-big" onClick={() => cameraRef.current?.click()}>
          📷 Scansiona un documento
        </button>
        <button
          type="button"
          className="btn btn-ghost cu-big"
          onClick={() => galleryRef.current?.click()}
        >
          📎 Scegli dai file
        </button>
      </div>

      {files.length > 0 && (
        <ul className="cu-list">
          {files.map((f, i) => (
            <li key={i}>
              <span className="cu-name">{nomeFile(f)}</span>
              <button type="button" className="cu-x" onClick={() => togli(i)} aria-label="Togli">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="cu-meta">
        <select name="categoria" defaultValue="referto">
          {Object.entries(categorie).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input name="nota" maxLength={200} placeholder="Nota (facoltativa)" />
      </div>

      <Submit count={files.length} />
      <p className="cu-hint">
        Scansiona più pagine una dopo l&rsquo;altra: si aggiungono alla lista, poi tocchi
        «Aggiungi alla cartella».
      </p>

      {scanFile && (
        <DocumentScanner
          file={scanFile}
          onCancel={() => setScanFile(null)}
          onDone={(blob) => {
            const n = files.filter((f) => f.name.startsWith('scansione-')).length + 1;
            aggiungiFile([new File([blob], `scansione-${n}.jpg`, { type: 'image/jpeg' })]);
            setScanFile(null);
          }}
        />
      )}
    </form>
  );
}
