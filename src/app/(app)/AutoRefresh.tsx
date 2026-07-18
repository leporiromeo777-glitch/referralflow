'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Rinfresca i dati server-side a intervalli regolari (campanella, code, programma).
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
