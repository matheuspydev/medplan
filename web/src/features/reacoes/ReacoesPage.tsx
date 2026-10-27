/**
 * Reações adversas: o que foi relatado, com que gravidade, quanto tempo depois do início e quantas
 * vezes levou a parar o medicamento. Valem os filtros globais e, só nesta tela, medicamento e linha
 * de tratamento. O painel de peso por faixa de IMC tem o próprio seletor de medicamento.
 */
import { useState } from 'react';
import { obterPesoPorImc, obterResumoReacoes } from '../../api/client';
import { useCatalogo } from '../../api/referencias';
import type { LinhaTratamento, ProporcaoPainel, ResumoReacoes } from '../../api/types';
import { useFiltros } from '../../app/filtros';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { BarrasHorizontais } from '../../components/BarrasHorizontais';
import { EstadoApi } from '../../components/EstadoApi';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { MapaCalor } from '../../components/MapaCalor';
import { PainelMedicao } from '../../components/PainelMedicao';
import { formatarInteiro, formatarMedianaDias, inicialMaiuscula } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './reacoes.css';

const LINHAS: { valor: LinhaTratamento; rotulo: string }[] = [
  { valor: '1', rotulo: '1ª linha' },
  { valor: '2', rotulo: '2ª linha' },
  { valor: '3+', rotulo: '3ª linha ou mais' },
];

export default function ReacoesPage() {
  const catalogo = useCatalogo();
  const { filtros } = useFiltros();
  const [medicamento, setMedicamento] = useState<number | null>(null);
  const [linha, setLinha] = useState<LinhaTratamento | null>(null);
  const entrada = { filtros, medicamento_id: medicamento ?? undefined, linha: linha ?? undefined };
  const estado = useApi((signal) => obterResumoReacoes(entrada, signal), JSON.stringify(entrada));
  const medicamentos = [...(catalogo?.referencias.medicamentos ?? [])].sort((a, b) => a.principio_ativo.localeCompare(b.principio_ativo, 'pt-BR'));

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Reações adversas</h1>
          <p className="cabecalho-pagina__texto">
            O que foi registrado, com que gravidade, quanto tempo depois do início e quantas vezes levou a parar o medicamento.
          </p>
        </div>
        <AvisoNaoPrescreve />
      </header>

      <PainelMedicao titulo="Filtrar reações" subtitulo="Além dos filtros do topo, só nesta tela:">
        <div className="reacoes__filtros">
          <label className="painel-filtros__campo">
            <span>Medicamento</span>
            <select className="controle-texto" value={medicamento ?? ''} onChange={(e) => setMedicamento(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Todos</option>
              {medicamentos.map((m) => (
                <option key={m.id} value={m.id}>
                  {inicialMaiuscula(m.principio_ativo)}
                </option>
              ))}
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Linha de tratamento</span>
            <select className="controle-texto" value={linha ?? ''} onChange={(e) => setLinha((e.target.value || null) as LinhaTratamento | null)}>
              <option value="">Todas</option>
              {LINHAS.map((l) => (
                <option key={l.valor} value={l.valor}>
                  {l.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="texto-apoio">Recortes pequenos deixam de mostrar percentual quando o n fica abaixo do mínimo.</p>
      </PainelMedicao>

      <EstadoApi estado={estado} rotulo="Carregando reações…">
        {(r) => <Conteudo r={r} />}
      </EstadoApi>

      <PesoPorImc />
    </div>
  );
}

function Conteudo({ r }: { r: ResumoReacoes }) {
  const c = r.contagens;
  const nMinimo = r.n_minimo;
  const maiorDias = Math.max(1, ...r.dias_por_faixa.map((d) => d.n));

  return (
    <>
      <div className="grade-indicadores">
        <div className="indicador">
          <div className="indicador__rotulo">Reações registradas</div>
          <div className="indicador__valor">{formatarInteiro(c.n_reacoes)}</div>
          <div className="indicador__detalhe">em {formatarInteiro(c.n_tratamentos)} tratamentos no recorte</div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Tratamentos com ao menos uma reação</div>
          <div className="reacoes__leitura">
            <LeituraProporcao p={c.tratamentos_com_reacao} nMinimo={nMinimo} tamanho="destaque" grafico="nenhum" />
          </div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Levaram à descontinuação</div>
          <div className="reacoes__leitura">
            <LeituraProporcao p={c.levaram_descontinuacao} nMinimo={nMinimo} tamanho="destaque" grafico="nenhum" />
          </div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Mediana até o início</div>
          <div className="indicador__valor">{c.dias_ate_inicio.mediana === null ? '—' : formatarMedianaDias(c.dias_ate_inicio.mediana)}</div>
          <div className="indicador__detalhe">
            n={formatarInteiro(c.dias_ate_inicio.n)} reações com data
            {c.dias_ate_inicio.q1 !== null && c.dias_ate_inicio.q3 !== null
              ? `, IIQ ${formatarMedianaDias(c.dias_ate_inicio.q1)} a ${formatarMedianaDias(c.dias_ate_inicio.q3)}`
              : ''}
          </div>
        </div>
      </div>

      <div className="grade-cartoes">
        <PainelMedicao titulo="Termos mais frequentes" subtitulo="nº de reações, agrupadas por sistema (SOC)">
          {r.por_soc.length === 0 && <p className="texto-apoio">Nenhuma reação no recorte.</p>}
          {r.por_soc.map((g) => (
            <div key={g.soc} className="reacoes__soc">
              <p className="reacoes__soc-titulo">
                <span>{g.soc}</span>
                <span className="texto-secundario">{formatarInteiro(g.n)} reações</span>
              </p>
              <BarrasHorizontais rotuloAcessivel={`Reações em ${g.soc}`} itens={g.termos.map((t) => ({ chave: t.termo, rotulo: t.termo, valor: t.n }))} />
            </div>
          ))}
        </PainelMedicao>

        <div className="reacoes__coluna">
          <PainelMedicao titulo="Gravidade" subtitulo={`sobre ${formatarInteiro(c.n_reacoes)} reações`}>
            {r.gravidade.map((g) => (
              <div key={g.gravidade} className="linha-leitura">
                <span>{g.rotulo}</span>
                <LeituraProporcao p={g} nMinimo={nMinimo} />
              </div>
            ))}
          </PainelMedicao>
          <PainelMedicao titulo="Levou à descontinuação, por gravidade" subtitulo="sobre as reações de cada gravidade">
            {r.descontinuacao_por_gravidade.map((g) => (
              <div key={g.gravidade} className="linha-leitura">
                <span>{g.rotulo}</span>
                <LeituraProporcao p={g} nMinimo={nMinimo} />
              </div>
            ))}
          </PainelMedicao>
          <PainelMedicao titulo="Dias até o início" subtitulo="nº de reações por intervalo desde o início do tratamento">
            <BarrasHorizontais rotuloAcessivel="Reações por dias até o início" itens={r.dias_por_faixa.map((d) => ({ chave: d.rotulo, rotulo: d.rotulo, valor: d.n }))} />
            <span className="sr-only">Maior intervalo: {formatarInteiro(maiorDias)} reações.</span>
          </PainelMedicao>
        </div>
      </div>

      <ReacaoPorMedicamento r={r} />
    </>
  );
}

function ReacaoPorMedicamento({ r }: { r: ResumoReacoes }) {
  const [sel, setSel] = useState<[number, number] | null>(null);
  const cruz = r.reacao_x_medicamento;
  const maior = Math.max(1, ...cruz.linhas.flatMap((l) => l.celulas.map((c) => c.n_tratamentos_com_reacao)));
  const valido = sel && cruz.linhas[sel[0]]?.celulas[sel[1]] ? sel : null;
  const celula: ProporcaoPainel | null = valido ? cruz.linhas[valido[0]].celulas[valido[1]] : null;

  return (
    <PainelMedicao titulo="Reação × medicamento" subtitulo="nº de tratamentos com a reação · clique numa célula para ver a taxa com IC">
      {cruz.linhas.length === 0 ? (
        <p className="texto-apoio">Nenhuma reação no recorte.</p>
      ) : (
        <>
          <MapaCalor
            legenda="Tratamentos com cada reação, por medicamento"
            colunas={cruz.medicamentos.map((m) => inicialMaiuscula(m.principio_ativo))}
            legendaEscala={['menos', 'mais tratamentos']}
            linhas={cruz.linhas.map((l, i) => ({
              rotulo: l.termo,
              celulas: l.celulas.map((c, j) => ({
                valor: c.n_tratamentos_com_reacao,
                intensidade: c.n_tratamentos_com_reacao / maior,
                selecionada: valido?.[0] === i && valido?.[1] === j,
                rotuloAcessivel: `${l.termo} com ${inicialMaiuscula(cruz.medicamentos[j].principio_ativo)}: ${formatarInteiro(c.n_tratamentos_com_reacao)} tratamentos`,
                onSelecionar: () => setSel([i, j]),
              })),
            }))}
          />
          <div className="classe-grupo__detalhe" aria-live="polite">
            {celula && valido ? (
              <>
                <span className="classe-grupo__selecao">
                  {inicialMaiuscula(cruz.medicamentos[valido[1]].principio_ativo)} × {cruz.linhas[valido[0]].termo}
                </span>
                <LeituraProporcao p={celula} nMinimo={r.n_minimo} />
              </>
            ) : (
              <span className="texto-apoio">Escolha uma célula para ver a taxa com o intervalo de confiança.</span>
            )}
          </div>
          <p className="texto-apoio">
            Contagens absolutas: medicamentos mais usados acumulam mais registros. A taxa usa como denominador os tratamentos do medicamento no
            recorte. O filtro de medicamento desta tela não se aplica a este cruzamento.
          </p>
        </>
      )}
    </PainelMedicao>
  );
}

function PesoPorImc() {
  const catalogo = useCatalogo();
  const { filtros } = useFiltros();
  const medicamentos = [...(catalogo?.referencias.medicamentos ?? [])].sort((a, b) => a.principio_ativo.localeCompare(b.principio_ativo, 'pt-BR'));
  const [medicamento, setMedicamento] = useState<number | null>(null);
  const id = medicamento ?? medicamentos[0]?.id ?? null;
  const estado = useApi(id === null ? null : (signal) => obterPesoPorImc({ medicamento_id: id, filtros }, signal), `${id}|${JSON.stringify(filtros)}`);

  return (
    <PainelMedicao
      titulo="Alteração de peso por faixa de IMC"
      subtitulo="Tratamentos com ganho ou perda de peso relatados, sobre os tratamentos de cada faixa de IMC no início."
      acoes={
        <label className="painel-filtros__campo reacoes__seletor-peso">
          <span className="sr-only">Medicamento do painel de peso</span>
          <select className="controle-texto" value={id ?? ''} onChange={(e) => setMedicamento(Number(e.target.value))}>
            {medicamentos.map((m) => (
              <option key={m.id} value={m.id}>
                {inicialMaiuscula(m.principio_ativo)}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <EstadoApi estado={estado} rotulo="Carregando peso por IMC…">
        {(p) => (
          <>
            <div className="peso-imc" role="table" aria-label={`Ganho e perda de peso com ${inicialMaiuscula(p.medicamento.principio_ativo)} por faixa de IMC`}>
              <div className="peso-imc__linha peso-imc__linha--cabecalho" role="row">
                <span role="columnheader">Faixa de IMC</span>
                <span role="columnheader">Ganho de peso</span>
                <span role="columnheader">Perda de peso</span>
              </div>
              {p.linhas.map((l) => (
                <div key={l.rotulo} className="peso-imc__linha" role="row">
                  <span role="rowheader">{l.rotulo}</span>
                  <span role="cell">
                    <LeituraProporcao p={l.ganho_de_peso} nMinimo={p.n_minimo} />
                  </span>
                  <span role="cell">
                    <LeituraProporcao p={l.perda_de_peso} nMinimo={p.n_minimo} />
                  </span>
                </div>
              ))}
            </div>
            <p className="texto-apoio">Ausência de dado não é evidência de que seja pior. Faixas com poucos tratamentos não mostram percentual.</p>
          </>
        )}
      </EstadoApi>
    </PainelMedicao>
  );
}
