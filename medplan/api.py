"""API HTTP da fase 0, sobre o motor existente.

    python -m uvicorn medplan.api:app --port 8000

Não recalcula nada que o motor já calcula: ordem, coorte, censura e taxas vêm
de engine.recomendar e engine.diagnosticar_escada. Esta camada só serializa,
acrescenta o IC que faltava por motivo de descontinuação e arredonda os
percentuais com o critério do Python, para o front nunca arredondar.

Nenhum corpo de requisição é registrado em log.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import Field

from . import atendimento, carga, catalogo, db, engine, paineis, rotulos
from . import matching
from .matching import Nivel, PerfilAlvo, construir_consulta, niveis_para
from .registro import (
    FILTRO_DIAGNOSTICO,
    HOSPITAL_ID,
    CasoEntrada,
    Entrada,
    ErroValidacao,
    clinico_atual,
    iso_utc,
    registrar,
    validar,
    validar_perfil,
)
from .stats import HORIZONTE_PADRAO_DIAS, ResultadoHorizonte, com_ic, ic_wilson

WEB_DIST = db.RAIZ / "web" / "dist"

# O banco do protótipo (SQLite) só roda com dados sintéticos — ver db/sqlite/schema.sql.
DADOS_SINTETICOS = True

HORIZONTE_MIN_DIAS, HORIZONTE_MAX_DIAS = 28, 180
N_MINIMO_MIN, N_MINIMO_MAX = 5, 100

# Mensagens pt-BR por tipo de erro do pydantic. Só interpolam limites definidos
# no próprio modelo (ge, le, min_length...), nunca o valor recebido.
MENSAGENS = {
    "missing": "Campo obrigatório.",
    "extra_forbidden": "Campo não previsto. Esta API não aceita identificadores do "
                       "paciente nem texto livre.",
    "literal_error": "Valor fora das opções permitidas.",
    "string_type": "Informe um valor de texto.",
    "int_type": "Informe um número inteiro.",
    "int_parsing": "Informe um número inteiro.",
    "int_from_float": "Informe um número inteiro.",
    "float_type": "Informe um número.",
    "float_parsing": "Informe um número.",
    "finite_number": "Informe um número finito.",
    "bool_type": "Informe verdadeiro ou falso.",
    "bool_parsing": "Informe verdadeiro ou falso.",
    "date_type": "Informe uma data válida no formato AAAA-MM-DD.",
    "date_parsing": "Informe uma data válida no formato AAAA-MM-DD.",
    "date_from_datetime_parsing": "Informe uma data válida no formato AAAA-MM-DD.",
    "date_from_datetime_inexact": "Informe uma data válida no formato AAAA-MM-DD.",
    "list_type": "Informe uma lista.",
    "model_type": "Informe um objeto.",
    "model_attributes_type": "Informe um objeto.",
    "dict_type": "Informe um objeto.",
    "json_invalid": "O corpo da requisição não é um JSON válido.",
    "greater_than": "Deve ser maior que {gt}.",
    "greater_than_equal": "Deve ser maior ou igual a {ge}.",
    "less_than": "Deve ser menor que {lt}.",
    "less_than_equal": "Deve ser menor ou igual a {le}.",
    "too_short": "Informe ao menos {min_length} item(ns).",
    "too_long": "Informe no máximo {max_length} item(ns).",
}


class AnaliseEntrada(Entrada):
    sexo: Literal[tuple(rotulos.SEXO)]
    faixa_etaria_cod: str
    cid10_principal: str
    comorbidades: list[str] = []
    # Opcional: informada, a escada ganha o degrau de IMC (ver matching.niveis_para).
    faixa_imc_cod: str | None = None
    horizonte_dias: int = Field(default=HORIZONTE_PADRAO_DIAS,
                                ge=HORIZONTE_MIN_DIAS, le=HORIZONTE_MAX_DIAS)
    n_minimo: int = Field(default=engine.N_MINIMO_PADRAO, ge=N_MINIMO_MIN, le=N_MINIMO_MAX)


def _conectar():
    caminho = os.environ.get("MEDPLAN_DB") or db.BANCO_PADRAO
    if not db.banco_existe(caminho):
        raise HTTPException(503, "Banco do protótipo não encontrado. "
                                 "Rode: python -m medplan.bootstrap")
    return closing(db.conectar(caminho))


# =============================================================================
# Serialização da análise
# =============================================================================
def _motivos(r: ResultadoHorizonte) -> list[dict]:
    itens = []
    for motivo, rotulo in rotulos.MOTIVO_DESCONTINUACAO.items():
        n = r.eventos_por_motivo.get(motivo, 0)
        taxa = r.taxa_motivo(motivo)
        itens.append({"motivo": motivo, "rotulo": rotulo, "n": n, "n_base": r.n_avaliavel,
                      "taxa": taxa, **com_ic(taxa, ic_wilson(n, r.n_avaliavel))})
    return itens


def _recomendado(posicao: int, linha: engine.LinhaMedicamento) -> dict:
    r = linha.resultado
    return {
        "posicao": posicao,
        "medicamento_id": linha.medicamento_id,
        "principio_ativo": linha.principio_ativo,
        "classe_terapeutica": linha.classe_terapeutica,
        "codigo_atc": linha.codigo_atc,
        "n_episodios": linha.n_episodios,
        "permanencia": {
            "taxa": r.taxa_permanencia,
            **com_ic(r.taxa_permanencia, r.ic_permanencia),
            "n_base": r.n_avaliavel,
            "n_avaliavel": r.n_avaliavel,
            "n_retidos": r.n_retidos,
            "n_censurado": r.n_censurado,
        },
        "descontinuacao_por_motivo": _motivos(r),
        "reacoes": [
            {
                "termo": ra.termo,
                "soc": ra.soc,
                "n": ra.n,
                "n_base": ra.n_base,
                "proporcao": ra.proporcao,
                **com_ic(ra.proporcao, ra.ic),
                "mediana_dias_ate_inicio": (
                    float(ra.mediana_dias_ate_inicio)
                    if ra.mediana_dias_ate_inicio is not None else None
                ),
                "n_levou_descontinuacao": ra.n_levou_descontinuacao,
            }
            for ra in linha.reacoes
        ],
    }


def _sem_dados(linha: engine.LinhaMedicamento) -> dict:
    # Por contrato, nenhum campo de taxa, proporção ou IC aqui.
    return {
        "medicamento_id": linha.medicamento_id,
        "principio_ativo": linha.principio_ativo,
        "classe_terapeutica": linha.classe_terapeutica,
        "codigo_atc": linha.codigo_atc,
        "n_episodios": linha.n_episodios,
        "n_avaliavel": linha.resultado.n_avaliavel,
        "n_censurado": linha.resultado.n_censurado,
    }


def _faixa_ampliada(conn: sqlite3.Connection, tabela: str, codigo: str) -> tuple[str, str]:
    """(rótulo informado, linhas das faixas adjacentes) — a mesma subconsulta de matching."""
    faixas = conn.execute(
        f"SELECT * FROM {tabela} WHERE ordem BETWEEN "
        f" (SELECT ordem - 1 FROM {tabela} WHERE codigo = ?) AND "
        f" (SELECT ordem + 1 FROM {tabela} WHERE codigo = ?) ORDER BY ordem",
        (codigo, codigo),
    ).fetchall()
    informado = next(f["rotulo"] for f in faixas if f["codigo"] == codigo)
    return informado, faixas


def _substituicoes(conn: sqlite3.Connection, alvo: PerfilAlvo, nivel: Nivel) -> list[dict]:
    """O que o degrau deixou de exigir e o que usou no lugar.

    Espelha matching.construir_consulta critério a critério (mesmas subconsultas
    de faixa adjacente e grupo CID).
    """
    psiq = alvo.comorbidades_psiquiatricas
    clinicas = tuple(c for c in alvo.comorbidades if c not in psiq)
    itens = []

    def comorbidades(informadas: tuple[str, ...]) -> tuple[str, str]:
        # Sem comorbidade informada, o perfil completo exige pacientes SEM comorbidade;
        # ao afrouxar, entram pacientes com comorbidade. A tela precisa dizer isso.
        if informadas:
            return ", ".join(informadas), "qualquer comorbidade"
        return "sem comorbidades", "com ou sem comorbidades"

    if nivel.relaxa(matching.COMORBIDADES_CLINICAS):
        informado, usado = comorbidades(clinicas)
        itens.append({"criterio": "comorbidades clínicas", "valor_informado": informado, "valor_usado": usado})
    if nivel.relaxa(matching.COMORBIDADES_PSIQUIATRICAS):
        informado, usado = comorbidades(psiq)
        itens.append({"criterio": "comorbidades psiquiátricas", "valor_informado": informado, "valor_usado": usado})
    if alvo.faixa_imc_cod and nivel.relaxa(matching.FAIXA_IMC_EXATA):
        informado, faixas = _faixa_ampliada(conn, "faixa_imc", alvo.faixa_imc_cod)
        itens.append({"criterio": "faixa de IMC", "valor_informado": informado,
                      "valor_usado": " a ".join(dict.fromkeys([faixas[0]["rotulo"], faixas[-1]["rotulo"]]))})
    if nivel.relaxa(matching.FAIXA_ETARIA_EXATA):
        informado, faixas = _faixa_ampliada(conn, "faixa_etaria", alvo.faixa_etaria_cod)
        ultima_ordem = conn.execute("SELECT MAX(ordem) FROM faixa_etaria").fetchone()[0]
        if faixas[-1]["ordem"] == ultima_ordem:
            usado = f"{faixas[0]['idade_min']} anos ou mais"
        else:
            usado = f"{faixas[0]['idade_min']} a {faixas[-1]['idade_max']} anos"
        itens.append({"criterio": "faixa etária", "valor_informado": informado,
                      "valor_usado": usado})
    if nivel.relaxa(matching.SEXO):
        itens.append({"criterio": "sexo", "valor_informado": rotulos.SEXO[alvo.sexo].lower(),
                      "valor_usado": "todos"})
    if nivel.relaxa(matching.CID_EXATO):
        grupo = conn.execute("SELECT grupo FROM cid10 WHERE codigo = ?",
                             (alvo.cid10_principal,)).fetchone()["grupo"]
        codigos = [
            r["codigo"] for r in conn.execute(
                "SELECT codigo FROM cid10 WHERE grupo = "
                " (SELECT grupo FROM cid10 WHERE codigo = ?) ORDER BY codigo",
                (alvo.cid10_principal,),
            )
        ]
        itens.append({"criterio": "código CID-10", "valor_informado": alvo.cid10_principal,
                      "valor_usado": f"grupo {grupo}", "codigos_grupo": codigos,
                      "grupo_amplia": len(codigos) > 1})
    return itens


def _nivel(nivel: Nivel, substituicoes: list[dict]) -> dict:
    return {"ordem": nivel.ordem, "rotulo": nivel.rotulo,
            "criterios_relaxados": list(nivel.criterios_relaxados),
            "substituicoes": substituicoes}


def _avisos(rec: engine.Recomendacao, total_censurado: int) -> list[dict]:
    # Mesmas condições, na mesma ordem, em que engine.recomendar monta os avisos.
    tipos = (["vies_indicacao"]
             + (["relaxamento"] if rec.nivel.criterios_relaxados else [])
             + (["censura"] if total_censurado else []))
    return [{"tipo": t, "texto": texto} for t, texto in zip(tipos, rec.avisos, strict=True)]


# =============================================================================
# Rotas
# =============================================================================
router = APIRouter(prefix="/api/v1")


@router.get("/referencias")
def referencias():
    with _conectar() as conn:
        hospital = conn.execute("SELECT nome FROM hospital WHERE id = ?",
                                (HOSPITAL_ID,)).fetchone()
        clinico = clinico_atual(conn)
        diagnosticos = [
            dict(r) for r in conn.execute(
                "SELECT c.codigo, c.descricao, c.grupo, COUNT(p.id) AS n_perfis "
                "  FROM cid10 c "
                "  LEFT JOIN paciente_perfil p "
                "    ON p.cid10_principal = c.codigo AND p.hospital_id = ? "
                f" WHERE c.{FILTRO_DIAGNOSTICO} "
                " GROUP BY c.codigo, c.descricao, c.grupo ORDER BY c.codigo",
                (HOSPITAL_ID,),
            )
        ]
        cid10 = [
            {**dict(r), "tipo": "psiquiatrica" if r["codigo"].upper().startswith("F") else "clinica"}
            for r in conn.execute("SELECT codigo, descricao, grupo FROM cid10 ORDER BY codigo")
        ]
        faixas_etarias = [dict(r) for r in conn.execute(
            "SELECT codigo, rotulo, ordem FROM faixa_etaria ORDER BY ordem")]
        faixas_imc = [dict(r) for r in conn.execute(
            "SELECT codigo, rotulo, ordem FROM faixa_imc ORDER BY ordem")]
        medicamentos = [dict(r) for r in conn.execute(
            "SELECT id, principio_ativo, codigo_atc, classe_terapeutica "
            "  FROM medicamento ORDER BY principio_ativo")]
        reacoes = [dict(r) for r in conn.execute(
            "SELECT id, termo, soc, gravidade_padrao FROM reacao_adversa ORDER BY termo")]

    return {
        "ambiente": {"dados_sinteticos": DADOS_SINTETICOS, "hospital": hospital["nome"]},
        "clinico_atual": dict(clinico),
        "limites": {
            "horizonte_padrao_dias": HORIZONTE_PADRAO_DIAS,
            "horizonte_min_dias": HORIZONTE_MIN_DIAS,
            "horizonte_max_dias": HORIZONTE_MAX_DIAS,
            "n_minimo_padrao": engine.N_MINIMO_PADRAO,
            "n_minimo_min": N_MINIMO_MIN,
            "n_minimo_max": N_MINIMO_MAX,
        },
        "diagnosticos": diagnosticos,
        "cid10": cid10,
        "faixas_etarias": faixas_etarias,
        "faixas_imc": faixas_imc,
        "medicamentos": medicamentos,
        "reacoes_adversas": reacoes,
        "opcoes": rotulos.opcoes(),
    }


@router.get("/base")
def base():
    with _conectar() as conn:
        return dict(conn.execute(
            "SELECT (SELECT COUNT(*) FROM paciente_perfil WHERE hospital_id = ?) AS n_perfis,"
            "       (SELECT COUNT(*) FROM prescricao WHERE hospital_id = ?) AS n_tratamentos,"
            "       (SELECT COUNT(*) FROM desfecho_reacao dr"
            "          JOIN desfecho_tratamento d ON d.id = dr.desfecho_id"
            "         WHERE d.hospital_id = ?) AS n_reacoes_registradas",
            (HOSPITAL_ID, HOSPITAL_ID, HOSPITAL_ID),
        ).fetchone())


@router.post("/analises")
def analisar(entrada: AnaliseEntrada):
    with _conectar() as conn:
        erros = validar_perfil(conn, entrada)
        if entrada.faixa_imc_cod is not None and conn.execute(
            "SELECT 1 FROM faixa_imc WHERE codigo = ?", (entrada.faixa_imc_cod,)
        ).fetchone() is None:
            erros.append({"campo": "faixa_imc_cod", "mensagem": "Faixa de IMC não encontrada no catálogo."})
        if erros:
            raise ErroValidacao(erros)

        alvo = PerfilAlvo(
            hospital_id=HOSPITAL_ID,
            sexo=entrada.sexo,
            faixa_etaria_cod=entrada.faixa_etaria_cod,
            cid10_principal=entrada.cid10_principal,
            comorbidades=tuple(entrada.comorbidades),
            faixa_imc_cod=entrada.faixa_imc_cod,
        )
        rec = engine.recomendar(conn, alvo, n_minimo=entrada.n_minimo,
                                horizonte_dias=entrada.horizonte_dias)
        degraus = engine.diagnosticar_escada(conn, alvo, horizonte_dias=entrada.horizonte_dias)
        sql_coorte, params_coorte = construir_consulta(alvo, rec.nivel)
        chaves_coorte = {r[0] for r in conn.execute(
            f"SELECT chave_pseudonima FROM paciente_perfil WHERE id IN ({sql_coorte})", params_coorte)}
        frequencia = paineis.frequencia_prescricao(paineis.Base(conn), chaves_coorte, entrada.n_minimo)
        substituicoes = {n.ordem: _substituicoes(conn, alvo, n) for n in niveis_para(alvo)}
        n_perfis_base = conn.execute(
            "SELECT COUNT(*) FROM paciente_perfil WHERE hospital_id = ?", (HOSPITAL_ID,)
        ).fetchone()[0]

    total_censurado = sum(
        l.resultado.n_censurado for l in rec.recomendados + rec.sem_dados_suficientes
    )
    return {
        "perfil": {
            "sexo": entrada.sexo,
            "faixa_etaria_cod": entrada.faixa_etaria_cod,
            "cid10_principal": entrada.cid10_principal,
            "comorbidades": entrada.comorbidades,
            "faixa_imc_cod": entrada.faixa_imc_cod,
        },
        "horizonte_dias": rec.horizonte_dias,
        "n_minimo": rec.n_minimo,
        "nivel": _nivel(rec.nivel, substituicoes[rec.nivel.ordem]),
        "n_perfis": rec.n_perfis,
        "dados_insuficientes": rec.dados_insuficientes,
        "escada": [
            {
                **_nivel(d.nivel, substituicoes[d.nivel.ordem]),
                "n_perfis": d.n_perfis,
                "n_medicamentos": d.n_medicamentos,
                "melhor_n_avaliavel": d.melhor_n_avaliavel,
                "atingiu_n_minimo": d.melhor_n_avaliavel >= rec.n_minimo,
                "selecionado": d.nivel.ordem == rec.nivel.ordem,
            }
            for d in degraus
        ],
        "avisos": _avisos(rec, total_censurado),
        "total_censurado": total_censurado,
        "frequencia_prescricao": frequencia,
        "proveniencia": {
            "sintetico": DADOS_SINTETICOS,
            "n_perfis_base": n_perfis_base,
            "calculado_em": datetime.now().astimezone().isoformat(timespec="seconds"),
        },
        "recomendados": [_recomendado(i, l) for i, l in enumerate(rec.recomendados, start=1)],
        "sem_dados_suficientes": [_sem_dados(l) for l in rec.sem_dados_suficientes],
    }


@router.post("/casos", status_code=201)
def registrar_caso(caso: CasoEntrada):
    with _conectar() as conn:
        erros, alertas = validar(conn, caso, date.today())
        if erros:
            raise ErroValidacao(erros)
        return {**registrar(conn, caso), "alertas": alertas}


# =============================================================================
# Painéis (Data Mart)
#
# POST com corpo, como a análise: filtros de perfil e chave pseudônima não vão para a URL
# (que chega a logs e ao histórico do navegador).
# =============================================================================
class FiltrosEntrada(Entrada):
    sexo: Literal[tuple(rotulos.SEXO)] | None = None
    faixa_etaria_cod: str | None = None
    # código CID-10 ou grupo, ex. "F30-F39"
    diagnostico: str | None = None
    faixa_imc_cod: str | None = None
    tabagista: bool | None = None
    # quantidade de comorbidades; 3 = "3 ou mais"
    comorbidades: int | None = Field(default=None, ge=0, le=3)

    def para_painel(self) -> paineis.Filtros:
        return paineis.Filtros(self.sexo, self.faixa_etaria_cod, self.diagnostico, self.faixa_imc_cod,
                               self.tabagista, self.comorbidades)


class _ComFiltros(Entrada):
    filtros: FiltrosEntrada = FiltrosEntrada()
    n_minimo: int = Field(default=engine.N_MINIMO_PADRAO, ge=N_MINIMO_MIN, le=N_MINIMO_MAX)


class VisaoGeralEntrada(_ComFiltros):
    horizonte_dias: int = Field(default=HORIZONTE_PADRAO_DIAS, ge=HORIZONTE_MIN_DIAS, le=HORIZONTE_MAX_DIAS)
    dividir_por: Literal[paineis.DIVISOES] = "faixa"


class PacientesEntrada(Entrada):
    q: str | None = Field(default=None, max_length=60)
    sexo: Literal[tuple(rotulos.SEXO)] | None = None
    faixa_etaria_cod: str | None = None
    grupo: str | None = None
    pagina: int = Field(default=1, ge=1)
    por_pagina: int = Field(default=20, ge=1, le=100)


class PacienteEntrada(Entrada):
    chave_pseudonima: str = Field(max_length=32)


class FichaMedicamentoEntrada(_ComFiltros):
    medicamento_id: int
    horizonte_dias: int = Field(default=HORIZONTE_PADRAO_DIAS, ge=HORIZONTE_MIN_DIAS, le=HORIZONTE_MAX_DIAS)


class ReacoesEntrada(_ComFiltros):
    medicamento_id: int | None = None
    linha: Literal[tuple(c for c, _ in paineis.LINHAS)] | None = None


class PesoImcEntrada(_ComFiltros):
    medicamento_id: int


def _validar_filtros(conn: sqlite3.Connection, f: FiltrosEntrada) -> paineis.Filtros:
    erros = []
    if f.faixa_etaria_cod and conn.execute("SELECT 1 FROM faixa_etaria WHERE codigo = ?", (f.faixa_etaria_cod,)).fetchone() is None:
        erros.append({"campo": "filtros.faixa_etaria_cod", "mensagem": "Faixa etária não encontrada no catálogo."})
    if f.faixa_imc_cod and conn.execute("SELECT 1 FROM faixa_imc WHERE codigo = ?", (f.faixa_imc_cod,)).fetchone() is None:
        erros.append({"campo": "filtros.faixa_imc_cod", "mensagem": "Faixa de IMC não encontrada no catálogo."})
    if f.diagnostico and conn.execute("SELECT 1 FROM cid10 WHERE codigo = ? OR grupo = ?",
                                      (f.diagnostico, f.diagnostico)).fetchone() is None:
        erros.append({"campo": "filtros.diagnostico", "mensagem": "Código ou grupo CID-10 não encontrado no catálogo."})
    if erros:
        raise ErroValidacao(erros)
    return f.para_painel()


def _medicamento_existe(conn: sqlite3.Connection, medicamento_id: int) -> None:
    if conn.execute("SELECT 1 FROM medicamento WHERE id = ?", (medicamento_id,)).fetchone() is None:
        raise HTTPException(404, "Medicamento não encontrado no catálogo.")


@router.post("/paineis/visao-geral")
def visao_geral(e: VisaoGeralEntrada):
    with _conectar() as conn:
        filtros = _validar_filtros(conn, e.filtros)
        return paineis.visao_geral(paineis.Base(conn), filtros, e.horizonte_dias, e.n_minimo, e.dividir_por)


@router.post("/paineis/pacientes")
def listar_pacientes(e: PacientesEntrada):
    with _conectar() as conn:
        return paineis.pacientes(paineis.Base(conn), e.q, e.sexo, e.faixa_etaria_cod, e.grupo, e.pagina, e.por_pagina)


@router.post("/paineis/paciente")
def ficha_paciente(e: PacienteEntrada):
    with _conectar() as conn:
        ficha = paineis.paciente(paineis.Base(conn), e.chave_pseudonima)
    if ficha is None:
        raise HTTPException(404, "Nenhum atendimento registrado para esta chave.")
    return ficha


@router.post("/paineis/medicamento")
def ficha_medicamento(e: FichaMedicamentoEntrada):
    with _conectar() as conn:
        _medicamento_existe(conn, e.medicamento_id)
        filtros = _validar_filtros(conn, e.filtros)
        return paineis.ficha_medicamento(paineis.Base(conn), e.medicamento_id, filtros, e.horizonte_dias, e.n_minimo)


@router.post("/paineis/reacoes")
def resumo_reacoes(e: ReacoesEntrada):
    with _conectar() as conn:
        if e.medicamento_id is not None:
            _medicamento_existe(conn, e.medicamento_id)
        filtros = _validar_filtros(conn, e.filtros)
        return paineis.reacoes_resumo(paineis.Base(conn), filtros, e.medicamento_id, e.linha, e.n_minimo)


@router.post("/paineis/peso-por-imc")
def peso_por_imc(e: PesoImcEntrada):
    with _conectar() as conn:
        _medicamento_existe(conn, e.medicamento_id)
        filtros = _validar_filtros(conn, e.filtros)
        ids_termo = {r["termo"]: r["id"] for r in conn.execute("SELECT id, termo FROM reacao_adversa")}
        return paineis.peso_por_imc(paineis.Base(conn), e.medicamento_id, filtros, e.n_minimo, ids_termo)


@router.post("/atendimentos", status_code=201)
def registrar_atendimento(entrada: atendimento.AtendimentoEntrada):
    with _conectar() as conn:
        erros = atendimento.validar(conn, entrada, date.today())
        if erros:
            raise ErroValidacao(erros)
        return atendimento.registrar(conn, entrada)


# =============================================================================
# Qualidade dos dados: cargas de CSV e lista de referência de medicamentos
# =============================================================================
@router.post("/cargas", status_code=201)
def enviar_carga(entrada: carga.CargaEntrada):
    erros = carga.validar(entrada)
    if erros:
        raise ErroValidacao(erros)
    with _conectar() as conn:
        return carga.processar(conn, entrada, date.today())


@router.get("/qualidade")
def qualidade():
    with _conectar() as conn:
        return carga.qualidade(conn)


@router.get("/qualidade/cargas/{carga_id}")
def detalhe_carga(carga_id: int):
    with _conectar() as conn:
        d = carga.detalhe(conn, carga_id)
    if d is None:
        raise HTTPException(404, "Carga não encontrada.")
    return d


@router.post("/medicamentos", status_code=201)
def adicionar_medicamento(entrada: catalogo.MedicamentoEntrada):
    with _conectar() as conn:
        erros = catalogo.validar(conn, entrada)
        if erros:
            raise ErroValidacao(erros)
        return catalogo.adicionar(conn, entrada)


@router.get("/casos")
def casos_recentes(limite: int = Query(default=10, ge=1, le=100)):
    with _conectar() as conn:
        perfis = conn.execute(
            "SELECT id, chave_pseudonima, sexo, faixa_etaria_cod, cid10_principal, criado_em"
            "  FROM paciente_perfil WHERE hospital_id = ? ORDER BY id DESC LIMIT ?",
            (HOSPITAL_ID, limite),
        ).fetchall()
        casos = []
        for p in perfis:
            comorbidades = [r["cid10_codigo"] for r in conn.execute(
                "SELECT cid10_codigo FROM perfil_comorbidade"
                " WHERE paciente_perfil_id = ? ORDER BY cid10_codigo", (p["id"],))]
            tratamentos = [dict(r) for r in conn.execute(
                "SELECT m.principio_ativo, pr.data_inicio, d.status"
                "  FROM prescricao pr"
                "  JOIN medicamento m ON m.id = pr.medicamento_id"
                "  JOIN desfecho_tratamento d ON d.prescricao_id = pr.id"
                " WHERE pr.paciente_perfil_id = ? ORDER BY pr.data_inicio, pr.id", (p["id"],))]
            n_reacoes = conn.execute(
                "SELECT COUNT(*) FROM desfecho_reacao dr"
                "  JOIN desfecho_tratamento d ON d.id = dr.desfecho_id"
                "  JOIN prescricao pr ON pr.id = d.prescricao_id"
                " WHERE pr.paciente_perfil_id = ?", (p["id"],)).fetchone()[0]
            casos.append({
                "id": p["id"],
                "chave_pseudonima": p["chave_pseudonima"],
                "sexo": p["sexo"],
                "faixa_etaria_cod": p["faixa_etaria_cod"],
                "cid10_principal": p["cid10_principal"],
                "comorbidades": comorbidades,
                "criado_em": iso_utc(p["criado_em"]),
                "n_reacoes": n_reacoes,
                "tratamentos": tratamentos,
            })
    return casos


# =============================================================================
# Erros e aplicação
# =============================================================================
async def _erro_validacao(request: Request, exc: RequestValidationError) -> JSONResponse:
    detalhe = []
    for erro in exc.errors():
        tipo = erro.get("type")
        campo = ".".join(str(p) for p in erro["loc"][1:])
        if tipo == "json_invalid" or not campo:
            campo = "corpo"
        mensagem = MENSAGENS.get(tipo, "Valor inválido.").format(**(erro.get("ctx") or {}))
        detalhe.append({"campo": campo, "mensagem": mensagem})
    return JSONResponse(status_code=422, content={"detail": detalhe})


async def _erro_dominio(request: Request, exc: ErroValidacao) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.erros})


def criar_app(pasta_web: Path = WEB_DIST) -> FastAPI:
    app = FastAPI(title="MedPlan — API da fase 0 (dados sintéticos)")
    app.add_exception_handler(RequestValidationError, _erro_validacao)
    app.add_exception_handler(ErroValidacao, _erro_dominio)
    app.include_router(router)

    # Front compilado, só se existir na partida. As rotas /api vêm antes.
    if pasta_web.is_dir():
        raiz = pasta_web.resolve()

        @app.get("/{caminho:path}", include_in_schema=False)
        def spa(caminho: str):
            if caminho == "api" or caminho.startswith("api/"):
                raise HTTPException(404)
            arquivo = (raiz / caminho).resolve()
            if arquivo.is_file() and arquivo.is_relative_to(raiz):
                return FileResponse(arquivo)
            if caminho.startswith("assets/"):
                raise HTTPException(404)
            return FileResponse(raiz / "index.html")

    return app


app = criar_app()
