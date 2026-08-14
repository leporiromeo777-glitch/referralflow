'use client';

import { useEffect } from 'react';

// All'apertura del Programma, il riquadro scorrevole della timeline si
// posiziona sul prossimo appuntamento non completato (id="prossimo"),
// così non si riparte mai dalle 8 del mattino.

export function VaiAlProssimo() {
  useEffect(() => {
    const prossimo = document.getElementById('prossimo');
    const box = document.querySelector('.tl-scroll');
    if (!prossimo || !box) return;
    const dentro = prossimo.offsetTop - (box as HTMLElement).offsetTop;
    (box as HTMLElement).scrollTop = Math.max(0, dentro - 80);
  }, []);
  return null;
}
