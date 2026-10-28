"""Carga de CSV (atendimentos.csv + reacoes.csv) e o painel de qualidade dos dados.

Cada linha aceita passa pelo mesmo caminho do registro manual (atendimento.validar e
atendimento.registrar), então entra no Data Mart e no modelo do motor da mesma forma.

- Coluna fora do modelo ou obrigatória ausente: a carga inteira é recusada, nada entra.
- Fora isso, linha a linha: as válidas entram, as outras são rejeitadas com um motivo.
  Uma rejeição por linha (o primeiro problema, na ordem das colunas).
- Reações só se ligam a atendimentos da mesma carga (chave + data do atendimento).
- O registro da carga (db/sqlite/carga.sql) é somente de inclusão e não guarda o valor
  recusado. O valor só volta na resposta do envio, que não é gravada.
"""

from __future__ import annotations

import csv
import io
import re
import sqlite3
from collections import Counter
from dataclasses import dataclass
from datetime import date

from pydantic import Field

from . import atendimento, rotulos
from .db import garantir_tabelas_carga
from .registro import FILTRO_DIAGNOSTICO, HOSPITAL_ID, Entrada, iso_utc

MOTIVOS = {
    "incompleto": "Registro incompleto",
    "vocabulario": "Código fora do vocabulário",
    "data": "Data inconsistente",
    "dominio": "Valor fora do domínio",
    "vinculo": "Sem atendimento correspondente",
    "duplicado": "Já carregado",
}

# (coluna, obrigatória). Colunas opcionais podem faltar no cabeçalho.
COLUNAS_ATENDIMENTOS = (
    ("chave_pseudonima", True),
    ("sexo", True),
    ("data_atendimento", True),
    ("faixa_etaria_cod", True),
    ("faixa_imc_cod", True),
    ("tabagismo", True),
    ("cid10_principal", True),
    ("comorbidades", False),
    ("codigo_atc", True),
    ("data_inicio_medicamento", True),
    ("linha_tratamento", False),
    ("status", True),
)
COLUNAS_REACOES = (
    ("chave_pseudonima", True),
    ("data_atendimento", True),
    ("termo", True),
    ("codigo_atc_causador", True),
    ("data_inicio_medicamento", True),
    ("data_inicio_reacao", False),
    ("gravidade_observada", True),
    ("levou_descontinuacao", True),
)
IMC_NAO_INFORMADO = "nao_informado"
SIM_NAO = {"sim": True, "nao": False}
NOME_ARQUIVO = re.compile(r"^[A-Za-z0-9._-]{1,96}\.csv$")


class ArquivoCsv(Entrada):
    nome: str
    # UTF-8, separador ponto e vírgula, uma linha de cabeçalho
    conteudo: str = Field(max_length=10_000_000)


class CargaEntrada(Entrada):
    atendimentos: ArquivoCsv
    reacoes: ArquivoCsv | None = None
    linhas_informadas: int | None = Field(default=None, ge=0)


@dataclass
class Rejeicao:
    arquivo: str
    linha: int
    campo: str
    motivo: str
    mensagem: str
    valor: str


class _Recusa(Exception):
    pass


# =============================================================================
# Leitura
# =============================================================================
def _ler(conteudo: str, colunas: tuple, nome_arquivo: str) -> list[tuple[int, dict]]:
    leitor = csv.DictReader(io.StringIO(conteudo.lstrip("﻿")), delimiter=";")
    cabecalho = [c.strip() for c in (leitor.fieldnames or [])]
    conhecidas = {c for c, _ in colunas}
    fora = [c for c in cabecalho if c not in conhecidas]
    if fora:
        raise _Recusa(f"{nome_arquivo}: coluna fora do modelo ({', '.join(fora)}). Nenhuma linha entrou no banco.")
    faltam = [c for c, obrigatoria in colunas if obrigatoria and c not in cabecalho]
    if faltam:
        raise _Recusa(f"{nome_arquivo}: faltam as colunas obrigatórias {', '.join(faltam)}. Nenhuma linha entrou no banco.")
    leitor.fieldnames = cabecalho
    linhas = []
    for bruta in leitor:
        if None in bruta:
            raise _Recusa(f"{nome_arquivo}: a linha {leitor.line_num} tem mais campos que o cabeçalho. "
                          "Nenhuma linha entrou no banco.")
        valores = {c: (bruta.get(c) or "").strip() for c, _ in colunas}
        if any(valores.values()):
            linhas.append((leitor.line_num, valores))
    return linhas


def _data(texto: str) -> date | None:
    try:
        return date.fromisoformat(texto) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", texto) else None
    except ValueError:
        return None


class _Catalogo:
    def __init__(self, conn: sqlite3.Connection):
        self.faixas = {r[0] for r in conn.execute("SELECT codigo FROM faixa_etaria")}
        self.imcs = {r[0] for r in conn.execute("SELECT codigo FROM faixa_imc")}
        self.diagnosticos = {r[0] for r in conn.execute(f"SELECT codigo FROM cid10 WHERE {FILTRO_DIAGNOSTICO}")}
        self.cids = {r[0] for r in conn.execute("SELECT codigo FROM cid10")}
        self.atc = {r[1]: r[0] for r in conn.execute("SELECT id, codigo_atc FROM medicamento")}
        self.termos = {r[1].casefold(): r[0] for r in conn.execute("SELECT id, termo FROM reacao_adversa")}


class _Linha:
    """Valida os campos de uma linha na ordem das colunas; guarda o primeiro problema."""

    def __init__(self, arquivo: str, numero: int, valores: dict):
        self.arquivo, self.numero, self.valores = arquivo, numero, valores
        self.rejeicao: Rejeicao | None = None

    def rejeitar(self, campo: str, motivo: str, mensagem: str) -> None:
        if self.rejeicao is None:
            self.rejeicao = Rejeicao(self.arquivo, self.numero, campo, motivo, mensagem, self.valores.get(campo, ""))

    def obrigatorio(self, campo: str) -> str | None:
        valor = self.valores[campo]
        if not valor:
            self.rejeitar(campo, "incompleto", "Campo obrigatório vazio.")
            return None
        return valor

    def data(self, campo: str, obrigatoria: bool = True) -> date | None:
        valor = self.obrigatorio(campo) if obrigatoria else self.valores[campo]
        if not valor:
            return None
        d = _data(valor)
        if d is None:
            self.rejeitar(campo, "data", "Data inválida: use AAAA-MM-DD.")
        return d

    def opcao(self, campo: str, opcoes) -> str | None:
        valor = self.obrigatorio(campo)
        if valor is not None and valor not in opcoes:
            self.rejeitar(campo, "dominio", "Valor fora da lista permitida.")
            return None
        return valor

    def codigo(self, campo: str, catalogo, mensagem: str) -> str | None:
        valor = self.obrigatorio(campo)
        if valor is not None and valor not in catalogo:
            self.rejeitar(campo, "vocabulario", mensagem)
            return None
        return valor


def _atendimento(linha: _Linha, cat: _Catalogo) -> dict:
    """Corpo de AtendimentoEntrada a partir de uma linha de atendimentos.csv."""
    chave = linha.obrigatorio("chave_pseudonima")
    if chave is not None and not atendimento.FORMATO_CHAVE.match(chave):
        linha.rejeitar("chave_pseudonima", "dominio", "Chave fora do formato: 4 a 32 caracteres, letras maiúsculas, dígitos e hífen.")
    sexo = linha.opcao("sexo", rotulos.SEXO)
    data_atendimento = linha.data("data_atendimento")
    faixa = linha.codigo("faixa_etaria_cod", cat.faixas, "Faixa etária fora da lista de referência.")
    imc = linha.codigo("faixa_imc_cod", cat.imcs | {IMC_NAO_INFORMADO}, "Faixa de IMC fora da lista de referência.")
    tabagismo = linha.opcao("tabagismo", rotulos.TABAGISMO)
    cid = linha.codigo("cid10_principal", cat.diagnosticos, "Diagnóstico fora da lista de referência.")
    comorbidades = [c.strip() for c in linha.valores["comorbidades"].split(",") if c.strip()]
    if any(c not in cat.cids for c in comorbidades):
        linha.rejeitar("comorbidades", "vocabulario", "Comorbidade fora da lista de referência CID-10.")
    atc = linha.codigo("codigo_atc", cat.atc, "Código ATC fora da lista de referência: adicione o medicamento em Medicamentos.")
    inicio = linha.data("data_inicio_medicamento")
    linha_tratamento = None
    if linha.valores["linha_tratamento"]:
        if re.fullmatch(r"[1-9]\d?", linha.valores["linha_tratamento"]):
            linha_tratamento = int(linha.valores["linha_tratamento"])
        else:
            linha.rejeitar("linha_tratamento", "dominio", "Linha de tratamento: inteiro a partir de 1, ou vazio.")
    status = linha.opcao("status", rotulos.STATUS_TRATAMENTO)
    return {
        "paciente": {"chave_pseudonima": chave, "sexo": sexo},
        "data_atendimento": data_atendimento,
        "faixa_etaria_cod": faixa,
        "faixa_imc_cod": None if imc == IMC_NAO_INFORMADO else imc,
        "tabagismo": tabagismo,
        "cid10_principal": cid,
        "comorbidades": comorbidades,
        "medicamento_id": cat.atc.get(atc),
        "data_inicio_medicamento": inicio,
        "linha_tratamento": linha_tratamento,
        "status": status,
    }


def _reacao(linha: _Linha, cat: _Catalogo) -> dict:
    """Corpo de ReacaoAtendimento a partir de uma linha de reacoes.csv."""
    linha.obrigatorio("chave_pseudonima")
    linha.data("data_atendimento")
    termo = linha.obrigatorio("termo")
    if termo is not None and termo.casefold() not in cat.termos:
        linha.rejeitar("termo", "vocabulario", "Termo fora da lista de referência de reações.")
    atc = linha.codigo("codigo_atc_causador", cat.atc, "Código ATC fora da lista de referência: adicione o medicamento em Medicamentos.")
    inicio = linha.data("data_inicio_medicamento")
    inicio_reacao = linha.data("data_inicio_reacao", obrigatoria=False)
    gravidade = linha.opcao("gravidade_observada", rotulos.GRAVIDADE)
    levou = linha.opcao("levou_descontinuacao", SIM_NAO)
    return {
        "reacao_adversa_id": cat.termos.get((termo or "").casefold()),
        "medicamento_id": cat.atc.get(atc),
        "data_inicio_medicamento": inicio,
        "data_inicio_reacao": inicio_reacao,
        "gravidade_observada": gravidade,
        "levou_descontinuacao": SIM_NAO.get(levou),
    }


# Erros do atendimento.validar: caminho da entrada -> (coluna do CSV, motivo)
def _origem_do_erro(campo: str) -> tuple[str, str, str]:
    """(arquivo, coluna, motivo) de um erro de atendimento.validar."""
    m = re.match(r"reacoes\.\d+\.(\w+)$", campo)
    if m:
        nome = m.group(1)
        if nome == "medicamento_id":
            return "reacoes", "codigo_atc_causador", "vinculo"
        if nome == "reacao_adversa_id":
            return "reacoes", "termo", "duplicado"
        return "reacoes", nome, "data" if nome.startswith("data_") else "dominio"
    if campo == "paciente.sexo":
        return "atendimentos", "sexo", "dominio"
    if campo.startswith("comorbidades"):
        return "atendimentos", "comorbidades", "dominio"
    coluna = {"paciente.chave_pseudonima": "chave_pseudonima", "medicamento_id": "codigo_atc"}.get(campo, campo)
    return "atendimentos", coluna, "data" if coluna.startswith("data_") else "dominio"


def _ja_carregado(conn: sqlite3.Connection, a: dict) -> bool:
    return conn.execute(
        "SELECT 1 FROM fato_atendimento f"
        "  JOIN dim_paciente p ON p.sk_paciente = f.sk_paciente"
        "  JOIN dim_medicamento dm ON dm.sk_medicamento = f.sk_medicamento"
        "  JOIN medicamento m ON m.codigo_atc = dm.codigo_atc"
        " WHERE p.codigo_pseudonimo = ? AND f.sk_tempo = ? AND m.id = ?",
        (a["paciente"]["chave_pseudonima"], int(a["data_atendimento"].strftime("%Y%m%d")), a["medicamento_id"]),
    ).fetchone() is not None


# =============================================================================
# Processamento
# =============================================================================
def validar(entrada: CargaEntrada) -> list[dict]:
    """O nome do arquivo vai para o histórico: só letras sem acento, dígitos, ponto, hífen e sublinhado."""
    arquivos = [("atendimentos", entrada.atendimentos), ("reacoes", entrada.reacoes)]
    return [{"campo": f"{chave}.nome", "mensagem": "Renomeie o arquivo: só letras sem acento, dígitos, ponto, "
             "hífen e sublinhado, terminando em .csv (o nome fica no histórico de cargas)."}
            for chave, arquivo in arquivos if arquivo and not NOME_ARQUIVO.match(arquivo.nome)]


def _linhas_de_dados(arquivo: ArquivoCsv | None) -> int:
    if arquivo is None:
        return 0
    return max(0, sum(1 for l in arquivo.conteudo.splitlines() if l.strip()) - 1)


def processar(conn: sqlite3.Connection, entrada: CargaEntrada, hoje: date) -> dict:
    garantir_tabelas_carga(conn)
    nome_at = entrada.atendimentos.nome
    nome_re = entrada.reacoes.nome if entrada.reacoes else None
    try:
        linhas_at = _ler(entrada.atendimentos.conteudo, COLUNAS_ATENDIMENTOS, nome_at)
        linhas_re = _ler(entrada.reacoes.conteudo, COLUNAS_REACOES, nome_re) if entrada.reacoes else []
    except _Recusa as recusa:
        lidas = (0, _linhas_de_dados(entrada.atendimentos), _linhas_de_dados(entrada.reacoes), 0)
        return _gravar(conn, entrada, str(recusa), origem=lidas, rejeicoes=[], antes=_marcas(conn))

    cat = _Catalogo(conn)
    at = [_Linha("atendimentos", n, v) for n, v in linhas_at]
    re_ = [_Linha("reacoes", n, v) for n, v in linhas_re]
    corpos_at = {id(l): _atendimento(l, cat) for l in at}
    corpos_re = {id(l): _reacao(l, cat) for l in re_}
    origem = (len({l.valores["chave_pseudonima"] for l in at if l.valores["chave_pseudonima"]}), len(at), len(re_),
              sum(len(corpos_at[id(l)]["comorbidades"]) for l in at))

    # um atendimento por paciente e data no arquivo
    vistos: set[tuple[str, str]] = set()
    for l in at:
        par = (l.valores["chave_pseudonima"], l.valores["data_atendimento"])
        if par in vistos:
            l.rejeitar("data_atendimento", "duplicado", "Atendimento repetido no arquivo (mesma chave e data).")
        vistos.add(par)

    reacoes_de: dict[tuple[str, str], list[_Linha]] = {}
    for l in re_:
        reacoes_de.setdefault((l.valores["chave_pseudonima"], l.valores["data_atendimento"]), []).append(l)

    antes = _marcas(conn)
    # em ordem de data: a reação a um medicamento anterior precisa do atendimento anterior já gravado
    for l in sorted(at, key=lambda x: (x.valores["data_atendimento"], x.numero)):
        corpo = corpos_at[id(l)]
        pendentes = reacoes_de.pop((l.valores["chave_pseudonima"], l.valores["data_atendimento"]), [])
        if l.rejeicao is None and _ja_carregado(conn, corpo):
            l.rejeitar("data_atendimento", "duplicado", "Atendimento já carregado (mesma chave, data e medicamento).")
        if l.rejeicao is None:
            for erro in atendimento.validar(conn, atendimento.AtendimentoEntrada.model_validate(corpo), hoje):
                _, coluna, motivo = _origem_do_erro(erro["campo"])
                l.rejeitar(coluna, motivo, erro["mensagem"])
        if l.rejeicao is not None:
            for r in pendentes:
                r.rejeitar("data_atendimento", "vinculo", "O atendimento desta reação foi rejeitado.")
            continue

        boas: list[_Linha] = []
        for r in pendentes:
            if r.rejeicao is None and len(boas) == 20:
                r.rejeitar("termo", "dominio", "Mais de 20 reações no mesmo atendimento.")
            if r.rejeicao is None:
                teste = atendimento.AtendimentoEntrada.model_validate(
                    {**corpo, "reacoes": [corpos_re[id(x)] for x in boas] + [corpos_re[id(r)]]})
                for erro in atendimento.validar(conn, teste, hoje):
                    if erro["campo"].startswith(f"reacoes.{len(boas)}."):
                        _, coluna, motivo = _origem_do_erro(erro["campo"])
                        r.rejeitar(coluna, motivo, erro["mensagem"])
            if r.rejeicao is None:
                boas.append(r)
        atendimento.registrar(conn, atendimento.AtendimentoEntrada.model_validate(
            {**corpo, "reacoes": [corpos_re[id(x)] for x in boas]}))

    for sobra in reacoes_de.values():
        for r in sobra:
            r.rejeitar("data_atendimento", "vinculo", "Nenhum atendimento com esta chave e data em atendimentos.csv.")

    rejeicoes = sorted((l.rejeicao for l in at + re_ if l.rejeicao), key=lambda r: (r.arquivo, r.linha))
    return _gravar(conn, entrada, None, origem, rejeicoes, antes)


def _marcas(conn: sqlite3.Connection) -> tuple[int, int]:
    """Maiores chaves dos fatos antes da carga: o que entrou é medido no banco, não contado aqui."""
    return (conn.execute("SELECT COALESCE(MAX(sk_atendimento), 0) FROM fato_atendimento").fetchone()[0],
            conn.execute("SELECT COALESCE(MAX(sk_reacao_fato), 0) FROM fato_reacao_adversa").fetchone()[0])


def _gravar(conn: sqlite3.Connection, entrada: CargaEntrada, motivo_recusa: str | None, origem: tuple, rejeicoes: list[Rejeicao],
            antes: tuple[int, int]) -> dict:
    at, rf = antes
    banco = conn.execute(
        "SELECT COUNT(DISTINCT sk_paciente), COUNT(*), COALESCE(SUM(qtd_comorbidades), 0)"
        "  FROM fato_atendimento WHERE sk_atendimento > ?", (at,)).fetchone()
    banco_reacoes = conn.execute("SELECT COUNT(*) FROM fato_reacao_adversa WHERE sk_reacao_fato > ?", (rf,)).fetchone()[0]
    with conn:
        carga_id = conn.execute(
            "INSERT INTO carga (hospital_id, arquivo_atendimentos, arquivo_reacoes, linhas_informadas, motivo_recusa,"
            " origem_pacientes, origem_atendimentos, origem_reacoes, origem_comorbidades,"
            " banco_pacientes, banco_atendimentos, banco_reacoes, banco_comorbidades)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (HOSPITAL_ID, entrada.atendimentos.nome, entrada.reacoes.nome if entrada.reacoes else None,
             entrada.linhas_informadas, motivo_recusa, *origem, banco[0], banco[1], banco_reacoes, banco[2]),
        ).lastrowid
        conn.executemany(
            "INSERT INTO carga_rejeicao (carga_id, arquivo, linha, campo, motivo, mensagem) VALUES (?, ?, ?, ?, ?, ?)",
            [(carga_id, r.arquivo, r.linha, r.campo, r.motivo, r.mensagem) for r in rejeicoes],
        )
    # o valor recusado só volta nesta resposta (não é gravado)
    return {
        **detalhe(conn, carga_id),
        "rejeicoes": [{"arquivo": r.arquivo, "linha": r.linha, "campo": r.campo, "motivo": r.motivo,
                       "mensagem": r.mensagem, "valor": r.valor} for r in rejeicoes],
    }


# =============================================================================
# Leitura para a tela de qualidade
# =============================================================================
def _resumo_carga(c: sqlite3.Row, rejeitadas_por_arquivo: Counter) -> dict:
    lidas = c["origem_atendimentos"] + c["origem_reacoes"]
    aceitas = c["banco_atendimentos"] + c["banco_reacoes"]
    # carga recusada inteira: todas as linhas lidas ficam de fora
    rejeitadas = lidas if c["motivo_recusa"] else sum(rejeitadas_por_arquivo.values())
    situacao = "recusada" if c["motivo_recusa"] else "completa" if rejeitadas == 0 else "com_rejeicoes"
    return {
        "id": c["id"], "criado_em": iso_utc(c["criado_em"]),
        "arquivo_atendimentos": c["arquivo_atendimentos"], "arquivo_reacoes": c["arquivo_reacoes"],
        "linhas_informadas": c["linhas_informadas"],
        "lidas": lidas, "aceitas": aceitas, "rejeitadas": rejeitadas,
        "lidas_atendimentos": c["origem_atendimentos"],
        "situacao": situacao, "motivo_recusa": c["motivo_recusa"],
    }


def _rejeitadas(conn: sqlite3.Connection, carga_id: int) -> Counter:
    return Counter({r[0]: r[1] for r in conn.execute(
        "SELECT arquivo, COUNT(*) FROM carga_rejeicao WHERE carga_id = ? GROUP BY arquivo", (carga_id,))})


def detalhe(conn: sqlite3.Connection, carga_id: int) -> dict | None:
    garantir_tabelas_carga(conn)
    c = conn.execute("SELECT * FROM carga WHERE id = ? AND hospital_id = ?", (carga_id, HOSPITAL_ID)).fetchone()
    if c is None:
        return None
    rej = _rejeitadas(conn, carga_id)
    motivos = Counter({r[0]: r[1] for r in conn.execute(
        "SELECT motivo, COUNT(*) FROM carga_rejeicao WHERE carga_id = ? GROUP BY motivo", (carga_id,))})
    # comorbidades das linhas de atendimento rejeitadas não são guardadas: o esperado sai da diferença de atendimentos
    entidades = [
        ("Pacientes", "pacientes", None),
        ("Atendimentos", "atendimentos", rej["atendimentos"]),
        ("Reações adversas", "reacoes", rej["reacoes"]),
        ("Comorbidades", "comorbidades", None),
    ]
    reconciliacao = []
    for rotulo, sufixo, rejeitadas in entidades:
        origem, banco = c[f"origem_{sufixo}"], c[f"banco_{sufixo}"]
        if c["motivo_recusa"]:
            situacao = "nao_processada"
        elif origem == banco:
            situacao = "confere"
        elif rejeitadas is not None:
            situacao = "explicada" if origem - banco == rejeitadas else "a_conferir"
        else:
            # pacientes e comorbidades só faltam se houve atendimento rejeitado
            situacao = "explicada" if rej["atendimentos"] and banco < origem else "a_conferir"
        reconciliacao.append({"entidade": rotulo, "origem": origem, "banco": banco, "diferenca": banco - origem,
                              "rejeitadas": rejeitadas, "situacao": situacao})
    rejeicoes = [dict(r) for r in conn.execute(
        "SELECT arquivo, linha, campo, motivo, mensagem FROM carga_rejeicao WHERE carga_id = ?"
        " ORDER BY arquivo, linha LIMIT 200", (carga_id,))]
    return {
        **_resumo_carga(c, rej),
        "motivos": [{"motivo": m, "rotulo": MOTIVOS[m], "n": motivos[m]} for m in MOTIVOS],
        "reconciliacao": reconciliacao,
        "rejeicoes": rejeicoes,
        "n_rejeicoes": sum(rej.values()),
    }


def integridade(conn: sqlite3.Connection) -> list[dict]:
    """Checagens do Data Mart inteiro (não só da última carga)."""
    sem_chave = conn.execute(
        "SELECT COUNT(*) FROM fato_atendimento f"
        "  LEFT JOIN dim_faixa_etaria fe ON fe.sk_faixa_etaria = f.sk_faixa_etaria"
        "  LEFT JOIN dim_faixa_imc fi ON fi.sk_faixa_imc = f.sk_faixa_imc"
        "  LEFT JOIN dim_cid10 c ON c.sk_cid = f.sk_cid_principal"
        "  LEFT JOIN dim_medicamento m ON m.sk_medicamento = f.sk_medicamento"
        "  LEFT JOIN dim_status s ON s.sk_status = f.sk_status"
        "  LEFT JOIN dim_tempo t ON t.sk_tempo = f.sk_tempo"
        " WHERE fe.sk_faixa_etaria IS NULL OR fi.sk_faixa_imc IS NULL OR c.sk_cid IS NULL"
        "    OR m.sk_medicamento IS NULL OR s.sk_status IS NULL OR t.sk_tempo IS NULL").fetchone()[0]
    sem_chave += conn.execute(
        "SELECT COUNT(*) FROM fato_reacao_adversa r"
        "  LEFT JOIN fato_atendimento f ON f.sk_atendimento = r.sk_atendimento"
        "  LEFT JOIN dim_reacao_adversa d ON d.sk_reacao = r.sk_reacao"
        "  LEFT JOIN dim_medicamento m ON m.sk_medicamento = r.sk_medicamento"
        " WHERE f.sk_atendimento IS NULL OR d.sk_reacao IS NULL OR m.sk_medicamento IS NULL").fetchone()[0]
    fora_de_ordem = conn.execute("SELECT COUNT(*) FROM fato_atendimento WHERE dias_observados < 0").fetchone()[0]
    # sk_tempo é aaaammdd (0 = não informado): a ordem numérica é a ordem das datas
    fora_de_ordem += conn.execute(
        "SELECT COUNT(*) FROM fato_reacao_adversa r JOIN fato_atendimento f ON f.sk_atendimento = r.sk_atendimento"
        " WHERE r.sk_tempo_inicio_reacao <> 0"
        "   AND (r.sk_tempo_inicio_reacao < r.sk_tempo_inicio_medicamento OR r.sk_tempo_inicio_reacao > f.sk_tempo)"
    ).fetchone()[0]
    sem_paciente = conn.execute(
        "SELECT COUNT(*) FROM fato_atendimento f LEFT JOIN dim_paciente p ON p.sk_paciente = f.sk_paciente"
        " WHERE p.sk_paciente IS NULL").fetchone()[0]
    return [
        {"verificacao": "Chaves de dimensão sem correspondência", "n": sem_chave},
        {"verificacao": "Datas fora de ordem (início, atendimento, reação)", "n": fora_de_ordem},
        {"verificacao": "Atendimentos sem paciente na dimensão", "n": sem_paciente},
    ]


def qualidade(conn: sqlite3.Connection) -> dict:
    garantir_tabelas_carga(conn)
    cargas = [_resumo_carga(c, _rejeitadas(conn, c["id"])) for c in conn.execute(
        "SELECT * FROM carga WHERE hospital_id = ? ORDER BY id DESC LIMIT 50", (HOSPITAL_ID,))]
    n_cargas = conn.execute("SELECT COUNT(*) FROM carga WHERE hospital_id = ?", (HOSPITAL_ID,)).fetchone()[0]
    base = conn.execute("SELECT COUNT(*), COUNT(DISTINCT sk_paciente) FROM fato_atendimento").fetchone()
    return {
        "cargas": cargas,
        "n_cargas": n_cargas,
        "integridade": integridade(conn),
        "base": {"n_atendimentos": base[0], "n_pacientes": base[1]},
        "motivos": [{"motivo": m, "rotulo": r} for m, r in MOTIVOS.items()],
    }
