'use client';

import { useState } from 'react';

export function CopyLink({ path, label }: { path: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.origin + path);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copiato ✓' : label}
    </button>
  );
}
