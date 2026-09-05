'use client';

// Chip che porta il player del dettato al secondo indicato (nessun badge è
// decorativo: ogni provenienza «dettato oggi» si può riascoltare).
export function RiascoltaChip({ secondi, etichetta }: { secondi: number; etichetta?: string }) {
  const mmss = `${Math.floor(secondi / 60)}:${String(Math.floor(secondi % 60)).padStart(2, '0')}`;
  return (
    <button
      type="button"
      title={`Riascolta qui (${mmss})`}
      style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
        color: '#0d5c48', background: '#e3ece8', borderRadius: 4, padding: '2px 6px', marginLeft: 6,
        whiteSpace: 'nowrap', verticalAlign: 'middle', border: 0, cursor: 'pointer',
      }}
      onClick={() => {
        const a = document.getElementById('audio-dettato') as HTMLAudioElement | null;
        if (!a) return;
        a.playbackRate = 1;
        a.currentTime = Math.max(0, secondi - 1.5);
        void a.play().catch(() => {});
        a.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
    >
      {etichetta ?? 'riascolta'} 🎧 {mmss}
    </button>
  );
}
