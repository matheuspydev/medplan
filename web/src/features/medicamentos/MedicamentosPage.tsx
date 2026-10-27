/**
 * Medicamentos: grade dos princípios ativos do catálogo (ordem alfabética, nenhum destaque) e a
 * ficha do escolhido no recorte dos filtros globais: permanência, contabilidade, curva de
 * permanência, quem recebe, permanência por linha de tratamento e reações.
 */
import { Columns2 } from 'lucide-react';
import { useState } from 'react';
import { obterFichaMedicamento, obterVisaoGeral } from '../../api/client';
import { useCatalogo } from '../../api/referencias';
import type { FichaMedicamento } from '../../api/types';
import { useFiltros } from '../../app/filtros';
import { LinkRota } from '../../app/rotas';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { AvisoViesIndicacao } from '../../components/AvisoViesIndicacao';
import { CurvaPermanencia } from '../../components/CurvaPermanencia';
import { EstadoApi } from '../../components/EstadoApi';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { MapaCalor } from '../../components/MapaCalor';
import { PainelMedicao } from '../../components/PainelMedicao';
import { AVISO_VIES_INDICACAO } from '../metodologia/ConteudoMetodologia';
import { formatarHorizonte, formatarInteiro, inicialMaiuscula, plural } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './medicamentos.css';

export default function MedicamentosPage() {
  const catalogo = useCatalogo();
  const { filtros } = useFiltros();
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const chaveFiltros = JSON.stringify(filtros);
  // Contagens da grade: tratamentos por medicamento no recorte (vêm da visão geral, sem cálculo aqui).
  const volume = useApi((signal) => obterVisaoGeral({ filtros, dividir_por: 'faixa' }, signal), chaveFiltros);
  const ficha = useApi(
    selecionado === null ? null : (signal) => obterFichaMedicamento({ medicamento_id: selecionado, filtros }, signal),
    `${selecionado}|${chaveFiltros}`,
  );
  const tratamentos = new Map(volume.dados?.medicamentos.map((m) => [m.medicamento_id, m.n_tratamentos]) ?? []);
  const medicamentos = [...(catalogo?.referencias.medicamentos ?? [])].sort((a, b) => a.principio_ativo.localeCompare(b.principio_ativo, 'pt-BR'));

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Medicamentos</h1>
          <p className="cabecalho-pagina__texto">
            Por princípio ativo, no recorte dos filtros ativos, em ordem alfabética. A lista vem da tabela de referência ATC; um medicamento
            passa a ter dados quando aparece num atendimento.
          </p>
        </div>
        <div className="cabecalho-pagina__acoes">
          <AvisoNaoPrescreve />
          <LinkRota para="/medicamentos/comparar" className="botao botao--secundario">
            <Columns2 size={16} aria-hidden="true" />
            Comparar
          </LinkRota>
        </div>
      </header>

      <div className="grade-medicamentos" role="group" aria-label="Escolher medicamento">
        {medicamentos.map((m) => (
          <button
            key={m.id}
            type="button"
            className="cartao-medicamento"
            aria-pressed={selecionado === m.id}
            onClick={() => setSelecionado(m.id)}
          >
            <span className="cartao-medicamento__nome">{inicialMaiuscula(m.principio_ativo)}</span>
            <span className="cartao-medicamento__classe">{m.classe_terapeutica}</span>
            <span className="cartao-medicamento__rodape">
              <span className="mono">{m.codigo_atc}</span>
              <span>{tratamentos.has(m.id) ? plural(tratamentos.get(m.id)!, 'tratamento', 'tratamentos') : 'sem tratamentos no recorte'}</span>
            </span>
          </button>
        ))}
      </div>

      {selecionado === null ? (
        <p className="texto-apoio">Escolha um medicamento para ver a ficha.</p>
      ) : (
        <EstadoApi estado={ficha} rotulo="Carregando a ficha do medicamento…">
          {(f) => <Ficha f={f} />}
        </EstadoApi>
      )}

      <AvisoViesIndicacao texto={AVISO_VIES_INDICACAO} />
    </div>
  );
}

function Ficha({ f }: { f: FichaMedicamento }) {
  const c = f.contabilidade;
  const nMinimo = f.n_minimo;
  const reacaoAdversa = f.descontinuacao_por_motivo.find((m) => m.motivo === 'desc_reacao_adversa')!;
  const maiorRecebe = Math.max(1, ...f.recebem.linhas.flatMap((l) => l.n_por_sexo));
  const nome = inicialMaiuscula(f.medicamento.principio_ativo);

  return (
    <PainelMedicao
      titulo={nome}
      subtitulo={
        <>
          {f.medicamento.classe_terapeutica} · ATC <span className="mono">{f.medicamento.codigo_atc}</span> · {plural(c.n_tratamentos, 'tratamento', 'tratamentos')}{' '}
          no recorte
        </>
      }
      acoes={
        <LinkRota para="/medicamentos/comparar" className="botao botao--secundario botao--pequeno">
          Comparar com outro
        </LinkRota>
      }
      className="ficha-medicamento"
    >
      <div className="grade-indicadores">
        <div className="indicador">
          <div className="indicador__rotulo">Permanência em {formatarHorizonte(f.horizonte_dias)}</div>
          <div className="ficha-medicamento__leitura">
            <LeituraProporcao p={f.permanencia} nMinimo={nMinimo} tamanho="destaque" grafico="tabela" />
          </div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Contabilidade</div>
          <div className="ficha-medicamento__contas">
            <span>
              <span className="indicador__detalhe">Retidos</span>
              <strong>{formatarInteiro(c.n_retidos)}</strong>
            </span>
            <span>
              <span className="indicador__detalhe">Descontinuados</span>
              <strong>{formatarInteiro(c.n_descontinuados)}</strong>
            </span>
            <span>
              <span className="indicador__detalhe">Censurados</span>
              <strong className="texto-secundario">{formatarInteiro(c.n_censurado)}</strong>
            </span>
          </div>
          <div className="indicador__detalhe">Censurados saem do denominador.</div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Descontinuação por reação adversa</div>
          <div className="ficha-medicamento__leitura">
            <LeituraProporcao p={reacaoAdversa} nMinimo={nMinimo} tamanho="destaque" grafico="tabela" />
          </div>
        </div>
      </div>

      <div className="grade-cartoes ficha-medicamento__graficos">
        <section aria-labelledby="curva-titulo">
          <h3 id="curva-titulo" className="ficha-medicamento__titulo">
            Permanência ao longo do tempo
          </h3>
          <p className="texto-apoio">Estimador de Kaplan-Meier · faixa = IC95%</p>
          {f.curva ? (
            <CurvaPermanencia
              series={[{ nome, pontos: f.curva.pontos, diasCensura: f.curva.dias_censura }]}
              ateDias={f.curva.ate_dias}
              horizonteDias={f.horizonte_dias}
              rotulo={`Curva de permanência de ${nome} até ${formatarHorizonte(f.curva.ate_dias)}, com ${plural(c.n_tratamentos, 'tratamento', 'tratamentos')}. Os valores com n e IC estão nos cartões acima.`}
            />
          ) : (
            <p className="texto-apoio">Curva não exibida: menos de {formatarInteiro(nMinimo)} tratamentos no recorte.</p>
          )}
          <p className="texto-apoio">Traços verticais: tratamentos censurados. A faixa alarga quando restam poucos tratamentos em acompanhamento.</p>
        </section>
        <section aria-labelledby="recebem-titulo">
          <h3 id="recebem-titulo" className="ficha-medicamento__titulo">
            Quem mais recebe
          </h3>
          <p className="texto-apoio">tratamentos por faixa etária e sexo</p>
          <MapaCalor
            legenda={`Tratamentos com ${nome} por faixa etária e sexo`}
            colunas={f.recebem.sexos.map((s) => s.rotulo)}
            legendaEscala={['menos', 'mais tratamentos']}
            linhas={f.recebem.linhas.map((l) => ({
              rotulo: l.rotulo,
              celulas: l.n_por_sexo.map((n) => ({ valor: n, intensidade: n / maiorRecebe })),
            }))}
          />
        </section>
      </div>

      <section className="ficha-medicamento__secao" aria-labelledby="linhas-titulo">
        <h3 id="linhas-titulo" className="ficha-medicamento__titulo">
          Permanência por linha de tratamento
        </h3>
        <p className="texto-apoio">em {formatarHorizonte(f.horizonte_dias)} · 1ª linha = primeiro medicamento tentado pelo paciente</p>
        {f.por_linha.map((l) => (
          <div key={l.linha} className="linha-leitura">
            <span>{l.rotulo}</span>
            <LeituraProporcao p={l.permanencia} nMinimo={nMinimo} />
          </div>
        ))}
        <p className="texto-apoio">Quem chega à 2ª ou 3ª linha costuma ter casos mais difíceis: diferenças entre linhas também refletem isso.</p>
      </section>

      <section className="ficha-medicamento__secao" aria-labelledby="reacoes-titulo">
        <h3 id="reacoes-titulo" className="ficha-medicamento__titulo">
          Reações mais frequentes
        </h3>
        <p className="texto-apoio">tratamentos com a reação, sobre {plural(c.n_tratamentos, 'tratamento', 'tratamentos')} no recorte</p>
        {f.reacoes.length === 0 ? (
          <p className="texto-apoio">Nenhuma reação registrada para este medicamento no recorte.</p>
        ) : (
          f.reacoes.map((r) => (
            <div key={r.reacao_adversa_id} className="linha-leitura">
              <span>
                {r.termo} <span className="texto-secundario">· {r.soc}</span>
              </span>
              <LeituraProporcao p={r} nMinimo={nMinimo} />
            </div>
          ))
        )}
      </section>
    </PainelMedicao>
  );
}
