import { redirect } from 'next/navigation';

// La Lista d'attesa è diventata la scheda «Disdette» della Coda: vecchi link e
// bookmark vengono reindirizzati lì.
export default function ListaAttesa() {
  redirect('/coda?vista=disdette');
}
