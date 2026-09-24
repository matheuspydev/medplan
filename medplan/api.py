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

from . import db, engine, rotulos
from .matching import NIVEIS, Nivel, PerfilAlvo
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
from .stats import HORIZONTE_PADRAO_DIAS, ResultadoHorizonte, ic_wilson

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
def _pct(x: float) -> int:
    """Percentual inteiro com o critério do motor (1/8 vira 12, não 13)."""
    return int(format(x, ".0%")[:-1])


def _com_ic(valor: float, ic: tuple[float, float]) -> dict:
    return {
        "pct": _pct(valor),
        "ic_inferior": ic[0],
        "ic_superior": ic[1],
        "ic_inferior_pct": _pct(ic[0]),
        "ic_superior_pct": _pct(ic[1]),
    }


def _motivos(r: ResultadoHorizonte) -> list[dict]:
    itens = []
    for motivo, rotulo in rotulos.MOTIVO_DESCONTINUACAO.items():
        n = r.eventos_por_motivo.get(motivo, 0)
        taxa = r.taxa_motivo(motivo)
        itens.append({"motivo": motivo, "rotulo": rotulo, "n": n, "n_base": r.n_avaliavel,
                      "taxa": taxa, **_com_ic(taxa, ic_wilson(n, r.n_avaliavel))})
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
            **_com_ic(r.taxa_permanencia, r.ic_permanencia),
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
                **_com_ic(ra.proporcao, ra.ic),
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


def _substituicoes(conn: sqlite3.Connection, alvo: PerfilAlvo, nivel: Nivel) -> list[dict]:
    """O que o degrau deixou de exigir e o que usou no lugar.

    Espelha matching.construir_consulta degrau a degrau (mesmos limiares de
    ordem e mesmas subconsultas de faixa adjacente e grupo CID).
    """
    psiq = alvo.comorbidades_psiquiatricas
    clinicas = tuple(c for c in alvo.comorbidades if c not in psiq)
    itens = []

    if nivel.ordem >= 1:
        itens.append({"criterio": "comorbidades clínicas",
                      "valor_informado": ", ".join(clinicas) or "nenhuma",
                      "valor_usado": "não filtradas"})
    if nivel.ordem >= 2:
        itens.append({"criterio": "comorbidades psiquiátricas",
                      "valor_informado": ", ".join(psiq) or "nenhuma",
                      "valor_usado": "não filtradas"})
    if nivel.ordem >= 3:
        faixas = conn.execute(
            "SELECT codigo, rotulo, idade_min, idade_max, ordem FROM faixa_etaria WHERE ordem BETWEEN "
            " (SELECT ordem - 1 FROM faixa_etaria WHERE codigo = ?) AND "
            " (SELECT ordem + 1 FROM faixa_etaria WHERE codigo = ?) ORDER BY ordem",
            (alvo.faixa_etaria_cod, alvo.faixa_etaria_cod),
        ).fetchall()
        ultima_ordem = conn.execute("SELECT MAX(ordem) FROM faixa_etaria").fetchone()[0]
        if faixas[-1]["ordem"] == ultima_ordem:
            usado = f"{faixas[0]['idade_min']} anos ou mais"
        else:
            usado = f"{faixas[0]['idade_min']} a {faixas[-1]['idade_max']} anos"
        informado = next(f["rotulo"] for f in faixas if f["codigo"] == alvo.faixa_etaria_cod)
        itens.append({"criterio": "faixa etária", "valor_informado": informado,
                      "valor_usado": usado})
    if nivel.ordem >= 4:
        itens.append({"criterio": "sexo", "valor_informado": rotulos.SEXO[alvo.sexo].lower(),
                      "valor_usado": "todos"})
    if nivel.ordem >= 5:
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
        if erros:
            raise ErroValidacao(erros)

        alvo = PerfilAlvo(
            hospital_id=HOSPITAL_ID,
            sexo=entrada.sexo,
            faixa_etaria_cod=entrada.faixa_etaria_cod,
            cid10_principal=entrada.cid10_principal,
            comorbidades=tuple(entrada.comorbidades),
        )
        rec = engine.recomendar(conn, alvo, n_minimo=entrada.n_minimo,
                                horizonte_dias=entrada.horizonte_dias)
        degraus = engine.diagnosticar_escada(conn, alvo, horizonte_dias=entrada.horizonte_dias)
        substituicoes = {n.ordem: _substituicoes(conn, alvo, n) for n in NIVEIS}
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
