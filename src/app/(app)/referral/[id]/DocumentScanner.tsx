'use client';

import { useEffect, useRef, useState } from 'react';

// Scanner documenti nel browser: dalla foto scattata mostra quattro angoli
// trascinabili sul bordo del foglio, con una lente d'ingrandimento durante il
// trascinamento (come lo scanner dei File del telefono). Alla conferma
// raddrizza la prospettiva (omografia), ritaglia e schiarisce il documento.
// Tutto avviene nel telefono: nessuna immagine esce dal dispositivo.

type P = { x: number; y: number };

// Risolve un sistema lineare n×n con eliminazione di Gauss (pivot parziale).
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// Omografia che mappa i punti destinazione (rettangolo di uscita) sui punti
// sorgente (angoli scelti): per ogni pixel d'uscita risaliamo al pixel foto.
function homography(dst: P[], src: P[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = dst[i];
    const { x, y } = src[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function dist(a: P, b: P): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Applica l'omografia campionando la sorgente con interpolazione bilineare.
function warp(src: ImageData, sw: number, sh: number, H: number[], ow: number, oh: number): ImageData {
  const out = new ImageData(ow, oh);
  const s = src.data;
  const o = out.data;
  const [a, b, c, d, e, f, g, h] = H;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const denom = g * x + h * y + 1;
      const u = (a * x + b * y + c) / denom;
      const v = (d * x + e * y + f) / denom;
      const oi = (y * ow + x) * 4;
      if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) {
        o[oi] = o[oi + 1] = o[oi + 2] = 255; o[oi + 3] = 255;
        continue;
      }
      const x0 = u | 0, y0 = v | 0;
      const fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let k = 0; k < 3; k++) {
        const top = s[i00 + k] * (1 - fx) + s[i10 + k] * fx;
        const bot = s[i01 + k] * (1 - fx) + s[i11 + k] * fx;
        o[oi + k] = top * (1 - fy) + bot * fy;
      }
      o[oi + 3] = 255;
    }
  }
  return out;
}

// Schiaritura leggera: alza un po' il contrasto e la luminosità per rendere
// il foglio più pulito, senza rovinare tracciati (ECG) o firme.
function enhance(data: Uint8ClampedArray): void {
  const contrast = 1.18, bright = 8;
  for (let i = 0; i < data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const val = (data[i + k] - 128) * contrast + 128 + bright;
      data[i + k] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }
}

const WORK_MAX = 2000; // lato massimo della sorgente di lavoro
const OUT_MAX = 1500;  // lato massimo del documento finale
const INSET = 0.1;     // margine iniziale degli angoli

export function DocumentScanner({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [ar, setAr] = useState(0.7); // proporzione larghezza/altezza della foto
  const [corners, setCorners] = useState<P[]>([
    { x: INSET, y: INSET },
    { x: 1 - INSET, y: INSET },
    { x: 1 - INSET, y: 1 - INSET },
    { x: INSET, y: 1 - INSET },
  ]);
  const [drag, setDrag] = useState<number | null>(null);
  const [loupe, setLoupe] = useState<P | null>(null);
  const [processing, setProcessing] = useState(false);

  // Carica la foto normalizzando l'orientamento EXIF, la riduce a WORK_MAX e la
  // usa sia per la visualizzazione sia per il campionamento (stesso spazio).
  useEffect(() => {
    let alive = true;
    (async () => {
      let drawable: CanvasImageSource;
      let w: number;
      let h: number;
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        drawable = bmp; w = bmp.width; h = bmp.height;
      } catch {
        const url = URL.createObjectURL(file);
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = url;
        });
        drawable = img; w = img.naturalWidth; h = img.naturalHeight;
        URL.revokeObjectURL(url);
      }
      const m = Math.max(w, h);
      if (m > WORK_MAX) { const s = WORK_MAX / m; w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(drawable, 0, 0, w, h);
      if (!alive) return;
      srcCanvasRef.current = c;
      setAr(w / h);
      setDisplayUrl(c.toDataURL('image/jpeg', 0.92));
    })();
    return () => { alive = false; };
  }, [file]);

  // Trascinamento angolo: ascolta il puntatore su tutta la finestra così non si
  // "perde" l'angolo se il dito esce dall'immagine.
  useEffect(() => {
    if (drag === null) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      const rect = frameRef.current!.getBoundingClientRect();
      let nx = (e.clientX - rect.left) / rect.width;
      let ny = (e.clientY - rect.top) / rect.height;
      nx = Math.min(1, Math.max(0, nx));
      ny = Math.min(1, Math.max(0, ny));
      setCorners((cs) => cs.map((c, i) => (i === drag ? { x: nx, y: ny } : c)));
      setLoupe({ x: nx, y: ny });
    };
    const up = () => { setDrag(null); setLoupe(null); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag]);

  // Disegna la lente: porzione ingrandita della foto attorno all'angolo, con
  // mirino al centro.
  useEffect(() => {
    const src = srcCanvasRef.current;
    const lc = loupeCanvasRef.current;
    if (!loupe || !src || !lc) return;
    const size = 128, zoom = 3, dpr = window.devicePixelRatio || 1;
    lc.width = size * dpr; lc.height = size * dpr;
    const ctx = lc.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const sx = loupe.x * src.width, sy = loupe.y * src.height;
    const region = size / zoom;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, sx - region / 2, sy - region / 2, region, region, 0, 0, size, size);
    ctx.strokeStyle = 'rgba(13,92,72,.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
    ctx.stroke();
  }, [loupe]);

  async function confirm() {
    const src = srcCanvasRef.current;
    if (!src) return;
    setProcessing(true);
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const sw = src.width, sh = src.height;
    const srcData = src.getContext('2d')!.getImageData(0, 0, sw, sh);
    const sp = corners.map((c) => ({ x: c.x * sw, y: c.y * sh }));

    const wTop = dist(sp[0], sp[1]), wBot = dist(sp[3], sp[2]);
    const hL = dist(sp[0], sp[3]), hR = dist(sp[1], sp[2]);
    let ow = Math.round(Math.max(wTop, wBot));
    let oh = Math.round(Math.max(hL, hR));
    const m = Math.max(ow, oh);
    if (m > OUT_MAX) { const s = OUT_MAX / m; ow = Math.round(ow * s); oh = Math.round(oh * s); }
    ow = Math.max(16, ow); oh = Math.max(16, oh);

    const dst = [
      { x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: 0, y: oh },
    ];
    const H = homography(dst, sp);
    const outData = warp(srcData, sw, sh, H, ow, oh);
    enhance(outData.data);

    const oc = document.createElement('canvas');
    oc.width = ow; oc.height = oh;
    oc.getContext('2d')!.putImageData(outData, 0, 0);
    const blob = await new Promise<Blob | null>((res) => oc.toBlob((b) => res(b), 'image/jpeg', 0.9));
    if (blob) onDone(blob);
    setProcessing(false);
  }

  const poly = corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ');

  return (
    <div className="scan-overlay" role="dialog" aria-label="Ritaglia il documento">
      <button
        type="button"
        className="scan-close"
        onClick={onCancel}
        disabled={processing}
        aria-label="Chiudi"
      >
        ✕
      </button>
      <div className="scan-stage">
        <div className="scan-frame" ref={frameRef} style={{ aspectRatio: String(ar) }}>
          {displayUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt="Documento da ritagliare" className="scan-img" draggable={false} />
          )}
          <svg className="scan-poly" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points={poly} />
          </svg>
          {corners.map((c, i) => (
            <div
              key={i}
              className={`scan-handle${drag === i ? ' active' : ''}`}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setDrag(i);
                setLoupe({ x: c.x, y: c.y });
              }}
            >
              <span className="scan-dot" />
            </div>
          ))}
          {loupe && (
            <canvas
              ref={loupeCanvasRef}
              className="scan-loupe"
              style={{
                left: `${loupe.x * 100}%`,
                top: `${loupe.y * 100}%`,
                transform: loupe.y > 0.22
                  ? 'translate(-50%, calc(-100% - 28px))'
                  : 'translate(-50%, 28px)',
              }}
            />
          )}
        </div>
      </div>

      <div className="scan-bar">
        <button type="button" className="btn btn-ghost scan-cancel" onClick={onCancel} disabled={processing}>
          Annulla
        </button>
        <span className="scan-hint">Trascina gli angoli sul bordo del foglio</span>
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={processing || !displayUrl}>
          {processing ? 'Elaboro…' : 'Usa scansione'}
        </button>
      </div>
    </div>
  );
}
