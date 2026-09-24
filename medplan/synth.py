"""Gerador de dados SINTÉTICOS para a fase 0.

===============================================================================
ATENÇÃO — LEIA ANTES DE OLHAR QUALQUER NÚMERO QUE SAIA DAQUI
===============================================================================
Todas as probabilidades deste arquivo são ARBITRÁRIAS. Foram escolhidas para
exercitar o pipeline — matching, censura, intervalo de confiança, ranking — e
não representam frequência real de reação adversa nem tolerabilidade real de
nenhum medicamento. Nenhuma conclusão clínica pode sair daqui.

Os parâmetros estão numa tabela única e visível de propósito: quando houver
dado real do Mater Dei, este módulo inteiro é descartado, não ajustado.
===============================================================================

O gerador planta um confundidor de propósito. Cada perfil recebe uma
`gravidade` latente que influencia (a) qual medicamento é prescrito e (b) a
chance de descontinuar — e que **não é gravada no banco**. Isso reproduz a
situação real: medicamentos reservados para casos refratários parecem pior
tolerados, e o sistema não tem como ajustar por algo que não foi registrado.

É a forma mais direta de mostrar o viés de indicação para a médica na validação:
os números do protótipo mentem de um jeito conhecido, e dá para conferir se a
tela deixa isso claro o bastante.
"""

from __future__ import annotations

import random
import sqlite3
from datetime import date, timedelta

DATA_REFERENCIA_PADRAO = date(2026, 8, 24)

# --- Padrão de prescrição fictício --------------------------------------------
# Quais medicamentos aparecem para cada diagnóstico. É padrão de prescrição
# inventado para o protótipo, NÃO é indicação terapêutica.
CANDIDATOS_POR_DIAGNOSTICO: dict[str, tuple[str, ...]] = {
    "F32": ("sertralina", "fluoxetina", "escitalopram", "paroxetina", "venlafaxina",
            "duloxetina", "bupropiona", "mirtazapina", "amitriptilina", "nortriptilina"),
    "F33": ("sertralina", "escitalopram", "venlafaxina", "duloxetina", "bupropiona",
            "mirtazapina", "nortriptilina"),
    "F31": ("carbonato de lítio", "ácido valproico", "lamotrigina", "quetiapina",
            "olanzapina", "aripiprazol", "carbamazepina"),
    "F20": ("risperidona", "olanzapina", "quetiapina", "aripiprazol", "haloperidol",
            "clozapina"),
    "F25": ("risperidona", "olanzapina", "quetiapina", "aripiprazol", "carbonato de lítio"),
    "F40": ("escitalopram", "sertralina", "paroxetina", "venlafaxina", "clonazepam"),
    "F41": ("escitalopram", "sertralina", "paroxetina", "venlafaxina", "clonazepam",
            "fluoxetina"),
    "F42": ("fluoxetina", "sertralina", "paroxetina", "escitalopram"),
    "F43": ("sertralina", "paroxetina", "venlafaxina", "mirtazapina"),
    "F60": ("quetiapina", "lamotrigina", "sertralina", "aripiprazol"),
    "F90": ("metilfenidato", "lisdexanfetamina", "bupropiona"),
}

# --- Parâmetros arbitrários por medicamento -----------------------------------
# p_ra    : chance base de descontinuar por reação adversa até o fim do seguimento
# p_inef  : chance base de descontinuar por ineficácia
# pref_grav: o quanto o medicamento é preferido em casos graves (o confundidor)
PARAMETROS_MEDICAMENTO: dict[str, dict[str, float]] = {
    "sertralina":        {"p_ra": 0.18, "p_inef": 0.20, "pref_grav": 0.0},
    "fluoxetina":        {"p_ra": 0.20, "p_inef": 0.22, "pref_grav": 0.0},
    "escitalopram":      {"p_ra": 0.15, "p_inef": 0.20, "pref_grav": 0.0},
    "paroxetina":        {"p_ra": 0.26, "p_inef": 0.20, "pref_grav": 0.2},
    "venlafaxina":       {"p_ra": 0.28, "p_inef": 0.16, "pref_grav": 0.8},
    "duloxetina":        {"p_ra": 0.24, "p_inef": 0.18, "pref_grav": 0.6},
    "bupropiona":        {"p_ra": 0.22, "p_inef": 0.22, "pref_grav": 0.3},
    "mirtazapina":       {"p_ra": 0.30, "p_inef": 0.18, "pref_grav": 0.7},
    "amitriptilina":     {"p_ra": 0.38, "p_inef": 0.18, "pref_grav": 0.4},
    "nortriptilina":     {"p_ra": 0.34, "p_inef": 0.18, "pref_grav": 0.6},
    "quetiapina":        {"p_ra": 0.25, "p_inef": 0.18, "pref_grav": 0.5},
    "olanzapina":        {"p_ra": 0.30, "p_inef": 0.14, "pref_grav": 0.9},
    "risperidona":       {"p_ra": 0.24, "p_inef": 0.18, "pref_grav": 0.4},
    "aripiprazol":       {"p_ra": 0.20, "p_inef": 0.20, "pref_grav": 0.3},
    "clozapina":         {"p_ra": 0.35, "p_inef": 0.10, "pref_grav": 2.5},
    "haloperidol":       {"p_ra": 0.40, "p_inef": 0.16, "pref_grav": 1.6},
    "carbonato de lítio":{"p_ra": 0.26, "p_inef": 0.16, "pref_grav": 0.5},
    "ácido valproico":   {"p_ra": 0.28, "p_inef": 0.18, "pref_grav": 0.7},
    "lamotrigina":       {"p_ra": 0.18, "p_inef": 0.22, "pref_grav": 0.2},
    "carbamazepina":     {"p_ra": 0.32, "p_inef": 0.20, "pref_grav": 0.8},
    "clonazepam":        {"p_ra": 0.16, "p_inef": 0.24, "pref_grav": 0.1},
    "metilfenidato":     {"p_ra": 0.22, "p_inef": 0.20, "pref_grav": 0.2},
    "lisdexanfetamina":  {"p_ra": 0.20, "p_inef": 0.18, "pref_grav": 0.4},
}

# --- Perfis de reação adversa por classe, também arbitrários -------------------
REACOES_POR_CLASSE: dict[str, tuple[tuple[str, float], ...]] = {
    "Antidepressivo ISRS": (
        ("Náusea", 0.25), ("Disfunção sexual", 0.20), ("Insônia", 0.12),
        ("Cefaleia", 0.10), ("Sudorese", 0.08), ("Ganho de peso", 0.07),
        ("Hiponatremia", 0.02),
    ),
    "Antidepressivo IRSN": (
        ("Náusea", 0.28), ("Disfunção sexual", 0.18), ("Boca seca", 0.15),
        ("Sudorese", 0.14), ("Insônia", 0.12), ("Hipotensão ortostática", 0.06),
    ),
    "Antidepressivo IRND": (
        ("Insônia", 0.22), ("Cefaleia", 0.15), ("Boca seca", 0.12),
        ("Agitação", 0.10), ("Náusea", 0.08),
    ),
    "Antidepressivo noradrenérgico e serotoninérgico específico": (
        ("Sonolência", 0.35), ("Ganho de peso", 0.30), ("Boca seca", 0.15),
        ("Tontura", 0.10),
    ),
    "Antidepressivo tricíclico": (
        ("Boca seca", 0.40), ("Constipação", 0.28), ("Sonolência", 0.25),
        ("Hipotensão ortostática", 0.18), ("Ganho de peso", 0.15),
        ("Prolongamento do intervalo QT", 0.05),
    ),
    "Antipsicótico de segunda geração": (
        ("Ganho de peso", 0.30), ("Sonolência", 0.25), ("Dislipidemia", 0.15),
        ("Acatisia", 0.12), ("Hiperglicemia", 0.10), ("Hiperprolactinemia", 0.10),
        ("Tontura", 0.10), ("Sintomas extrapiramidais", 0.08),
    ),
    "Antipsicótico de primeira geração": (
        ("Sintomas extrapiramidais", 0.30), ("Acatisia", 0.22), ("Tremor", 0.20),
        ("Hiperprolactinemia", 0.20), ("Sonolência", 0.18), ("Discinesia tardia", 0.05),
    ),
    "Estabilizador de humor": (
        ("Tremor", 0.25), ("Ganho de peso", 0.18), ("Náusea", 0.15), ("Tontura", 0.08),
    ),
    "Anticonvulsivante estabilizador de humor": (
        ("Sonolência", 0.22), ("Tontura", 0.18), ("Ganho de peso", 0.12),
        ("Exantema", 0.10), ("Elevação de transaminases", 0.08),
        ("Síndrome de Stevens-Johnson", 0.01),
    ),
    "Benzodiazepínico": (
        ("Sonolência", 0.35), ("Tontura", 0.18), ("Cefaleia", 0.08),
    ),
    "Psicoestimulante": (
        ("Insônia", 0.28), ("Cefaleia", 0.15), ("Agitação", 0.12), ("Náusea", 0.12),
    ),
}

# Reação específica de medicamento, somada ao perfil da classe.
REACOES_ESPECIFICAS: dict[str, tuple[tuple[str, float], ...]] = {
    "clozapina": (("Agranulocitose", 0.03), ("Sonolência", 0.40)),
}

DIAGNOSTICOS = (
    ("F32.1", 0.16), ("F32.2", 0.08), ("F33.1", 0.12), ("F33.2", 0.06),
    ("F31.1", 0.05), ("F31.3", 0.06), ("F31.9", 0.04),
    ("F20.0", 0.07), ("F20.9", 0.04), ("F25.0", 0.02),
    ("F41.1", 0.12), ("F41.0", 0.05), ("F40.1", 0.03), ("F42.2", 0.03),
    ("F43.1", 0.03), ("F60.3", 0.02), ("F90.0", 0.02),
)

COMORBIDADES_CLINICAS = ("E11.9", "E66.9", "E78.5", "I10", "E03.9",
                         "G40.9", "K76.0", "N18.9")
COMORBIDADES_PSIQ = ("F41.1", "F10.2", "F17.2", "F43.1", "F60.3")

FAIXAS = (("12_17", 0.05), ("18_25", 0.18), ("26_35", 0.26),
          ("36_50", 0.27), ("51_65", 0.17), ("66_mais", 0.07))
IMCS = (("baixo_peso", 0.05), ("eutrofico", 0.38), ("sobrepeso", 0.31),
        ("obesidade_1", 0.18), ("obesidade_2_3", 0.08))


def _escolher(rng: random.Random, opcoes: tuple[tuple[str, float], ...]) -> str:
    valores = [o[0] for o in opcoes]
    pesos = [o[1] for o in opcoes]
    return rng.choices(valores, weights=pesos, k=1)[0]


def gerar(
    conn: sqlite3.Connection,
    n_perfis: int = 700,
    semente: int = 42,
    data_referencia: date = DATA_REFERENCIA_PADRAO,
) -> dict[str, int]:
    """Popula o banco com uma coorte sintética. Determinístico para uma semente."""
    rng = random.Random(semente)
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO hospital (nome, cidade, uf) VALUES (?, ?, ?)",
        ("Hospital de Demonstração (dados sintéticos)", "Belo Horizonte", "MG"),
    )
    hospital_id = cur.lastrowid

    clinico_ids = []
    for i in range(6):
        cur.execute(
            "INSERT INTO clinico (hospital_id, nome, crm, uf_crm, especialidade, papel)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (hospital_id, f"Clínico sintético {i + 1}", f"SINT{i + 1:03d}", "MG",
             "Psiquiatria", "medico"),
        )
        clinico_ids.append(cur.lastrowid)

    meds = {
        r["principio_ativo"]: (r["id"], r["classe_terapeutica"])
        for r in cur.execute("SELECT id, principio_ativo, classe_terapeutica FROM medicamento")
    }
    reacoes = {r["termo"]: r["id"] for r in cur.execute("SELECT id, termo FROM reacao_adversa")}

    contagem = {"perfis": 0, "prescricoes": 0, "desfechos": 0, "reacoes": 0}

    for i in range(n_perfis):
        dx = _escolher(rng, DIAGNOSTICOS)
        sexo = "feminino" if rng.random() < 0.58 else "masculino"
        faixa = _escolher(rng, FAIXAS)
        imc = _escolher(rng, IMCS)
        tabagismo = rng.choices(
            ["nunca", "ex_fumante", "atual", "desconhecido"], weights=[52, 18, 22, 8]
        )[0]

        # Gravidade latente: NÃO é gravada. É o confundidor.
        gravidade = rng.betavariate(2, 4)
        if dx.startswith(("F20", "F25")):
            gravidade = min(1.0, gravidade + 0.25)

        cur.execute(
            "INSERT INTO paciente_perfil "
            " (hospital_id, chave_pseudonima, sexo, faixa_etaria_cod, cid10_principal,"
            "  faixa_imc_cod, tabagismo, gestacao_lactacao) "
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (hospital_id, f"SINT-{i + 1:05d}", sexo, faixa, dx, imc, tabagismo,
             "nao" if sexo == "feminino" else "nao_aplicavel"),
        )
        perfil_id = cur.lastrowid
        contagem["perfis"] += 1

        comorbidades = set()
        for _ in range(rng.choices([0, 1, 2, 3], weights=[38, 34, 20, 8])[0]):
            if rng.random() < 0.55:
                comorbidades.add((rng.choice(COMORBIDADES_CLINICAS), "clinica"))
            else:
                cod = rng.choice(COMORBIDADES_PSIQ)
                if cod != dx:
                    comorbidades.add((cod, "psiquiatrica"))
        for cod, tipo in comorbidades:
            cur.execute(
                "INSERT INTO perfil_comorbidade "
                " (paciente_perfil_id, hospital_id, cid10_codigo, tipo) VALUES (?, ?, ?, ?)",
                (perfil_id, hospital_id, cod, tipo),
            )

        candidatos = [
            c for c in CANDIDATOS_POR_DIAGNOSTICO[dx[:3]] if c in meds
        ]
        data_atual = data_referencia - timedelta(days=rng.randint(120, 1500))
        usados: set[str] = set()

        for linha in range(1, rng.choices([1, 2, 3], weights=[55, 30, 15])[0] + 1):
            disponiveis = [c for c in candidatos if c not in usados] or candidatos
            pesos = [
                1.0 + PARAMETROS_MEDICAMENTO[c]["pref_grav"] * gravidade
                for c in disponiveis
            ]
            nome = rng.choices(disponiveis, weights=pesos, k=1)[0]
            usados.add(nome)
            med_id, classe = meds[nome]
            par = PARAMETROS_MEDICAMENTO[nome]

            if data_atual >= data_referencia:
                break

            # --- desfecho -----------------------------------------------------
            p_ra = min(0.85, par["p_ra"] * (1 + 0.6 * gravidade))
            p_inef = min(0.85, par["p_inef"] * (1 + 1.0 * gravidade))
            sorteio = rng.random()

            if sorteio < p_ra:
                status, duracao = "desc_reacao_adversa", rng.randint(5, 110)
            elif sorteio < p_ra + p_inef:
                status, duracao = "desc_ineficacia", rng.randint(45, 200)
            elif sorteio < p_ra + p_inef + 0.07:
                status, duracao = "desc_nao_adesao", rng.randint(10, 140)
            elif rng.random() < 0.30:
                status, duracao = "concluido_sucesso", rng.randint(180, 500)
            elif rng.random() < 0.18:
                status, duracao = "perdido_seguimento", rng.randint(10, 200)
            else:
                status, duracao = "em_uso", (data_referencia - data_atual).days

            dias_max = (data_referencia - data_atual).days
            duracao = max(1, min(duracao, dias_max))

            if status in ("em_uso", "perdido_seguimento"):
                data_fim = None
                ultima_obs = data_atual + timedelta(days=duracao)
            else:
                data_fim = data_atual + timedelta(days=duracao)
                ultima_obs = data_fim

            cur.execute(
                "INSERT INTO prescricao "
                " (hospital_id, paciente_perfil_id, medicamento_id, clinico_id,"
                "  data_inicio, dose_inicial, dose_manutencao, via, linha_tratamento) "
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (hospital_id, perfil_id, med_id, rng.choice(clinico_ids),
                 data_atual.isoformat(), None, None, "oral", linha),
            )
            prescricao_id = cur.lastrowid
            contagem["prescricoes"] += 1

            cur.execute(
                "INSERT INTO desfecho_tratamento "
                " (hospital_id, prescricao_id, status, data_fim, data_ultima_observacao,"
                "  efetividade_percebida, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (hospital_id, prescricao_id, status,
                 data_fim.isoformat() if data_fim else None,
                 ultima_obs.isoformat(),
                 rng.randint(1, 5), rng.choice(clinico_ids)),
            )
            desfecho_id = cur.lastrowid
            contagem["desfechos"] += 1

            # --- reações adversas ---------------------------------------------
            perfil_reacoes = dict(REACOES_POR_CLASSE.get(classe, ()))
            for termo, prob in REACOES_ESPECIFICAS.get(nome, ()):
                perfil_reacoes[termo] = prob

            causou_descontinuacao = status == "desc_reacao_adversa"
            registradas: list[str] = []
            for termo, prob in perfil_reacoes.items():
                if termo not in reacoes:
                    continue
                if rng.random() < prob * (1.4 if causou_descontinuacao else 1.0):
                    dias = rng.randint(1, max(2, duracao))
                    cur.execute(
                        "INSERT INTO desfecho_reacao "
                        " (desfecho_id, reacao_adversa_id, dias_ate_inicio,"
                        "  gravidade_observada, levou_descontinuacao) VALUES (?, ?, ?, ?, ?)",
                        (desfecho_id, reacoes[termo], dias,
                         rng.choices(["leve", "moderada", "grave"], weights=[55, 35, 10])[0],
                         0),
                    )
                    registradas.append(termo)
                    contagem["reacoes"] += 1

            # Se descontinuou por reação adversa, ao menos uma tem que estar marcada
            # como a causa — senão o dado fica internamente inconsistente.
            if causou_descontinuacao and registradas:
                cur.execute(
                    "UPDATE desfecho_reacao SET levou_descontinuacao = 1 "
                    " WHERE desfecho_id = ? AND reacao_adversa_id = ?",
                    (desfecho_id, reacoes[rng.choice(registradas)]),
                )

            data_atual = ultima_obs + timedelta(days=rng.randint(1, 30))
            if status in ("concluido_sucesso", "em_uso", "perdido_seguimento"):
                break

    conn.commit()
    return contagem
