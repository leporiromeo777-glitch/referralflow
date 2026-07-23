# Testi finti, nessun referto reale (SPEC §10).
import unittest

from referti.controlli import controlla

INTERVALLI = {
    "frequenza_cardiaca": {"min": 35, "max": 180, "unita": "bpm"},
    "frazione_eiezione": {"min": 10, "max": 80, "unita": "%"},
}


class TestControlli(unittest.TestCase):
    def test_valore_normale_nessun_allarme(self):
        self.assertEqual(
            controlla({"frequenza_cardiaca": "72 bpm"}, INTERVALLI), []
        )

    def test_valore_fuori(self):
        allarmi = controlla({"frequenza_cardiaca": "250 bpm"}, INTERVALLI)
        self.assertEqual(len(allarmi), 1)
        self.assertEqual(allarmi[0]["stato"], "fuori")
        self.assertEqual(allarmi[0]["valore"], 250)
        self.assertEqual(allarmi[0]["intervallo"], "35-180")

    def test_valore_al_limite(self):
        allarmi = controlla({"frequenza_cardiaca": 170}, INTERVALLI)
        self.assertEqual(len(allarmi), 1)
        self.assertEqual(allarmi[0]["stato"], "limite")

    def test_valore_illeggibile(self):
        allarmi = controlla({"frazione_eiezione": "non indicato"}, INTERVALLI)
        self.assertEqual(len(allarmi), 1)
        self.assertEqual(allarmi[0]["stato"], "illeggibile")

    def test_campo_senza_intervallo_ignorato(self):
        self.assertEqual(controlla({"peso": "82 kg"}, INTERVALLI), [])

    def test_chiavi_normalizzate(self):
        allarmi = controlla({"Frequenza cardiaca": "250"}, INTERVALLI)
        self.assertEqual(len(allarmi), 1)

    def test_valore_con_virgola(self):
        self.assertEqual(controlla({"frazione_eiezione": "55,5 %"}, INTERVALLI), [])

    def test_valori_non_dict(self):
        self.assertEqual(controlla("non indicato", INTERVALLI), [])


if __name__ == "__main__":
    unittest.main()
