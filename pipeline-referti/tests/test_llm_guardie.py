# Testi finti, nessun referto reale (SPEC §10).
# Test delle guardie e dei parser: nessuna chiamata di rete.
import unittest
from unittest import mock

from referti import llm, prompts


class TestGuardiaNumerica(unittest.TestCase):
    def test_impronta_uguale_con_virgola_e_punto(self):
        self.assertEqual(
            llm._impronta_numerica("valore 5,5 e 120"),
            llm._impronta_numerica("valore 5.5 e 120"),
        )

    def test_correzione_che_cambia_numero_viene_scartata(self):
        originale = "frequenza centoventi, pressione 130 su 80"
        with mock.patch.object(llm, "_chiama", return_value="frequenza 120, pressione 130 su 80"):
            testo, nota = llm.correggi(originale)
        self.assertEqual(testo, originale)
        self.assertIsNotNone(nota)

    def test_correzione_lecita_accettata(self):
        with mock.patch.object(llm, "_chiama", return_value="ecocardiogramma con FE 55"):
            testo, nota = llm.correggi("eco cardio gramma con FE 55")
        self.assertEqual(testo, "ecocardiogramma con FE 55")
        self.assertIsNone(nota)

    def test_correzione_vuota_mantiene_testo(self):
        with mock.patch.object(llm, "_chiama", return_value="   "):
            testo, nota = llm.correggi("testo di prova")
        self.assertEqual(testo, "testo di prova")
        self.assertIsNotNone(nota)


class TestParserIspezione(unittest.TestCase):
    def test_nessuno(self):
        with mock.patch.object(llm, "_chiama", return_value="nessuno"):
            self.assertEqual(llm.ispeziona("testo"), [])

    def test_elenco_puntato(self):
        risposta = "- segmento uno\n* segmento due\n• segmento tre"
        with mock.patch.object(llm, "_chiama", return_value=risposta):
            self.assertEqual(
                llm.ispeziona("testo"),
                ["segmento uno", "segmento due", "segmento tre"],
            )


class TestPromptVerbatim(unittest.TestCase):
    # I prompt della SPEC §6 non vanno modificati: qualche ancora testuale
    # per accorgersi di una modifica accidentale.
    def test_ancore(self):
        self.assertIn("anche se un numero ti sembra implausibile, lascialo com'è",
                      prompts.PROMPT_CORREZIONE)
        self.assertIn("Se non ce ne sono, scrivi esattamente: nessuno",
                      prompts.PROMPT_ISPEZIONE)
        self.assertIn('il valore deve essere esattamente: "non indicato"',
                      prompts.PROMPT_ESTRAZIONE)
        for p in (prompts.PROMPT_CORREZIONE, prompts.PROMPT_ISPEZIONE,
                  prompts.PROMPT_ESTRAZIONE):
            self.assertIn("{testo}", p)


if __name__ == "__main__":
    unittest.main()
