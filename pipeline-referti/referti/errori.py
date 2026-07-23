"""Eccezioni della pipeline. Il motivo deve restare tecnico e non clinico
(SPEC §2.2): codici di uscita, classi di errore, mai contenuto."""


class ErroreFase(Exception):
    def __init__(self, fase, motivo):
        self.fase = fase
        self.motivo = motivo
        super().__init__(f"{fase}: {motivo}")


class DiscoPieno(Exception):
    """Ferma tutto e segnala, non tentare di procedere (SPEC §7.2)."""
