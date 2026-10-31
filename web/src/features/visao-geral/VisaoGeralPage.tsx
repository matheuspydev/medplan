/**
 * Visão geral: panorama da base no recorte dos filtros globais. Tudo vem pronto da API
 * (POST /paineis/visao-geral); a tela não calcula, não arredonda e não reordena.
 */
import { obterVisaoGeral } from '../../api/client';
import type { VisaoGeral } from '../../api/types';
import { useFiltros } from '../../app/filtros';
import { fragmentoChave, LinkRota } from '../../app/rotas';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { BarrasHorizontais } from '../../components/BarrasHorizontais';
import { EstadoApi } from '../../components/EstadoApi';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { PainelMedicao } from '../../components/PainelMedicao';
import { RotuloFaixa } from '../../components/RotuloFaixa';
import { formatarData, formatarHorizonte, formatarInteiro, formatarMedianaDias, inicialMaiuscula, plural } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './visao-geral.css';

export default function VisaoGeralPage() {
  const { filtros } = useFiltros();
  const estado = useApi((signal) => obterVisaoGeral({ filtros }, signal), JSON.stringify(filtros));

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
        {(v) => <Conteudo v={v} />}
      </EstadoApi>
    </div>
  );
}

function Conteudo({ v }: { v: VisaoGeral }) {
  const { contagens: c, desfecho, n_minimo: nMinimo } = v;
  return (
    <>
      <div className="grade-indicadores">
        <Indicador rotulo="Pacientes" valor={c.n_pacientes} detalhe="chaves pseudônimas distintas" />
        <Indicador rotulo="Atendimentos" valor={c.n_atendimentos} detalhe="uma linha por consulta" />
        <TempoEntreAtendimentos t={v.tempo_entre_atendimentos} nMinimo={nMinimo} />
        <Indicador rotulo="Reações registradas" valor={c.n_reacoes} detalhe="relatadas nos atendimentos" />
        <Indicador rotulo="Medicamentos distintos" valor={c.n_medicamentos} detalhe="princípios ativos" />
      </div>

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

/** Média de dias entre atendimentos do mesmo paciente, com n e IC95%; abaixo do n mínimo, sem média. */
function TempoEntreAtendimentos({ t, nMinimo }: { t: VisaoGeral['tempo_entre_atendimentos']; nMinimo: number }) {
  const n = `n=${formatarInteiro(t.n_intervalos)} ${t.n_intervalos === 1 ? 'intervalo' : 'intervalos'}`;
  return (
    <div className="indicador">
      <div className="indicador__rotulo">Tempo médio entre atendimentos</div>
      {t.media_dias === null ? (
        <>
          <div className="indicador__valor indicador__valor--texto">dados insuficientes</div>
          <div className="indicador__detalhe">
            {n} (mínimo {formatarInteiro(nMinimo)})
          </div>
        </>
      ) : (
        <>
          <div className="indicador__valor">{formatarMedianaDias(t.media_dias)}</div>
          <div className="indicador__detalhe">
            {n}, IC95% {formatarMedianaDias(t.ic_inferior_dias!)} a {formatarMedianaDias(t.ic_superior_dias!)} · {plural(t.n_pacientes, 'paciente', 'pacientes')}
          </div>
        </>
      )}
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
