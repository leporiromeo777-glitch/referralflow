# Testi finti, nessun referto reale (SPEC §10).
import unittest

from referti.divergenze import confronta


class TestDivergenze(unittest.TestCase):
    def test_testi_identici(self):
        testo = "il paziente riferisce dispnea da sforzo moderata"
        self.assertEqual(confronta(testo, testo), [])

    def test_punteggiatura_non_diverge(self):
        self.assertEqual(
            confronta("Dispnea da sforzo, moderata.", "dispnea da sforzo moderata"),
            [],
        )

    def test_parola_diversa(self):
        div = confronta(
            "valvola aortica tricuspide normale",
            "valvola aortica bicuspide normale",
        )
        self.assertEqual(len(div), 1)
        self.assertEqual(div[0]["versione_a"], "tricuspide")
        self.assertEqual(div[0]["versione_b"], "bicuspide")

    def test_parola_assente(self):
        div = confronta("ritmo sinusale regolare", "ritmo sinusale non regolare")
        self.assertEqual(len(div), 1)
        self.assertEqual(div[0]["versione_a"], "(assente)")
        self.assertEqual(div[0]["versione_b"], "non")

    def test_nessuna_scelta_automatica(self):
        # Il confronto riporta entrambe le versioni, non ne sceglie una.
        div = confronta("frazione del trenta percento", "frazione del quaranta percento")
        self.assertEqual(len(div), 1)
        self.assertIn("versione_a", div[0])
        self.assertIn("versione_b", div[0])


if __name__ == "__main__":
    unittest.main()
