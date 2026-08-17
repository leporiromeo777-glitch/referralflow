import { PageHero } from '../PageHero';
import { AnonimizzaForm } from './AnonimizzaForm';

export const dynamic = 'force-dynamic';

// Anonimizzazione locale dei documenti: l'AI del Mac dello studio individua i
// dati identificativi, il codice li sostituisce con segnaposto. Il documento
// con i dati veri non esce mai da questo computer (vedi src/lib/anonimizza.ts).

export default function AnonimizzaPage() {
  return (
    <div className="content">
      <PageHero zone="slate" eyebrow="Studio" title="Anonimizza documenti">
        Togli nomi e dati personali da un testo o da un PDF prima di condividerlo:
        l&apos;elaborazione avviene interamente sul computer dello studio, il documento non esce mai.
      </PageHero>
      <AnonimizzaForm />
    </div>
  );
}
