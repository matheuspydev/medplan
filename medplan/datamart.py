"""Data Mart do protótipo: dimensões, chaves substitutas e leitura dos fatos.

O modelo é o de db/modelagem/datamart.dbml (grão = atendimento). Aqui ficam:

- a carga das dimensões a partir dos catálogos do protótipo (o "de-para" da carga:
  o código de mercado — CID, ATC, termo — vira a chave substituta da dimensão);
- as consultas de chave substituta usadas por quem grava fatos;
- a leitura dos fatos já resolvida em códigos do protótipo, agrupada em tratamentos,
  que é o que as telas de BI consomem.

Duas convenções do dicionário de dados que este módulo aplica:
- data não informada aponta para a linha 0 de dim_tempo;
- faixa de IMC não informada aponta para a linha "Não informado" de dim_faixa_imc.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date

from . import rotulos
from .stats import STATUS_CENSURA, Episodio

SK_TEMPO_NAO_INFORMADO = 0
IMC_NAO_INFORMADO = "Não informado"

# dim_paciente.sexo é char(1). O banco do protótipo tem quatro valores; a letra inicial
# de cada um. Pendência registrada no dicionário: confirmar com a médica.
SEXO_DIM = {"feminino": "F", "masculino": "M", "intersexo": "I", "nao_informado": "N"}
SEXO_DO_DIM = {v: k for k, v in SEXO_DIM.items()}


def tabagista(tabagismo: str) -> bool:
    """fato_atendimento.tabagista é binário: só o tabagismo "atual" conta como sim."""
    return tabagismo == "atual"


# =============================================================================
# Dimensões
# =============================================================================
def carregar_dimensoes(conn: sqlite3.Connection) -> None:
    """Copia os catálogos do protótipo para as dimensões. Idempotente: só acrescenta o que falta."""
    conn.execute(
        "INSERT OR IGNORE INTO dim_tempo (sk_tempo, data, mes, trimestre, ano) VALUES (?, NULL, NULL, NULL, NULL)",
        (SK_TEMPO_NAO_INFORMADO,),
    )
    conn.execute(
        "INSERT INTO dim_faixa_etaria (descricao, idade_min, idade_max) "
        "SELECT f.rotulo, f.idade_min, f.idade_max FROM faixa_etaria f "
        " WHERE NOT EXISTS (SELECT 1 FROM dim_faixa_etaria d WHERE d.descricao = f.rotulo) ORDER BY f.ordem"
    )
    conn.execute(
        "INSERT INTO dim_faixa_imc (descricao, imc_min, imc_max) "
        "SELECT f.rotulo, f.imc_min, f.imc_max FROM faixa_imc f "
        " WHERE NOT EXISTS (SELECT 1 FROM dim_faixa_imc d WHERE d.descricao = f.rotulo) ORDER BY f.ordem"
    )
    conn.execute(
        "INSERT INTO dim_faixa_imc (descricao, imc_min, imc_max) SELECT ?, NULL, NULL "
        " WHERE NOT EXISTS (SELECT 1 FROM dim_faixa_imc WHERE descricao = ?)",
        (IMC_NAO_INFORMADO, IMC_NAO_INFORMADO),
    )
    conn.execute(
        "INSERT OR IGNORE INTO dim_cid10 (codigo, descricao, grupo, tipo) "
        "SELECT codigo, descricao, grupo, "
        "       CASE WHEN upper(codigo) LIKE 'F%' THEN 'psiquiatrica' ELSE 'clinica' END "
        "  FROM cid10 ORDER BY codigo"
    )
    conn.execute(
        "INSERT OR IGNORE INTO dim_medicamento (codigo_atc, principio_ativo, classe_terapeutica) "
        "SELECT codigo_atc, principio_ativo, classe_terapeutica FROM medicamento ORDER BY id"
    )
    conn.execute(
        "INSERT INTO dim_reacao_adversa (termo, soc, gravidade_padrao) "
        "SELECT r.termo, r.soc, r.gravidade_padrao FROM reacao_adversa r "
        " WHERE NOT EXISTS (SELECT 1 FROM dim_reacao_adversa d WHERE d.termo = r.termo) ORDER BY r.id"
    )
    conn.executemany(
        "INSERT OR IGNORE INTO dim_status (descricao) VALUES (?)",
        [(rotulo,) for rotulo, _grupo in rotulos.STATUS_TRATAMENTO.values()],
    )


def sk_tempo(conn: sqlite3.Connection, dia: date | None) -> int:
    """Chave aaaammdd, criando a linha da data se ainda não existir; None vira 0."""
    if dia is None:
        return SK_TEMPO_NAO_INFORMADO
    sk = dia.year * 10000 + dia.month * 100 + dia.day
    conn.execute(
        "INSERT OR IGNORE INTO dim_tempo (sk_tempo, data, mes, trimestre, ano) VALUES (?, ?, ?, ?, ?)",
        (sk, dia.isoformat(), dia.month, (dia.month - 1) // 3 + 1, dia.year),
    )
    return sk


def _sk(conn: sqlite3.Connection, sql: str, valor) -> int:
    linha = conn.execute(sql, (valor,)).fetchone()
    if linha is None:
        raise LookupError(f"valor sem correspondência na dimensão: {sql}")
    return linha[0]


def sk_paciente(conn: sqlite3.Connection, chave: str, sexo: str) -> int:
    conn.execute(
        "INSERT OR IGNORE INTO dim_paciente (codigo_pseudonimo, sexo) VALUES (?, ?)",
        (chave, SEXO_DIM[sexo]),
    )
    return _sk(conn, "SELECT sk_paciente FROM dim_paciente WHERE codigo_pseudonimo = ?", chave)


def sk_faixa_etaria(conn: sqlite3.Connection, codigo: str) -> int:
    return _sk(conn, "SELECT d.sk_faixa_etaria FROM dim_faixa_etaria d JOIN faixa_etaria f "
                     "ON f.rotulo = d.descricao WHERE f.codigo = ?", codigo)


def sk_faixa_imc(conn: sqlite3.Connection, codigo: str | None) -> int:
    if codigo is None:
        return _sk(conn, "SELECT sk_faixa_imc FROM dim_faixa_imc WHERE descricao = ?", IMC_NAO_INFORMADO)
    return _sk(conn, "SELECT d.sk_faixa_imc FROM dim_faixa_imc d JOIN faixa_imc f "
                     "ON f.rotulo = d.descricao WHERE f.codigo = ?", codigo)


def sk_cid(conn: sqlite3.Connection, codigo: str) -> int:
    return _sk(conn, "SELECT sk_cid FROM dim_cid10 WHERE codigo = ?", codigo)


def sk_medicamento(conn: sqlite3.Connection, medicamento_id: int) -> int:
    return _sk(conn, "SELECT d.sk_medicamento FROM dim_medicamento d JOIN medicamento m "
                     "ON m.codigo_atc = d.codigo_atc WHERE m.id = ?", medicamento_id)


def sk_reacao(conn: sqlite3.Connection, reacao_adversa_id: int) -> int:
    return _sk(conn, "SELECT d.sk_reacao FROM dim_reacao_adversa d JOIN reacao_adversa r "
                     "ON r.termo = d.termo WHERE r.id = ?", reacao_adversa_id)


def sk_status(conn: sqlite3.Connection, status: str) -> int:
    return _sk(conn, "SELECT sk_status FROM dim_status WHERE descricao = ?", rotulos.STATUS_TRATAMENTO[status][0])


# =============================================================================
# Leitura dos fatos, já em códigos do protótipo
# =============================================================================
_STATUS_DO_ROTULO = {rotulo: codigo for codigo, (rotulo, _grupo) in rotulos.STATUS_TRATAMENTO.items()}


@dataclass(frozen=True)
class Atendimento:
    """Uma linha de fato_atendimento, com as dimensões resolvidas em códigos do protótipo."""

    sk_atendimento: int
    chave: str
    sexo: str
    data: date
    faixa_etaria_cod: str
    faixa_imc_cod: str | None
    cid10: str
    grupo_cid: str
    medicamento_id: int
    status: str
    tabagista: bool
    qtd_comorbidades: int
    linha_tratamento: int | None
    dias_observados: int
    qtd_reacoes: int

    @property
    def data_inicio_medicamento(self) -> date:
        return date.fromordinal(self.data.toordinal() - self.dias_observados)


@dataclass(frozen=True)
class ReacaoFato:
    sk_atendimento: int
    reacao_adversa_id: int
    medicamento_id: int
    data_inicio_medicamento: date | None
    data_inicio_reacao: date | None
    dias_ate_reacao: int | None
    gravidade: str
    levou_descontinuacao: bool


@dataclass
class Tratamento:
    """Um paciente com um medicamento desde uma data de início: os atendimentos daquele tratamento.

    O perfil do tratamento (faixa, IMC, CID...) é o do atendimento mais recente; o desfecho
    também. Com ele o tratamento vira um Episodio e passa pela mesma regra de censura do motor.
    """

    chave: str
    medicamento_id: int
    data_inicio: date
    atendimentos: list[Atendimento] = field(default_factory=list)

    @property
    def ultimo(self) -> Atendimento:
        return max(self.atendimentos, key=lambda a: (a.data, a.sk_atendimento))

    @property
    def episodio(self) -> Episodio:
        u = self.ultimo
        encerrado = u.status not in STATUS_CENSURA
        return Episodio(data_inicio=self.data_inicio, status=u.status,
                        data_ultima_observacao=u.data, data_fim=u.data if encerrado else None)


def ler_atendimentos(conn: sqlite3.Connection) -> list[Atendimento]:
    sql = """
        SELECT a.sk_atendimento, p.codigo_pseudonimo, p.sexo, t.data,
               fe.codigo AS faixa_etaria_cod, fi.codigo AS faixa_imc_cod,
               c.codigo AS cid10, c.grupo AS grupo_cid, m.id AS medicamento_id,
               s.descricao AS status, a.tabagista, a.qtd_comorbidades, a.linha_tratamento,
               a.dias_observados, a.qtd_reacoes
          FROM fato_atendimento a
          JOIN dim_paciente p        ON p.sk_paciente = a.sk_paciente
          JOIN dim_tempo t           ON t.sk_tempo = a.sk_tempo
          JOIN dim_faixa_etaria dfe  ON dfe.sk_faixa_etaria = a.sk_faixa_etaria
          JOIN faixa_etaria fe       ON fe.rotulo = dfe.descricao
          JOIN dim_faixa_imc dfi     ON dfi.sk_faixa_imc = a.sk_faixa_imc
          LEFT JOIN faixa_imc fi     ON fi.rotulo = dfi.descricao
          JOIN dim_cid10 c           ON c.sk_cid = a.sk_cid_principal
          JOIN dim_medicamento dm    ON dm.sk_medicamento = a.sk_medicamento
          JOIN medicamento m         ON m.codigo_atc = dm.codigo_atc
          JOIN dim_status s          ON s.sk_status = a.sk_status
    """
    return [
        Atendimento(
            sk_atendimento=r["sk_atendimento"], chave=r["codigo_pseudonimo"], sexo=SEXO_DO_DIM[r["sexo"]],
            data=date.fromisoformat(r["data"]), faixa_etaria_cod=r["faixa_etaria_cod"],
            faixa_imc_cod=r["faixa_imc_cod"], cid10=r["cid10"], grupo_cid=r["grupo_cid"],
            medicamento_id=r["medicamento_id"], status=_STATUS_DO_ROTULO[r["status"]],
            tabagista=bool(r["tabagista"]), qtd_comorbidades=r["qtd_comorbidades"],
            linha_tratamento=r["linha_tratamento"], dias_observados=r["dias_observados"],
            qtd_reacoes=r["qtd_reacoes"],
        )
        for r in conn.execute(sql)
    ]


def ler_reacoes(conn: sqlite3.Connection) -> list[ReacaoFato]:
    sql = """
        SELECT f.sk_atendimento, r.id AS reacao_adversa_id, m.id AS medicamento_id,
               tm.data AS inicio_med, tr.data AS inicio_reacao, f.dias_ate_reacao,
               f.gravidade_observada, f.levou_descontinuacao
          FROM fato_reacao_adversa f
          JOIN dim_reacao_adversa dr ON dr.sk_reacao = f.sk_reacao
          JOIN reacao_adversa r      ON r.termo = dr.termo
          JOIN dim_medicamento dm    ON dm.sk_medicamento = f.sk_medicamento
          JOIN medicamento m         ON m.codigo_atc = dm.codigo_atc
          JOIN dim_tempo tm          ON tm.sk_tempo = f.sk_tempo_inicio_medicamento
          JOIN dim_tempo tr          ON tr.sk_tempo = f.sk_tempo_inicio_reacao
    """
    return [
        ReacaoFato(
            sk_atendimento=r["sk_atendimento"], reacao_adversa_id=r["reacao_adversa_id"],
            medicamento_id=r["medicamento_id"],
            data_inicio_medicamento=date.fromisoformat(r["inicio_med"]) if r["inicio_med"] else None,
            data_inicio_reacao=date.fromisoformat(r["inicio_reacao"]) if r["inicio_reacao"] else None,
            dias_ate_reacao=r["dias_ate_reacao"], gravidade=r["gravidade_observada"],
            levou_descontinuacao=bool(r["levou_descontinuacao"]),
        )
        for r in conn.execute(sql)
    ]


def agrupar_tratamentos(atendimentos: list[Atendimento]) -> list[Tratamento]:
    """Junta os atendimentos do mesmo paciente, medicamento e data de início."""
    tratamentos: dict[tuple[str, int, date], Tratamento] = {}
    for a in atendimentos:
        chave = (a.chave, a.medicamento_id, a.data_inicio_medicamento)
        tratamento = tratamentos.setdefault(chave, Tratamento(*chave))
        tratamento.atendimentos.append(a)
    return list(tratamentos.values())
