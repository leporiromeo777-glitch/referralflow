"""Il solver delle sale: OR-Tools CP-SAT (16.9.2026, Piattaforma/Orchestrazione sale §5-6).

Riceve un JSON con le visite dell'orizzonte, le stanze, i medici, gli
assistenti, le distanze e i pesi; restituisce uno o più piani. Nessun accesso
al database, nessun testo clinico: pazienti come id, prestazioni come nomi,
minuti e stanze. Tutti i tempi sono minuti dalla mezzanotte.

Vincoli duri (o sono rispettati o non c'è piano):
- un medico in una stanza sola alla volta, con lo spostamento fra due stanze;
- in una stanza un solo medico alla volta; lo stesso medico fino ai posti;
- stanza compatibile (il dominio arriva già filtrato dal grafo);
- apparecchio in un uso solo alla volta; assistente in una preparazione sola;
- il paziente non comincia prima di adesso, dell'ora teorica se non è
  arrivato, dell'arrivo se è arrivato;
- i congelati: stanza fissa (rigidità ≥ 2), stanza e ora fisse (rigidità 3).

Obiettivo: la somma pesata del §6, con i pesi che arrivano nella richiesta.
"""
from __future__ import annotations

import time
from ortools.sat.python import cp_model

FINE_GIORNATA = 22 * 60


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def risolvi(r: dict) -> dict:
    t0 = time.time()
    adesso = int(r.get("adesso", 0))
    anticipo = int(r.get("anticipo", 8))
    pausa = int(r.get("pausa_stessa_stanza", 10))
    pesi = r.get("pesi", {})
    limite_ms = int(r.get("limite_ms", 2000))
    quanti = max(1, int(r.get("quanti_piani", 1)))
    visite = [v for v in r.get("visite", []) if v.get("stato") not in ("dimesso", "assente", "annullato")]
    stanze = {s["nome"]: s for s in r.get("stanze", [])}
    medici = {m["nome"]: m for m in r.get("medici", [])}
    assistenti = {a["nome"]: a for a in r.get("assistenti", [])}
    apparecchi = {a["nome"]: a for a in r.get("apparecchi", [])}
    distanze = r.get("distanze", {})
    dist_default = int(r.get("distanza_default", 60))

    def dist_min(a: str, b: str) -> int:
        if _norm(a) == _norm(b):
            return 0
        s = distanze.get(f"{a}|{b}", distanze.get(f"{b}|{a}", dist_default))
        return (int(s) + 59) // 60

    m = cp_model.CpModel()
    senza_sala = []
    piani_visite = []   # (visita, start, sala_vars{nome: bool}, prima, fine_stanza, assist_vars, ingresso_expr)

    for v in visite:
        cand = [v["sala_fissa"]] if v.get("sala_fissa") else list(v.get("sale_possibili", []))
        cand = [c for c in cand if c in stanze]
        if not cand:
            senza_sala.append({"id": v["id"], "perche": "nessuna stanza compatibile"})
            continue
        durata = max(5, int(v.get("durata", 20)))
        prep = int(v.get("prep", 0))
        ripr = int(v.get("ripristino", 0))
        rig = int(v.get("rigidita", 0))
        prima = prep if rig >= 3 else max(prep, anticipo)
        arrivo = v.get("arrivo")
        arrivato = arrivo is not None and int(arrivo) <= adesso
        if v.get("inizio_fisso") is not None:
            lb = ub = int(v["inizio_fisso"])
        else:
            lb = max(adesso, min(int(v["teorica"]), int(arrivo)) if arrivato else int(v["teorica"]), int(arrivo) if arrivo is not None else 0)
            ub = min(FINE_GIORNATA, int(v["teorica"]) + 240)
            if ub < lb:
                ub = lb
        start = m.NewIntVar(lb, ub, f"s_{v['id']}")
        sala_vars = {}
        room_intervals = {}
        for c in cand:
            b = m.NewBoolVar(f"r_{v['id']}_{c}")
            sala_vars[c] = b
            room_intervals[c] = m.NewOptionalIntervalVar(start - prima, prima + durata + ripr, start + durata + ripr, b, f"ri_{v['id']}_{c}")
        m.AddExactlyOne(sala_vars.values())
        assist_vars = {}
        if prep > 0 and v.get("assistenti"):
            for a in v["assistenti"]:
                if a not in assistenti:
                    continue
                b = m.NewBoolVar(f"a_{v['id']}_{a}")
                assist_vars[a] = (b, m.NewOptionalIntervalVar(start - prep, prep, start, b, f"ai_{v['id']}_{a}"))
            if assist_vars:
                m.AddExactlyOne(b for b, _ in assist_vars.values())
        piani_visite.append({"v": v, "start": start, "sale": sala_vars, "ri": room_intervals, "durata": durata, "prep": prep, "prima": prima,
                             "ripr": ripr, "assist": assist_vars, "rig": rig, "arrivato": arrivato})

    # Stanze: capienza (posti) e blocchi; e MAI due medici diversi insieme.
    for nome, s in stanze.items():
        ivs, dem = [], []
        for pv in piani_visite:
            if nome in pv["ri"]:
                ivs.append(pv["ri"][nome]); dem.append(1)
        for (da, a) in s.get("bloccata", []):
            if a > da:
                ivs.append(m.NewIntervalVar(int(da), int(a) - int(da), int(a), f"bl_{nome}_{da}")); dem.append(int(s.get("posti", 1)))
        if ivs:
            m.AddCumulative(ivs, dem, max(1, int(s.get("posti", 1))))
    for i in range(len(piani_visite)):
        for j in range(i + 1, len(piani_visite)):
            a, b = piani_visite[i], piani_visite[j]
            if a["v"].get("senza_medico") or b["v"].get("senza_medico") or _norm(a["v"]["medico"]) == _norm(b["v"]["medico"]):
                continue
            for nome in set(a["sale"]) & set(b["sale"]):
                # stessa stanza → non si sovrappongono (finestre di stanza)
                both = m.NewBoolVar(f"both_{i}_{j}_{nome}")
                m.AddBoolAnd([a["sale"][nome], b["sale"][nome]]).OnlyEnforceIf(both)
                m.AddBoolOr([a["sale"][nome].Not(), b["sale"][nome].Not()]).OnlyEnforceIf(both.Not())
                ab = m.NewBoolVar(f"ab_{i}_{j}_{nome}")
                m.Add(b["start"] - b["prima"] >= a["start"] + a["durata"] + a["ripr"]).OnlyEnforceIf([both, ab])
                m.Add(a["start"] - a["prima"] >= b["start"] + b["durata"] + b["ripr"]).OnlyEnforceIf([both, ab.Not()])

    # Medici: una visita alla volta, con lo spostamento se cambia stanza.
    per_medico: dict[str, list] = {}
    for pv in piani_visite:
        if pv["v"].get("senza_medico"):
            continue
        per_medico.setdefault(_norm(pv["v"]["medico"]), []).append(pv)
    diff_vars = []   # per lo spostamento
    for nome, lista in per_medico.items():
        md = next((x for k, x in medici.items() if _norm(k) == nome), None)
        libero_da = int(md["libero_da"]) if md else adesso
        in_sala = md.get("in_sala") if md else None
        for pv in lista:
            if pv["v"].get("inizio_fisso") is None:
                # arriva dalla stanza dov'è adesso
                for c, b in pv["sale"].items():
                    m.Add(pv["start"] >= libero_da + dist_min(in_sala or c, c)).OnlyEnforceIf(b)
        for i in range(len(lista)):
            for j in range(i + 1, len(lista)):
                a, b = lista[i], lista[j]
                diff = m.NewBoolVar(f"diff_{a['v']['id']}_{b['v']['id']}")
                # diff = stanze diverse
                same_lits = []
                for c in set(a["sale"]) & set(b["sale"]):
                    s2 = m.NewBoolVar(f"same_{a['v']['id']}_{b['v']['id']}_{c}")
                    m.AddBoolAnd([a["sale"][c], b["sale"][c]]).OnlyEnforceIf(s2)
                    m.AddBoolOr([a["sale"][c].Not(), b["sale"][c].Not()]).OnlyEnforceIf(s2.Not())
                    same_lits.append(s2)
                if same_lits:
                    m.AddBoolOr(same_lits).OnlyEnforceIf(diff.Not())
                    m.AddBoolAnd([x.Not() for x in same_lits]).OnlyEnforceIf(diff)
                else:
                    m.Add(diff == 1)
                t = (dist_default + 59) // 60
                ab = m.NewBoolVar(f"ord_{a['v']['id']}_{b['v']['id']}")
                m.Add(b["start"] >= a["start"] + a["durata"] + t * diff).OnlyEnforceIf(ab)
                m.Add(a["start"] >= b["start"] + b["durata"] + t * diff).OnlyEnforceIf(ab.Not())
                # Stessa stanza, uno dopo l'altro: solo con la pausa in mezzo
                # (16.9.2026). Chi ha una stanza sola per regola è esente.
                if pausa > 0 and not a["v"].get("stessa_stanza_libera"):
                    m.Add(b["start"] >= a["start"] + a["durata"] + pausa).OnlyEnforceIf([ab, diff.Not()])
                    m.Add(a["start"] >= b["start"] + b["durata"] + pausa).OnlyEnforceIf([ab.Not(), diff.Not()])
                diff_vars.append(diff)

    # Assistenti: una preparazione alla volta.
    for a_nome, a in assistenti.items():
        ivs = [pv["assist"][a_nome][1] for pv in piani_visite if a_nome in pv["assist"]]
        if int(a.get("libero_da", 0)) > 0:
            ivs.append(m.NewIntervalVar(0, int(a["libero_da"]), int(a["libero_da"]), f"abl_{a_nome}"))
        if len(ivs) > 1:
            m.AddNoOverlap(ivs)

    # Apparecchi: un uso alla volta.
    for ap_nome, ap in apparecchi.items():
        ivs = []
        for pv in piani_visite:
            if ap_nome in pv["v"].get("apparecchi", []):
                ivs.append(m.NewIntervalVar(pv["start"] - pv["prima"], pv["prima"] + pv["durata"] + pv["ripr"], pv["start"] + pv["durata"] + pv["ripr"], f"api_{pv['v']['id']}_{ap_nome}"))
        for (da, a2) in ap.get("bloccato", []):
            if a2 > da:
                ivs.append(m.NewIntervalVar(int(da), int(a2) - int(da), int(a2), f"apbl_{ap_nome}_{da}"))
        if len(ivs) > 1:
            m.AddNoOverlap(ivs)

    # Obiettivo.
    termini = {"attesa": [], "ritardo": [], "modifica": [], "stanza_inutile": [], "uso": [], "propagazione": []}
    for pv in piani_visite:
        v = pv["v"]
        rif = max(int(v["teorica"]), int(v["arrivo"])) if pv["arrivato"] else int(v["teorica"])
        att = m.NewIntVar(0, FINE_GIORNATA, f"att_{v['id']}")
        m.Add(att >= pv["start"] - rif)
        termini["attesa"].append(att)
        rit = m.NewIntVar(0, FINE_GIORNATA, f"rit_{v['id']}")
        m.Add(rit >= pv["start"] - int(v["teorica"]))
        termini["ritardo"].append(rit)
        com = v.get("comunicato")
        if com:
            d = m.NewIntVar(0, FINE_GIORNATA, f"mod_{v['id']}")
            ingr = pv["start"] - pv["prima"]
            m.Add(d >= ingr - int(com["ingresso"]))
            m.Add(d >= int(com["ingresso"]) - ingr)
            termini["modifica"].append(d)
            if com.get("sala") in pv["sale"]:
                termini["modifica"].append(int(pesi.get("modifica_stanza", 15)) * (1 - pv["sale"][com["sala"]]))
            else:
                termini["modifica"].append(int(pesi.get("modifica_stanza", 15)))
        pref = v.get("sala_preferita")
        if pref and pref in pv["sale"]:
            termini["uso"].append(1 - pv["sale"][pref])
        # Le stanze «ultime» (le sale dello sport) si aprono solo se serve:
        # ogni visita messa lì paga come una stanza non preferita.
        for c, b in pv["sale"].items():
            if stanze[c].get("ultima"):
                termini["uso"].append(b)
    for nome, lista in per_medico.items():
        mx = m.NewIntVar(0, FINE_GIORNATA, f"prop_{nome}")
        for pv in lista:
            m.Add(mx >= pv["start"] - int(pv["v"]["teorica"]))
        termini["propagazione"].append(mx)
    obiettivo = (
        int(pesi.get("attesa", 100)) * sum(termini["attesa"])
        + int(pesi.get("ritardo", 80)) * sum(termini["ritardo"])
        + int(pesi.get("modifica", 30)) * sum(termini["modifica"])
        + int(pesi.get("spostamento", 10)) * sum(diff_vars)
        + int(pesi.get("uso", 5)) * sum(termini["uso"])
        + int(pesi.get("propagazione", 40)) * sum(termini["propagazione"])
    )
    m.Minimize(obiettivo)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.2, limite_ms / 1000.0)
    solver.parameters.num_workers = 8

    class Raccogli(cp_model.CpSolverSolutionCallback):
        def __init__(self):
            super().__init__()
            self.soluzioni = []

        def on_solution_callback(self):
            self.soluzioni.append((self.ObjectiveValue(), {pv["v"]["id"]: (self.Value(pv["start"]), next(c for c, b in pv["sale"].items() if self.Value(b)),
                                                                            next((a for a, (b, _) in pv["assist"].items() if self.Value(b)), None)) for pv in piani_visite}))

    racc = Raccogli()
    stato = solver.Solve(m, racc)
    nome_stato = {cp_model.OPTIMAL: "OTTIMO", cp_model.FEASIBLE: "FATTIBILE", cp_model.INFEASIBLE: "NESSUNA_SOLUZIONE", cp_model.MODEL_INVALID: "MODELLO_NON_VALIDO", cp_model.UNKNOWN: "TEMPO"}.get(stato, "TEMPO")
    ms = int((time.time() - t0) * 1000)
    if stato not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"stato": nome_stato, "ms": ms, "piani": [], "senza_sala": senza_sala}

    def piano_da(sol):
        costo, val = sol
        visite_out = []
        seq: dict[str, list] = {}
        for pv in piani_visite:
            s, sala, ass = val[pv["v"]["id"]]
            visite_out.append({"id": pv["v"]["id"], "sala": sala, "ingresso": s - pv["prima"], "inizio": s, "fine": s + pv["durata"], "assistente": ass})
            if not pv["v"].get("senza_medico"):
                seq.setdefault(pv["v"]["medico"], []).append({"id": pv["v"]["id"], "sala": sala, "inizio": s, "fine": s + pv["durata"]})
        for k in seq:
            seq[k].sort(key=lambda x: x["inizio"])
        return {"costo": costo, "visite": visite_out, "sequenze": seq}

    migliore = min(racc.soluzioni, key=lambda x: x[0])
    piani = [piano_da(migliore)]
    if quanti > 1:
        visti = {tuple(sorted((k, v[1], v[0]) for k, v in migliore[1].items()))}
        for sol in sorted(racc.soluzioni, key=lambda x: x[0]):
            if len(piani) >= quanti:
                break
            if sol[0] > migliore[0] * 1.02 + 1:
                break
            chiave = tuple(sorted((k, v[1], v[0]) for k, v in sol[1].items()))
            if chiave in visti:
                continue
            visti.add(chiave)
            piani.append(piano_da(sol))
    return {"stato": nome_stato, "ms": ms, "costo": migliore[0], "piani": piani, "senza_sala": senza_sala}
