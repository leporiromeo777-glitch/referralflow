# Testi finti, nessun referto reale (SPEC §10).
import tempfile
import unittest
from pathlib import Path

from referti.cancellazione import cancella_intermedi, cancella_sicuro


class TestCancellazione(unittest.TestCase):
    def test_cancella_sicuro_rimuove_il_file(self):
        with tempfile.TemporaryDirectory() as cartella:
            percorso = Path(cartella) / "audio.wav"
            percorso.write_bytes(b"x" * 4096)
            cancella_sicuro(percorso)
            self.assertFalse(percorso.exists())

    def test_file_inesistente_non_esplode(self):
        cancella_sicuro(Path("/percorso/che/non/esiste.wav"))

    def test_cancella_intermedi_solo_del_file_giusto(self):
        with tempfile.TemporaryDirectory() as cartella:
            cartella = Path(cartella)
            (cartella / "abc123.pulito.wav").write_bytes(b"a")
            (cartella / "abc123.a.txt").write_text("b")
            (cartella / "def456.a.txt").write_text("c")
            cancella_intermedi(cartella, "abc123.")
            self.assertFalse((cartella / "abc123.pulito.wav").exists())
            self.assertFalse((cartella / "abc123.a.txt").exists())
            self.assertTrue((cartella / "def456.a.txt").exists())


if __name__ == "__main__":
    unittest.main()
