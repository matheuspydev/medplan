"""Painéis de BI sobre o Data Mart: Visão geral, Pacientes, ficha do medicamento e Reações.

Tudo é calculado aqui, no servidor, e sai pronto para a tela: contagens, proporções com
n e IC (stats.proporcao, que omite o percentual abaixo do n mínimo) e a curva de
permanência. O front não calcula, não arredonda e não filtra estatística.

Unidades:
- atendimento: uma linha de fato_atendimento (uma consulta);
- tratamento: um paciente com um medicamento desde uma data de início. O perfil e o
  desfecho do tratamento são os do atendimento mais recente; a regra de censura é a
  mesma do motor (stats.avaliar_horizonte).

Os filtros globais valem para o atendimento (nas contagens de atendimentos) e para o
atendimento mais recente do tratamento (nos desfechos), como o grão do Data Mart pede.
"""

from __future__ import annotations

import sqlite3
import statistics
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date

from . import datamart, rotulos
from .datamart import Atendimento, ReacaoFato, Tratamento
from .stats import avaliar_horizonte, kaplan_meier, proporcao

DIAS_CURVA = 182  # 26 semanas
LINHAS = (("1", "1ª linha"), ("2", "2ª linha"), ("3+", "3ª linha ou mais"))
FAIXAS_DIAS = ((0, 7, "0 a 7 dias"), (8, 14, "8 a 14 dias"), (15, 28, "15 a 28 dias"),
               (29, 56, "29 a 56 dias"), (57, 90, "57 a 90 dias"), (91, None, "mais de 90 dias"))
GANHO_DE_PESO, PERDA_DE_PESO = "Ganho de peso", "Perda de peso"
DIVISOES = ("faixa", "sexo", "imc", "tabagismo")


def sem_acento(texto: str) -> str:
    """Busca sem acento e sem caixa: "Ansiedade" casa "ansiedade"."""
    return "".join(c for c in unicodedata.normalize("NFD", texto) if not unicodedata.combining(c)).lower()


@dataclass(frozen=True)
class Filtros:
    """Filtros globais. `diagnostico` aceita um código CID-10 ou um grupo ("F30-F39").
    `comorbidades` = quantidade; 3 quer dizer "3 ou mais"."""

    sexo: str | None = None
    faixa_etaria_cod: str | None = None
    diagnostico: str | None = None
    faixa_imc_cod: str | None = None
    tabagista: bool | None = None
    comorbidades: int | None = None

    def aceita(self, a: Atendimento, ignorar: frozenset[str] = frozenset()) -> bool:
        return (
            (self.sexo is None or "sexo" in ignorar or a.sexo == self.sexo)
            and (self.faixa_etaria_cod is None or "faixa" in ignorar or a.faixa_etaria_cod == self.faixa_etaria_cod)
            and (self.diagnostico is None or self.diagnostico in (a.cid10, a.grupo_cid))
            and (self.faixa_imc_cod is None or "imc" in ignorar or a.faixa_imc_cod == self.faixa_imc_cod)
            and (self.tabagista is None or "tabagismo" in ignorar or a.tabagista == self.tabagista)
            and (self.comorbidades is None
                 or (a.qtd_comorbidades >= 3 if self.comorbidades >= 3 else a.qtd_comorbidades == self.comorbidades))
        )

    @property
    def fixados(self) -> list[str]:
        """Divisões que um filtro já fixou: não servem para dividir (dariam uma linha só)."""
        return [d for d, valor in (("faixa", self.faixa_etaria_cod), ("sexo", self.sexo),
                                   ("imc", self.faixa_imc_cod), ("tabagismo", self.tabagista)) if valor is not None]


class Base:
    """Fatos e catálogos carregados uma vez por requisição."""

    def __init__(self, conn: sqlite3.Connection):
        self.atendimentos = datamart.ler_atendimentos(conn)
        self.reacoes = datamart.ler_reacoes(conn)
        self.tratamentos = datamart.agrupar_tratamentos(self.atendimentos)
        self.medicamentos = {r["id"]: dict(r) for r in conn.execute(
            "SELECT id, principio_ativo, codigo_atc, classe_terapeutica FROM medicamento")}
        self.termos = {r["id"]: dict(r) for r in conn.execute("SELECT id, termo, soc FROM reacao_adversa")}
        self.faixas = [dict(r) for r in conn.execute("SELECT codigo, rotulo FROM faixa_etaria ORDER BY ordem")]
        self.imcs = [dict(r) for r in conn.execute("SELECT codigo, rotulo FROM faixa_imc ORDER BY ordem")]
        self.cids = {r["codigo"]: r["descricao"] for r in conn.execute("SELECT codigo, descricao FROM cid10")}
        self._por_sk = {a.sk_atendimento: a for a in self.atendimentos}

    def tratamento_da_reacao(self, r: ReacaoFato) -> tuple[str, int, date | None]:
        return (self._por_sk[r.sk_atendimento].chave, r.medicamento_id, r.data_inicio_medicamento)

    def classe(self, medicamento_id: int) -> str:
        return self.medicamentos[medicamento_id]["classe_terapeutica"]


def _chave(t: Tratamento) -> tuple[str, int, date]:
    return (t.chave, t.medicamento_id, t.data_inicio)


def _linha(t: Tratamento) -> str | None:
    linha = t.ultimo.linha_tratamento
    if linha is None:
        return None
    return "3+" if linha >= 3 else str(linha)


def _divisao(base: Base, dividir_por: str) -> tuple[list[tuple[object, str]], callable]:
    """Linhas (valor, rótulo) e a função que lê o valor de um atendimento."""
    if dividir_por == "sexo":
        return [(c, r) for c, r in rotulos.SEXO.items()], lambda a: a.sexo
    if dividir_por == "imc":
        return [(f["codigo"], f["rotulo"]) for f in base.imcs] + [(None, datamart.IMC_NAO_INFORMADO)], lambda a: a.faixa_imc_cod
    if dividir_por == "tabagismo":
        return [(True, "Tabagista"), (False, "Não tabagista")], lambda a: a.tabagista
    return [(f["codigo"], f["rotulo"]) for f in base.faixas], lambda a: a.faixa_etaria_cod


def _motivos(eventos: dict[str, int], n: int, n_minimo: int) -> list[dict]:
    return [{"motivo": m, "rotulo": rotulo, **proporcao(eventos.get(m, 0), n, n_minimo)}
            for m, rotulo in rotulos.MOTIVO_DESCONTINUACAO.items()]


# =============================================================================
# Visão geral
# =============================================================================
def visao_geral(base: Base, filtros: Filtros, horizonte_dias: int, n_minimo: int, dividir_por: str) -> dict:
    ats = [a for a in base.atendimentos if filtros.aceita(a)]
    ids = {a.sk_atendimento for a in ats}
    trats = [t for t in base.tratamentos if filtros.aceita(t.ultimo)]
    res = avaliar_horizonte([t.episodio for t in trats], horizonte_dias)
    n_desc = sum(res.eventos_por_motivo.values())

    pacientes_por_cid: dict[str, set[str]] = defaultdict(set)
    for a in ats:
        pacientes_por_cid[a.cid10].add(a.chave)
    por_medicamento = Counter(t.medicamento_id for t in trats)

    linhas, valor_de = _divisao(base, dividir_por)
    classes = [c for c, _ in Counter(base.classe(a.medicamento_id) for a in ats).most_common()]
    matriz = []
    for valor, rotulo in linhas:
        da_linha = [a for a in base.atendimentos if valor_de(a) == valor and filtros.aceita(a, frozenset({dividir_por}))]
        contagem = Counter(base.classe(a.medicamento_id) for a in da_linha)
        matriz.append({
            "rotulo": rotulo,
            "n_atendimentos": len(da_linha),
            "celulas": [{"classe": c, **proporcao(contagem.get(c, 0), len(da_linha), n_minimo),
                         "n_atendimentos_classe": contagem.get(c, 0)} for c in classes],
        })

    ultimo_por_paciente: dict[str, Atendimento] = {}
    for a in ats:
        atual = ultimo_por_paciente.get(a.chave)
        if atual is None or (a.data, a.sk_atendimento) > (atual.data, atual.sk_atendimento):
            ultimo_por_paciente[a.chave] = a
    n_por_paciente = Counter(a.chave for a in ats)
    recentes = sorted(ultimo_por_paciente.values(), key=lambda a: (a.data, a.sk_atendimento), reverse=True)[:5]

    return {
        "horizonte_dias": horizonte_dias,
        "n_minimo": n_minimo,
        "contagens": {
            "n_pacientes": len({a.chave for a in ats}),
            "n_atendimentos": len(ats),
            "n_tratamentos": len(trats),
            "n_reacoes": sum(1 for r in base.reacoes if r.sk_atendimento in ids),
            "n_medicamentos": len({a.medicamento_id for a in ats}),
        },
        "diagnosticos": [
            {"codigo": cid, "descricao": base.cids[cid], "n_pacientes": len(chaves)}
            for cid, chaves in sorted(pacientes_por_cid.items(), key=lambda i: (-len(i[1]), i[0]))[:7]
        ],
        "medicamentos": [
            {"medicamento_id": m, "principio_ativo": base.medicamentos[m]["principio_ativo"],
             "codigo_atc": base.medicamentos[m]["codigo_atc"], "n_tratamentos": n}
            for m, n in sorted(por_medicamento.items(), key=lambda i: (-i[1], i[0]))
        ],
        "desfecho": {
            "n_tratamentos": len(trats),
            "n_avaliavel": res.n_avaliavel,
            "n_censurado": res.n_censurado,
            "mantido": proporcao(res.n_retidos, res.n_avaliavel, n_minimo),
            "descontinuado": proporcao(n_desc, res.n_avaliavel, n_minimo),
        },
        # denominador: os tratamentos descontinuados
        "motivos": _motivos(res.eventos_por_motivo, n_desc, n_minimo),
        "classe_por_grupo": {"dividir_por": dividir_por, "fixados_por_filtro": filtros.fixados,
                             "classes": classes, "linhas": matriz},
        "recentes": [
            {"chave_pseudonima": a.chave, "sexo": a.sexo, "faixa_etaria_cod": a.faixa_etaria_cod,
             "cid10": a.cid10, "descricao_cid": base.cids[a.cid10], "n_atendimentos": n_por_paciente[a.chave],
             "ultimo_atendimento": a.data.isoformat()}
            for a in recentes
        ],
    }


# =============================================================================
# Pacientes
# =============================================================================
def pacientes(base: Base, q: str | None, sexo: str | None, faixa_etaria_cod: str | None, grupo: str | None,
              pagina: int, por_pagina: int) -> dict:
    por_paciente: dict[str, list[Atendimento]] = defaultdict(list)
    for a in base.atendimentos:
        por_paciente[a.chave].append(a)

    itens = []
    busca = sem_acento(q.strip()) if q else ""
    for chave, ats in por_paciente.items():
        ultimo = max(ats, key=lambda a: (a.data, a.sk_atendimento))
        if sexo and ultimo.sexo != sexo or faixa_etaria_cod and ultimo.faixa_etaria_cod != faixa_etaria_cod:
            continue
        if grupo and ultimo.grupo_cid != grupo:
            continue
        texto = sem_acento(f"{chave} {ultimo.cid10} {ultimo.cid10.replace('.', '')} {base.cids[ultimo.cid10]}")
        if busca and busca not in texto:
            continue
        itens.append({
            "chave_pseudonima": chave, "sexo": ultimo.sexo, "faixa_etaria_cod": ultimo.faixa_etaria_cod,
            "cid10": ultimo.cid10, "descricao_cid": base.cids[ultimo.cid10],
            "medicamento_atual": base.medicamentos[ultimo.medicamento_id]["principio_ativo"],
            "n_atendimentos": len(ats), "ultimo_atendimento": ultimo.data.isoformat(),
        })
    itens.sort(key=lambda i: (i["ultimo_atendimento"], i["chave_pseudonima"]), reverse=True)
    inicio = (pagina - 1) * por_pagina
    return {"total": len(itens), "pagina": pagina, "por_pagina": por_pagina, "itens": itens[inicio:inicio + por_pagina]}


def paciente(base: Base, chave: str) -> dict | None:
    ats = sorted((a for a in base.atendimentos if a.chave == chave), key=lambda a: (a.data, a.sk_atendimento), reverse=True)
    if not ats:
        return None
    ids = {a.sk_atendimento for a in ats}
    reacoes_por_at: dict[int, list[dict]] = defaultdict(list)
    for r in base.reacoes:
        if r.sk_atendimento in ids:
            reacoes_por_at[r.sk_atendimento].append({
                "reacao_adversa_id": r.reacao_adversa_id, "termo": base.termos[r.reacao_adversa_id]["termo"],
                "soc": base.termos[r.reacao_adversa_id]["soc"], "medicamento_id": r.medicamento_id,
                "principio_ativo": base.medicamentos[r.medicamento_id]["principio_ativo"],
                "data_inicio_reacao": r.data_inicio_reacao.isoformat() if r.data_inicio_reacao else None,
                "dias_ate_reacao": r.dias_ate_reacao, "gravidade_observada": r.gravidade,
                "levou_descontinuacao": r.levou_descontinuacao,
            })
    trats = sorted((t for t in base.tratamentos if t.chave == chave), key=lambda t: t.data_inicio)
    return {
        "chave_pseudonima": chave,
        "sexo": ats[0].sexo,
        "primeiro_atendimento": ats[-1].data.isoformat(),
        "ultimo_atendimento": ats[0].data.isoformat(),
        "atendimentos": [{
            "sk_atendimento": a.sk_atendimento, "data": a.data.isoformat(), "faixa_etaria_cod": a.faixa_etaria_cod,
            "faixa_imc_cod": a.faixa_imc_cod, "tabagista": a.tabagista, "qtd_comorbidades": a.qtd_comorbidades,
            "cid10": a.cid10, "medicamento_id": a.medicamento_id,
            "principio_ativo": base.medicamentos[a.medicamento_id]["principio_ativo"],
            "linha_tratamento": a.linha_tratamento, "status": a.status, "dias_observados": a.dias_observados,
            "reacoes": reacoes_por_at[a.sk_atendimento],
        } for a in ats],
        "tratamentos": [{
            "medicamento_id": t.medicamento_id, "principio_ativo": base.medicamentos[t.medicamento_id]["principio_ativo"],
            "linha_tratamento": t.ultimo.linha_tratamento, "data_inicio": t.data_inicio.isoformat(),
            "data_ultima_observacao": t.ultimo.data.isoformat(), "status": t.ultimo.status,
            "encerrado": t.episodio.data_fim is not None, "n_atendimentos": len(t.atendimentos),
        } for t in trats],
    }


# =============================================================================
# Ficha do medicamento
# =============================================================================
def ficha_medicamento(base: Base, medicamento_id: int, filtros: Filtros, horizonte_dias: int, n_minimo: int) -> dict:
    trats = [t for t in base.tratamentos if t.medicamento_id == medicamento_id and filtros.aceita(t.ultimo)]
    episodios = [t.episodio for t in trats]
    res = avaliar_horizonte(episodios, horizonte_dias)
    n_desc = sum(res.eventos_por_motivo.values())

    curva = None
    if len(trats) >= n_minimo:
        pontos, censuras = kaplan_meier(episodios, DIAS_CURVA)
        curva = {"ate_dias": DIAS_CURVA, "dias_censura": censuras, "pontos": [
            {"dia": p.dia, "sobrevida": p.sobrevida, "ic_inferior": p.ic[0], "ic_superior": p.ic[1], "n_em_risco": p.n_em_risco}
            for p in pontos]}

    recebem = Counter((t.ultimo.faixa_etaria_cod, t.ultimo.sexo) for t in trats)
    chaves = {_chave(t) for t in trats}
    com_reacao: dict[int, set] = defaultdict(set)
    for r in base.reacoes:
        tratamento = base.tratamento_da_reacao(r)
        if r.medicamento_id == medicamento_id and tratamento in chaves:
            com_reacao[r.reacao_adversa_id].add(tratamento)
    reacoes = sorted(com_reacao.items(), key=lambda i: (-len(i[1]), i[0]))[:6]

    por_linha = []
    for codigo, rotulo in LINHAS:
        do_grupo = [t.episodio for t in trats if _linha(t) == codigo]
        r_linha = avaliar_horizonte(do_grupo, horizonte_dias)
        por_linha.append({"linha": codigo, "rotulo": rotulo, "n_tratamentos": len(do_grupo),
                          "permanencia": proporcao(r_linha.n_retidos, r_linha.n_avaliavel, n_minimo)})

    return {
        "medicamento": base.medicamentos[medicamento_id],
        "horizonte_dias": horizonte_dias,
        "n_minimo": n_minimo,
        "contabilidade": {"n_tratamentos": len(trats), "n_avaliavel": res.n_avaliavel, "n_retidos": res.n_retidos,
                          "n_descontinuados": n_desc, "n_censurado": res.n_censurado},
        "permanencia": proporcao(res.n_retidos, res.n_avaliavel, n_minimo),
        "descontinuacao_por_motivo": _motivos(res.eventos_por_motivo, res.n_avaliavel, n_minimo),
        "curva": curva,
        "recebem": {"sexos": [{"codigo": c, "rotulo": r} for c, r in rotulos.SEXO.items()],
                    "linhas": [{"faixa_etaria_cod": f["codigo"], "rotulo": f["rotulo"],
                                "n_por_sexo": [recebem.get((f["codigo"], s), 0) for s in rotulos.SEXO]}
                               for f in base.faixas]},
        # denominador: todos os tratamentos do medicamento no recorte (inclusive censurados), como no motor
        "reacoes": [{"reacao_adversa_id": rid, "termo": base.termos[rid]["termo"], "soc": base.termos[rid]["soc"],
                     **proporcao(len(ts), len(trats), n_minimo)}
                    for rid, ts in reacoes],
        "por_linha": por_linha,
    }


# =============================================================================
# Reações adversas
# =============================================================================
def reacoes_resumo(base: Base, filtros: Filtros, medicamento_id: int | None, linha: str | None, n_minimo: int) -> dict:
    def entra(t: Tratamento, com_medicamento: bool = True) -> bool:
        return (filtros.aceita(t.ultimo) and (linha is None or _linha(t) == linha)
                and (not com_medicamento or medicamento_id is None or t.medicamento_id == medicamento_id))

    trats = {_chave(t): t for t in base.tratamentos if entra(t)}
    reacoes = [r for r in base.reacoes if base.tratamento_da_reacao(r) in trats]
    n_reac = len(reacoes)
    com_alguma = {base.tratamento_da_reacao(r) for r in reacoes}
    dias = sorted(r.dias_ate_reacao for r in reacoes if r.dias_ate_reacao is not None)

    por_soc: dict[str, Counter] = defaultdict(Counter)
    for r in reacoes:
        termo = base.termos[r.reacao_adversa_id]
        por_soc[termo["soc"]][termo["termo"]] += 1
    gravidade = Counter(r.gravidade for r in reacoes)
    levou = Counter(r.gravidade for r in reacoes if r.levou_descontinuacao)

    # cruzamento reação × medicamento: todos os medicamentos do recorte (o filtro de medicamento não se aplica)
    trats_cruz = [t for t in base.tratamentos if entra(t, com_medicamento=False)]
    chaves_cruz = {_chave(t) for t in trats_cruz}
    por_med = Counter(t.medicamento_id for t in trats_cruz)
    medicamentos = [m for m, _ in por_med.most_common(6)]
    tratamentos_com: dict[tuple[int, int], set] = defaultdict(set)
    for r in base.reacoes:
        tratamento = base.tratamento_da_reacao(r)
        if tratamento in chaves_cruz:
            tratamentos_com[(r.reacao_adversa_id, r.medicamento_id)].add(tratamento)
    por_termo: Counter = Counter()
    for (rid, _m), ts in tratamentos_com.items():
        por_termo[rid] += len(ts)
    termos = [rid for rid, _ in por_termo.most_common(8)]

    return {
        "n_minimo": n_minimo,
        "contagens": {
            "n_reacoes": n_reac,
            "n_tratamentos": len(trats),
            "tratamentos_com_reacao": proporcao(len(com_alguma), len(trats), n_minimo),
            "levaram_descontinuacao": proporcao(sum(levou.values()), n_reac, n_minimo),
            "dias_ate_inicio": {"n": len(dias), "mediana": statistics.median(dias) if dias else None,
                                "q1": statistics.quantiles(dias, n=4)[0] if len(dias) >= 2 else None,
                                "q3": statistics.quantiles(dias, n=4)[2] if len(dias) >= 2 else None},
        },
        "por_soc": [{"soc": soc, "n": sum(c.values()),
                     "termos": [{"termo": t, "n": n} for t, n in c.most_common()]}
                    for soc, c in sorted(por_soc.items(), key=lambda i: -sum(i[1].values()))],
        "gravidade": [{"gravidade": g, "rotulo": rotulos.GRAVIDADE[g], **proporcao(gravidade.get(g, 0), n_reac, n_minimo)}
                      for g in rotulos.GRAVIDADE],
        "descontinuacao_por_gravidade": [
            {"gravidade": g, "rotulo": rotulos.GRAVIDADE[g], **proporcao(levou.get(g, 0), gravidade.get(g, 0), n_minimo)}
            for g in rotulos.GRAVIDADE],
        "dias_por_faixa": [{"rotulo": rotulo, "n": sum(1 for d in dias if d >= ini and (fim is None or d <= fim))}
                           for ini, fim, rotulo in FAIXAS_DIAS],
        "reacao_x_medicamento": {
            "medicamentos": [{"medicamento_id": m, "principio_ativo": base.medicamentos[m]["principio_ativo"],
                              "n_tratamentos": por_med[m]} for m in medicamentos],
            "linhas": [{"reacao_adversa_id": rid, "termo": base.termos[rid]["termo"], "celulas": [
                {"medicamento_id": m, "n_tratamentos_com_reacao": len(tratamentos_com[(rid, m)]),
                 **proporcao(len(tratamentos_com[(rid, m)]), por_med[m], n_minimo)}
                for m in medicamentos]} for rid in termos],
        },
    }


def peso_por_imc(base: Base, medicamento_id: int, filtros: Filtros, n_minimo: int, ids_termo: dict[str, int]) -> dict:
    """Ganho e perda de peso por faixa de IMC no início do tratamento, para um medicamento."""
    trats = [t for t in base.tratamentos
             if t.medicamento_id == medicamento_id and filtros.aceita(t.ultimo, frozenset({"imc"}))]
    com: dict[str, set] = defaultdict(set)
    for r in base.reacoes:
        for nome in (GANHO_DE_PESO, PERDA_DE_PESO):
            if r.reacao_adversa_id == ids_termo.get(nome) and r.medicamento_id == medicamento_id:
                com[nome].add(base.tratamento_da_reacao(r))

    def inicial(t: Tratamento) -> str | None:
        return min(t.atendimentos, key=lambda a: (a.data, a.sk_atendimento)).faixa_imc_cod

    linhas = []
    for codigo, rotulo in [(f["codigo"], f["rotulo"]) for f in base.imcs] + [(None, datamart.IMC_NAO_INFORMADO)]:
        do_grupo = [_chave(t) for t in trats if inicial(t) == codigo]
        linhas.append({"faixa_imc_cod": codigo, "rotulo": rotulo, "n_tratamentos": len(do_grupo),
                       "ganho_de_peso": proporcao(sum(1 for c in do_grupo if c in com[GANHO_DE_PESO]), len(do_grupo), n_minimo),
                       "perda_de_peso": proporcao(sum(1 for c in do_grupo if c in com[PERDA_DE_PESO]), len(do_grupo), n_minimo)})
    return {"medicamento": base.medicamentos[medicamento_id], "n_minimo": n_minimo, "linhas": linhas}


# =============================================================================
# Frequência de prescrição na coorte da Consulta
# =============================================================================
def frequencia_prescricao(base: Base, chaves: set[str], n_minimo: int) -> dict:
    """O que costuma ser prescrito para o perfil: proporção dos atendimentos da coorte por classe e medicamento."""
    ats = [a for a in base.atendimentos if a.chave in chaves]
    n = len(ats)
    por_classe = Counter(base.classe(a.medicamento_id) for a in ats)
    por_med = Counter(a.medicamento_id for a in ats)
    return {
        "n_atendimentos": n,
        "n_pacientes": len({a.chave for a in ats}),
        "classes": [{"classe_terapeutica": c, **proporcao(k, n, n_minimo)} for c, k in por_classe.most_common()],
        "medicamentos": [{"medicamento_id": m, "principio_ativo": base.medicamentos[m]["principio_ativo"],
                          "classe_terapeutica": base.classe(m), **proporcao(k, n, n_minimo)}
                         for m, k in por_med.most_common(8)],
    }
