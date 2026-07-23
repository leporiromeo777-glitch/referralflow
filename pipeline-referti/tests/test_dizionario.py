# Testi finti, nessun referto reale (SPEC §10).
import json
import tempfile
import unittest
from pathlib import Path

from referti.dizionario import applica, carica
from referti.errori import ErroreFase


class TestApplica(unittest.TestCase):
    def test_sostituzione_parola_intera(self):
        testo, n = applica(
            "eseguito eco cardiogramma di controllo",
            {"eco cardiogramma": "ecocardiogramma"},
        )
        self.assertEqual(testo, "eseguito ecocardiogramma di controllo")
        self.assertEqual(n, 1)

    def test_non_tocca_sottostringhe(self):
        testo, n = applica("ecocardiogramma", {"eco": "ecografia"})
        self.assertEqual(testo, "ecocardiogramma")
        self.assertEqual(n, 0)

    def test_maiuscole(self):
        testo, n = applica("Eco Cardiogramma normale", {"eco cardiogramma": "ecocardiogramma"})
        self.assertEqual(testo, "ecocardiogramma normale")
        self.assertEqual(n, 1)


class TestCarica(unittest.TestCase):
    def _scrivi(self, contenuto):
        f = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        )
        f.write(json.dumps(contenuto))
        f.close()
        return Path(f.name)

    def test_rifiuta_sostituzioni_con_cifre(self):
        # Vincolo §2.4: mai correzioni automatiche sui numeri.
        percorso = self._scrivi({"sostituzioni": {"venti mg": "20 mg"}})
        with self.assertRaises(ErroreFase):
            carica(percorso)

    def test_file_mancante(self):
        with self.assertRaises(ErroreFase):
            carica(Path("/percorso/inesistente/correzioni.json"))

    def test_carica_esempio_del_repo(self):
        esempio = Path(__file__).resolve().parent.parent / "correzioni.esempio.json"
        dati = carica(esempio)
        self.assertIn("sostituzioni", dati)
        self.assertIn("intervalli_numerici", dati)


if __name__ == "__main__":
    unittest.main()
