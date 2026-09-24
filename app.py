"""Protótipo de validação clínica — fase 0.

    python -m streamlit run app.py

Descartável por design. O objetivo desta tela não é ser bonita: é permitir que a
médica olhe a lógica de coorte e diga onde ela está errada, antes de existir
FastAPI, React ou qualquer modelo treinado.
"""

from __future__ import annotations

import streamlit as st

from medplan import db, engine
from medplan.matching import PerfilAlvo
from medplan.stats import formatar_taxa

st.set_page_config(page_title="MedPlan — apoio à decisão (protótipo)", layout="wide")

ROTULO_MOTIVO = {
    "desc_reacao_adversa": "reação adversa",
    "desc_ineficacia": "ineficácia",
    "desc_nao_adesao": "não adesão",
    "desc_outro": "outro motivo",
}


def conectar():
    # Sem @st.cache_resource de propósito: o Streamlit roda cada rerun numa
    # thread diferente, e uma conexão SQLite guardada em cache estoura
    # "created in a thread can only be used in that same thread" no primeiro
    # clique do usuário. Abrir por rerun é barato e não tem esse pé de coelho.
    if not db.banco_existe():
        st.error(
            "Banco do protótipo não encontrado. Rode primeiro:\n\n"
            "    python -m medplan.bootstrap"
        )
        st.stop()
    return db.conectar()


@st.cache_data
def carregar_opcoes():
    """Códigos como valor, rótulo via dicionário — nada de tupla no widget."""
    conn = conectar()
    diagnosticos = [
        r["codigo"]
        for r in conn.execute(
            "SELECT codigo FROM cid10 WHERE grupo LIKE 'F%' ORDER BY codigo"
        )
    ]
    faixas = [
        r["codigo"]
        for r in conn.execute("SELECT codigo FROM faixa_etaria ORDER BY ordem")
    ]
    todos_cid = [r["codigo"] for r in conn.execute("SELECT codigo FROM cid10 ORDER BY codigo")]
    rotulos = {
        r["codigo"]: f"{r['codigo']} — {r['descricao']}"
        for r in conn.execute("SELECT codigo, descricao FROM cid10")
    }
    rotulos.update(
        {r["codigo"]: r["rotulo"] for r in conn.execute("SELECT codigo, rotulo FROM faixa_etaria")}
    )
    return diagnosticos, faixas, todos_cid, rotulos


conn = conectar()
diagnosticos, faixas, todos_cid, rotulos = carregar_opcoes()

# =============================================================================
# Cabeçalho
# =============================================================================
st.title("Apoio à decisão — tolerabilidade em psiquiatria")

st.error(
    "**Protótipo com dados sintéticos.** Todos os números desta tela vêm de um "
    "gerador aleatório. Não representam pacientes reais nem tolerabilidade real "
    "de nenhum medicamento. Servem apenas para validar a lógica de análise.",
    icon="⚠️",
)
st.warning(
    "**Este sistema não prescreve.** Ele mostra o que aconteceu com pacientes de "
    "perfil semelhante nesta base. A indicação, a dose e a decisão final são do "
    "médico responsável.",
    icon="🩺",
)

# =============================================================================
# Entrada do perfil
# =============================================================================
with st.sidebar:
    st.header("Perfil do paciente")
    dx = st.selectbox("Diagnóstico principal (CID-10)", diagnosticos,
                      format_func=rotulos.get, index=6)
    sexo = st.selectbox("Sexo", ["feminino", "masculino", "intersexo", "nao_informado"])
    faixa = st.selectbox("Faixa etária", faixas, format_func=rotulos.get, index=2)
    comorb = st.multiselect("Comorbidades (CID-10)", todos_cid,
                            format_func=rotulos.get)

    st.divider()
    st.header("Parâmetros da análise")
    horizonte = st.slider("Horizonte de avaliação (dias)", 28, 180, 84, step=7,
                          help="84 dias = 12 semanas.")
    n_minimo = st.slider("n mínimo para exibir uma taxa", 5, 100, 20,
                         help="Abaixo disso o sistema diz 'dados insuficientes' "
                              "em vez de mostrar um percentual sem lastro.")

alvo = PerfilAlvo(
    hospital_id=1,
    sexo=sexo,
    faixa_etaria_cod=faixa,
    cid10_principal=dx,
    comorbidades=tuple(comorb),
)

rec = engine.recomendar(conn, alvo, n_minimo=n_minimo, horizonte_dias=horizonte)

# =============================================================================
# Escada de coorte
# =============================================================================
st.subheader("Como esta coorte foi montada")
st.caption(
    "O sistema começa exigindo o perfil completo e afrouxa um critério por vez até "
    "algum medicamento atingir o n mínimo. Onde ele parou está marcado abaixo."
)

degraus = engine.diagnosticar_escada(conn, alvo, horizonte_dias=horizonte)
st.dataframe(
    [
        {
            "": "◀ parou aqui" if d.nivel.ordem == rec.nivel.ordem else "",
            "Nível": d.nivel.ordem,
            "Critério": d.nivel.rotulo,
            "Perfis": d.n_perfis,
            "Medicamentos": d.n_medicamentos,
            "Maior n avaliável": d.melhor_n_avaliavel,
        }
        for d in degraus
    ],
    hide_index=True,
    width="stretch",
)

for aviso in rec.avisos:
    st.info(aviso, icon="ℹ️")

st.divider()

# =============================================================================
# Recomendações
# =============================================================================
st.subheader(f"Permanência em tratamento até {rec.horizonte_dias} dias")

if rec.dados_insuficientes:
    st.warning(
        f"**Dados insuficientes.** Nenhum medicamento atingiu n={rec.n_minimo} "
        "para este perfil, mesmo depois de afrouxar todos os critérios. "
        "O sistema não vai exibir percentual sem lastro.",
        icon="🚫",
    )
else:
    st.caption(
        f"Coorte: {rec.n_perfis} perfis. Ordenado pelo limite inferior do IC de 95%, "
        "não pela taxa pontual — assim uma amostra pequena com taxa alta não passa "
        "à frente de uma amostra grande e consistente."
    )
    st.dataframe(
        [
            {
                "Medicamento": l.principio_ativo,
                "Classe": l.classe_terapeutica,
                "Permanência": formatar_taxa(
                    l.resultado.taxa_permanencia,
                    l.resultado.ic_permanencia,
                    l.resultado.n_avaliavel,
                ),
                "Descontinuou por reação adversa": (
                    f"{l.resultado.taxa_motivo('desc_reacao_adversa'):.0%}"
                    f" ({l.resultado.eventos_por_motivo.get('desc_reacao_adversa', 0)}"
                    f"/{l.resultado.n_avaliavel})"
                ),
                "Censurados": l.resultado.n_censurado,
            }
            for l in rec.recomendados
        ],
        hide_index=True,
        width="stretch",
    )

    st.markdown("#### Detalhe por medicamento")
    for l in rec.recomendados:
        r = l.resultado
        rotulo = (
            f"{l.principio_ativo} — "
            f"{formatar_taxa(r.taxa_permanencia, r.ic_permanencia, r.n_avaliavel)}"
        )
        with st.expander(rotulo):
            st.markdown(f"ATC `{l.codigo_atc}` · {l.classe_terapeutica}")

            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("**Por que este número**")
                st.markdown(
                    f"- {r.n_retidos} de {r.n_avaliavel} tratamentos seguiam ativos "
                    f"aos {r.horizonte_dias} dias\n"
                    f"- {r.n_censurado} ficaram de fora por seguimento curto sem "
                    f"desfecho conhecido\n"
                    f"- {l.n_episodios} tratamentos com este medicamento na coorte"
                )
                if r.eventos_por_motivo:
                    st.markdown("**Motivos de descontinuação**")
                    st.markdown(
                        "\n".join(
                            f"- {ROTULO_MOTIVO.get(m, m)}: {n} de {r.n_avaliavel}"
                            f" ({n / r.n_avaliavel:.0%})"
                            for m, n in sorted(
                                r.eventos_por_motivo.items(),
                                key=lambda kv: kv[1], reverse=True
                            )
                        )
                    )
            with col_b:
                st.markdown("**Reações adversas registradas**")
                if not l.reacoes:
                    st.caption("Nenhuma reação registrada nesta coorte.")
                else:
                    st.dataframe(
                        [
                            {
                                "Reação": ra.termo,
                                "Frequência": f"{ra.proporcao:.0%} ({ra.n}/{ra.n_base})",
                                "IC95%": f"{ra.ic[0]:.0%}–{ra.ic[1]:.0%}",
                                "Mediana (dias)": (
                                    f"{ra.mediana_dias_ate_inicio:.0f}"
                                    if ra.mediana_dias_ate_inicio is not None else "—"
                                ),
                                "Levou a parar": ra.n_levou_descontinuacao,
                            }
                            for ra in l.reacoes
                        ],
                        hide_index=True,
                        width="stretch",
                    )

# =============================================================================
# Transparência: o que ficou de fora
# =============================================================================
if rec.sem_dados_suficientes:
    st.divider()
    st.subheader("Sem dados suficientes nesta coorte")
    st.caption(
        f"Estes medicamentos aparecem na base para perfis semelhantes, mas não "
        f"atingiram n={rec.n_minimo}. Listados sem percentual, de propósito — "
        "ausência de dado não é evidência de que sejam piores."
    )
    st.dataframe(
        [
            {
                "Medicamento": l.principio_ativo,
                "Classe": l.classe_terapeutica,
                "n avaliável": l.resultado.n_avaliavel,
                "Censurados": l.resultado.n_censurado,
                "Tratamentos na coorte": l.n_episodios,
            }
            for l in rec.sem_dados_suficientes
        ],
        hide_index=True,
        width="stretch",
    )
