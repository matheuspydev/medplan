/**
 * Visão geral: panorama da base no recorte dos filtros globais. Tudo vem pronto da API
 * (POST /paineis/visao-geral); a tela não calcula, não arredonda e não reordena.
 */
import { useState } from 'react';
import { obterVisaoGeral } from '../../api/client';
import { rotuloGrupoCid } from '../../api/referencias';
import type { DivisaoGrupo, ProporcaoPainel, VisaoGeral } from '../../api/types';
import { useFiltros } from '../../app/filtros';
import { fragmentoChave, LinkRota } from '../../app/rotas';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { BarrasHorizontais } from '../../components/BarrasHorizontais';
import { EstadoApi } from '../../components/EstadoApi';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { MapaCalor } from '../../components/MapaCalor';
import { PainelMedicao } from '../../components/PainelMedicao';
import { RotuloFaixa } from '../../components/RotuloFaixa';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatarData, formatarHorizonte, formatarInteiro, inicialMaiuscula } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './visao-geral.css';

const DIVISOES: { valor: DivisaoGrupo; rotulo: string }[] = [
  { valor: 'faixa', rotulo: 'Faixa etária' },
  { valor: 'sexo', rotulo: 'Sexo' },
  { valor: 'imc', rotulo: 'Faixa de IMC' },
  { valor: 'tabagismo', rotulo: 'Tabagismo' },
];

export default function VisaoGeralPage() {
  const { filtros } = useFiltros();
  const [divisao, setDivisao] = useState<DivisaoGrupo>('faixa');
  const estado = useApi((signal) => obterVisaoGeral({ filtros, dividir_por: divisao }, signal), JSON.stringify([filtros, divisao]));

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Visão geral</h1>
          <p className="cabecalho-pagina__texto">Panorama da base de atendimentos no recorte dos filtros ativos.</p>
        </div>
        <AvisoNaoPrescreve />
      </header>
      <EstadoApi estado={estado} rotulo="Carregando a visão geral…">
        {(v) => <Conteudo v={v} divisao={divisao} onDivisao={setDivisao} />}
      </EstadoApi>
    </div>
  );
}

function Conteudo({ v, divisao, onDivisao }: { v: VisaoGeral; divisao: DivisaoGrupo; onDivisao: (d: DivisaoGrupo) => void }) {
  const { contagens: c, desfecho, n_minimo: nMinimo } = v;
  return (
    <>
      <div className="grade-indicadores">
        <Indicador rotulo="Pacientes" valor={c.n_pacientes} detalhe="chaves pseudônimas distintas" />
        <Indicador rotulo="Atendimentos" valor={c.n_atendimentos} detalhe="uma linha por consulta" />
        <Indicador rotulo="Tratamentos" valor={c.n_tratamentos} detalhe="paciente × medicamento" />
        <Indicador rotulo="Reações registradas" valor={c.n_reacoes} detalhe="relatadas nos atendimentos" />
        <Indicador rotulo="Medicamentos distintos" valor={c.n_medicamentos} detalhe="princípios ativos" />
      </div>

      <ClassePorGrupo v={v} divisao={divisao} onDivisao={onDivisao} />

      <div className="grade-cartoes">
        <PainelMedicao titulo="Diagnósticos mais frequentes" subtitulo="pacientes por CID-10 principal">
          <BarrasHorizontais
            rotuloAcessivel="Pacientes por diagnóstico principal"
            itens={v.diagnosticos.map((d) => ({
              chave: d.codigo,
              rotulo: (
                <>
                  <span className="mono">{d.codigo}</span> <span className="texto-secundario">{d.descricao}</span>
                </>
              ),
              valor: d.n_pacientes,
            }))}
          />
        </PainelMedicao>
        <PainelMedicao titulo="Medicamentos mais prescritos" subtitulo="nº de tratamentos, por volume">
          <BarrasHorizontais
            rotuloAcessivel="Tratamentos por medicamento"
            itens={v.medicamentos.slice(0, 8).map((m) => ({
              chave: m.medicamento_id,
              rotulo: (
                <>
                  {inicialMaiuscula(m.principio_ativo)} <span className="mono texto-secundario">{m.codigo_atc}</span>
                </>
              ),
              valor: m.n_tratamentos,
            }))}
          />
        </PainelMedicao>
      </div>

      <div className="grade-cartoes">
        <PainelMedicao
          titulo={`Desfecho em ${formatarHorizonte(v.horizonte_dias)}`}
          subtitulo={`${formatarInteiro(desfecho.n_tratamentos)} tratamentos · ${formatarInteiro(desfecho.n_avaliavel)} avaliáveis`}
        >
          <Empilhado desfecho={desfecho} />
          <div className="linha-leitura">
            <span>Mantido</span>
            <LeituraProporcao p={desfecho.mantido} nMinimo={nMinimo} />
          </div>
          <div className="linha-leitura">
            <span>Descontinuado</span>
            <LeituraProporcao p={desfecho.descontinuado} nMinimo={nMinimo} />
          </div>
          <div className="linha-leitura">
            <span>Censurado</span>
            <span>
              <strong className="num">{formatarInteiro(desfecho.n_censurado)}</strong> <span className="texto-secundario">tratamentos, fora do denominador</span>
            </span>
          </div>
          <p className="texto-apoio">Censurado: seguimento menor que o horizonte (em uso ou perdido de seguimento). Esses tratamentos não entram no cálculo.</p>
        </PainelMedicao>
        <PainelMedicao titulo="Motivos de descontinuação" subtitulo="entre os tratamentos descontinuados">
          {v.motivos.map((m) => (
            <div key={m.motivo} className="linha-leitura">
              <span>{m.rotulo}</span>
              <LeituraProporcao p={m} nMinimo={nMinimo} />
            </div>
          ))}
          <p className="texto-apoio">Os motivos vêm do status registrado no atendimento. "Outro" agrupa o que não se encaixa nas três categorias.</p>
        </PainelMedicao>
      </div>

      <PainelMedicao titulo="Casos registrados recentemente" acoes={<LinkRota para="/pacientes">Ver todos os pacientes</LinkRota>}>
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Faixa etária</th>
                <th>CID-10 principal</th>
                <th className="numero">Atendimentos</th>
                <th className="numero">Último atendimento</th>
              </tr>
            </thead>
            <tbody>
              {v.recentes.map((p) => (
                <tr key={p.chave_pseudonima}>
                  <td>
                    <LinkRota para="/paciente" fragmento={fragmentoChave(p.chave_pseudonima)} className="mono">
                      {p.chave_pseudonima}
                    </LinkRota>
                  </td>
                  <td>
                    <RotuloFaixa codigo={p.faixa_etaria_cod} />
                  </td>
                  <td>
                    <span className="mono">{p.cid10}</span> <span className="texto-secundario">{p.descricao_cid}</span>
                  </td>
                  <td className="numero">{formatarInteiro(p.n_atendimentos)}</td>
                  <td className="numero">{formatarData(p.ultimo_atendimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PainelMedicao>
    </>
  );
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe: string }) {
  return (
    <div className="indicador">
      <div className="indicador__rotulo">{rotulo}</div>
      <div className="indicador__valor">{formatarInteiro(valor)}</div>
      <div className="indicador__detalhe">{detalhe}</div>
    </div>
  );
}

/** Barra empilhada de contagens (mantido, descontinuado, censurado), sem percentual. */
function Empilhado({ desfecho }: { desfecho: VisaoGeral['desfecho'] }) {
  const mantidos = desfecho.mantido.suficiente ? desfecho.mantido.n : null;
  const descontinuados = desfecho.descontinuado.suficiente ? desfecho.descontinuado.n : null;
  if (mantidos === null || descontinuados === null || desfecho.n_tratamentos === 0) return null;
  const partes = [
    { nome: 'Mantido', n: mantidos, classe: 'empilhado__parte--1' },
    { nome: 'Descontinuado', n: descontinuados, classe: 'empilhado__parte--2' },
    { nome: 'Censurado', n: desfecho.n_censurado, classe: 'empilhado__parte--censurado' },
  ];
  return (
    <div className="empilhado">
      <div className="empilhado__barra" role="img" aria-label={partes.map((p) => `${p.nome} ${formatarInteiro(p.n)}`).join(', ')}>
        {partes.map((p) => (
          <span key={p.nome} className={`empilhado__parte ${p.classe}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <p className="empilhado__legenda" aria-hidden="true">
        {partes.map((p) => (
          <span key={p.nome}>
            <span className={`empilhado__amostra ${p.classe}`} />
            {p.nome}
          </span>
        ))}
      </p>
    </div>
  );
}

function ClassePorGrupo({ v, divisao, onDivisao }: { v: VisaoGeral; divisao: DivisaoGrupo; onDivisao: (d: DivisaoGrupo) => void }) {
  const grupo = v.classe_por_grupo;
  const [selecao, setSelecao] = useState<[number, number] | null>(null);
  const travados = grupo.fixados_por_filtro;
  const nomesTravados = DIVISOES.filter((d) => travados.includes(d.valor)).map((d) => d.rotulo);
  const sel = selecao && grupo.linhas[selecao[0]]?.celulas[selecao[1]] ? selecao : null;
  const linhaSel = sel ? grupo.linhas[sel[0]] : null;
  const celulaSel: (ProporcaoPainel & { classe: string }) | null = sel && linhaSel ? linhaSel.celulas[sel[1]] : null;

  return (
    <PainelMedicao
      titulo="Qual classe é prescrita em cada grupo de pacientes?"
      subtitulo="Cada linha é um grupo e reúne os atendimentos dele no recorte dos filtros do topo. Os números são atendimentos; a cor mostra quanto cada classe pesa dentro da linha. Clique numa célula para ver a proporção com IC."
    >
      <div className="classe-grupo__controles">
        <span id="dividir-rotulo" className="classe-grupo__rotulo">
          Comparar grupos por
        </span>
        <SegmentedControl
          nome="dividir-por"
          aria-labelledby="dividir-rotulo"
          valor={divisao}
          onChange={(d) => {
            setSelecao(null);
            onDivisao(d);
          }}
          opcoes={DIVISOES.map((d) => ({ ...d, desabilitada: travados.includes(d.valor) }))}
        />
      </div>
      {nomesTravados.length > 0 && (
        <p className="texto-apoio">
          {nomesTravados.join(' e ')} {nomesTravados.length > 1 ? 'estão fixados' : 'está fixado'} pelos filtros do topo e por isso não divide a tabela.
          Remova o filtro para comparar por esse critério.
        </p>
      )}
      <MapaCalor
        legenda="Atendimentos por grupo e classe terapêutica"
        rotuloCanto={DIVISOES.find((d) => d.valor === divisao)?.rotulo}
        colunas={grupo.classes}
        rotuloTotal="Atendimentos"
        legendaEscala={['menor fatia da linha', 'maior']}
        linhas={grupo.linhas.map((linha, i) => ({
          rotulo: linha.rotulo,
          total: linha.n_atendimentos,
          celulas: linha.celulas.map((celula, j) => ({
            valor: celula.n_atendimentos_classe,
            intensidade: linha.n_atendimentos ? celula.n_atendimentos_classe / linha.n_atendimentos / 0.6 : 0,
            selecionada: sel?.[0] === i && sel?.[1] === j,
            rotuloAcessivel: `${linha.rotulo}, ${celula.classe}: ${formatarInteiro(celula.n_atendimentos_classe)} de ${formatarInteiro(linha.n_atendimentos)} atendimentos`,
            onSelecionar: () => setSelecao([i, j]),
          })),
        }))}
      />
      <div className="classe-grupo__detalhe" aria-live="polite">
        {celulaSel && linhaSel ? (
          <>
            <span className="classe-grupo__selecao">
              {linhaSel.rotulo} → {celulaSel.classe}
            </span>
            <LeituraProporcao p={celulaSel} nMinimo={v.n_minimo} />
          </>
        ) : (
          <span className="texto-apoio">Escolha uma célula para ver a proporção da linha com o intervalo de confiança.</span>
        )}
      </div>
      <p className="texto-apoio">
        Como usar: os filtros do topo definem quem entra (por exemplo, diagnóstico {rotuloGrupoCid('F40-F48')} e uma faixa de IMC); aqui
        você escolhe como dividir essas pessoas para comparar.
      </p>
    </PainelMedicao>
  );
}
