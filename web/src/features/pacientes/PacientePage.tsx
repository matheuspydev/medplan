/**
 * Ficha do paciente (#chave=... no fragmento, que não chega ao servidor): trajetória dos
 * tratamentos, atendimentos e reações relatadas. Só o que foi registrado: a ficha não compara
 * o paciente com a base nem sugere próximo medicamento.
 *
 * O caso evolui por novos atendimentos; os anteriores não são editados aqui.
 */
import { Plus } from 'lucide-react';
import { obterPaciente } from '../../api/client';
import { useCatalogo } from '../../api/referencias';
import type { FichaPaciente, StatusTratamento } from '../../api/types';
import { fragmentoChave, lerChaveDoFragmento, LinkRota } from '../../app/rotas';
import { EstadoApi } from '../../components/EstadoApi';
import { PainelMedicao } from '../../components/PainelMedicao';
import { RotuloFaixa } from '../../components/RotuloFaixa';
import { codificarFragmento } from '../consulta/fragmento';
import { formatarData, formatarDias, formatarInteiro, inicialMaiuscula, plural } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './pacientes.css';

export default function PacientePage() {
  const chave = lerChaveDoFragmento(window.location.hash);
  const estado = useApi(chave ? (signal) => obterPaciente(chave, signal) : null, chave ?? '');

  return (
    <div className="pagina">
      <LinkRota para="/pacientes">← Pacientes</LinkRota>
      {!chave ? (
        <p className="texto-apoio">Abra a ficha a partir da lista de pacientes.</p>
      ) : (
        <EstadoApi estado={estado} rotulo="Carregando a ficha…">
          {(ficha) => <Ficha ficha={ficha} />}
        </EstadoApi>
      )}
    </div>
  );
}

function Ficha({ ficha }: { ficha: FichaPaciente }) {
  const catalogo = useCatalogo();
  const rotuloStatus = (s: StatusTratamento) => catalogo?.status(s)?.rotulo ?? s;
  const ultimo = ficha.atendimentos[0];
  const reacoes = ficha.atendimentos.flatMap((a) => a.reacoes.map((r) => ({ ...r, data: a.data })));
  const atual = ficha.tratamentos[ficha.tratamentos.length - 1];
  const linhas = new Set(ficha.tratamentos.map((t) => t.linha_tratamento).filter((l) => l !== null)).size;
  const cid = catalogo?.cid(ultimo.cid10);

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela ficha-paciente__chave">{ficha.chave_pseudonima}</h1>
          <p className="cabecalho-pagina__texto">
            {catalogo?.rotuloOpcao('sexo', ficha.sexo)} · {plural(ficha.atendimentos.length, 'atendimento', 'atendimentos')} entre{' '}
            {formatarData(ficha.primeiro_atendimento)} e {formatarData(ficha.ultimo_atendimento)} · {ultimo.cid10} {cid?.descricao}
          </p>
        </div>
        <LinkRota para="/registro" fragmento={fragmentoChave(ficha.chave_pseudonima)} className="botao botao--primario">
          <Plus size={16} aria-hidden="true" />
          Registrar atendimento
        </LinkRota>
      </header>

      <div className="grade-indicadores">
        <div className="indicador">
          <div className="indicador__rotulo">Atendimentos</div>
          <div className="indicador__valor">{formatarInteiro(ficha.atendimentos.length)}</div>
          <div className="indicador__detalhe">último em {formatarData(ficha.ultimo_atendimento)}</div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Linhas de tratamento</div>
          <div className="indicador__valor">{formatarInteiro(linhas)}</div>
          <div className="indicador__detalhe">{ficha.tratamentos.map((t) => inicialMaiuscula(t.principio_ativo)).join(' → ')}</div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Reações relatadas</div>
          <div className="indicador__valor">{formatarInteiro(reacoes.length)}</div>
          <div className="indicador__detalhe">{plural(reacoes.filter((r) => r.levou_descontinuacao).length, 'levou', 'levaram')} à descontinuação</div>
        </div>
        <div className="indicador">
          <div className="indicador__rotulo">Situação atual</div>
          <div className="indicador__valor indicador__valor--texto">
            {inicialMaiuscula(atual.principio_ativo)}, {rotuloStatus(atual.status).toLowerCase()}
          </div>
          <div className="indicador__detalhe">{formatarDias(ultimo.dias_observados)} de seguimento</div>
        </div>
      </div>

      <PainelMedicao titulo="Trajetória" subtitulo="um traço por medicamento · círculos = atendimentos · triângulos = reações">
        <Trajetoria ficha={ficha} rotuloStatus={rotuloStatus} />
      </PainelMedicao>

      <PainelMedicao titulo="Atendimentos" subtitulo="do mais recente ao mais antigo · cada linha é uma consulta">
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Faixa etária</th>
                <th>IMC</th>
                <th>Tabagista</th>
                <th className="numero">Comorb.</th>
                <th>CID-10</th>
                <th>Medicamento</th>
                <th>Linha</th>
                <th>Status</th>
                <th className="numero">Seguimento</th>
                <th>Reações</th>
              </tr>
            </thead>
            <tbody>
              {ficha.atendimentos.map((a) => (
                <tr key={a.sk_atendimento}>
                  <td>{formatarData(a.data)}</td>
                  <td>
                    <RotuloFaixa codigo={a.faixa_etaria_cod} />
                  </td>
                  <td>{a.faixa_imc_cod ? catalogo?.faixaImc(a.faixa_imc_cod)?.rotulo : 'Não informado'}</td>
                  <td>{a.tabagista ? 'Sim' : 'Não'}</td>
                  <td className="numero">{formatarInteiro(a.qtd_comorbidades)}</td>
                  <td className="mono">{a.cid10}</td>
                  <td>{inicialMaiuscula(a.principio_ativo)}</td>
                  <td>{a.linha_tratamento ? `${a.linha_tratamento}ª` : '—'}</td>
                  <td>{rotuloStatus(a.status)}</td>
                  <td className="numero">{formatarDias(a.dias_observados)}</td>
                  <td>{a.reacoes.map((r) => r.termo).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PainelMedicao>

      <div className="grade-cartoes">
        <PainelMedicao titulo="Reações relatadas" subtitulo={plural(reacoes.length, 'reação', 'reações')}>
          {reacoes.length === 0 ? (
            <p className="texto-apoio">Nenhuma reação relatada nos atendimentos deste paciente.</p>
          ) : (
            <ul className="lista-reacoes">
              {reacoes.map((r, i) => (
                <li key={i}>
                  <span>
                    <strong>{r.termo}</strong> <span className="texto-secundario">· {r.soc}</span>
                    <br />
                    <span className="texto-secundario">
                      {inicialMaiuscula(r.principio_ativo)} ·{' '}
                      {r.data_inicio_reacao
                        ? `início ${formatarData(r.data_inicio_reacao)}${r.dias_ate_reacao !== null ? `, ${formatarDias(r.dias_ate_reacao)} após o início do medicamento` : ''}`
                        : 'início não informado'}
                    </span>
                  </span>
                  <span className="etiquetas">
                    <span className="etiqueta">{catalogo?.rotuloOpcao('gravidade', r.gravidade_observada)}</span>
                    <span className="etiqueta">{r.levou_descontinuacao ? 'Levou à descontinuação' : 'Não levou'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PainelMedicao>
        <PainelMedicao titulo="Pacientes com perfil parecido" subtitulo="para comparar com a base">
          <p className="texto-apoio">Veja como pacientes de perfil semelhante ao do último atendimento toleraram cada medicamento.</p>
          <p>
            <LinkRota
              para="/consulta"
              fragmento={codificarFragmento({ dx: ultimo.cid10, sexo: ficha.sexo, faixa: ultimo.faixa_etaria_cod, imc: ultimo.faixa_imc_cod })}
              className="botao botao--secundario"
            >
              Abrir na Consulta por perfil
            </LinkRota>
          </p>
          <p className="texto-apoio">A ficha mostra só o que foi registrado. Ela não compara este paciente com os outros nem sugere próximo medicamento.</p>
        </PainelMedicao>
      </div>

      <aside className="aviso-limitacao" role="note">
        <strong>Como atualizar este caso.</strong> A evolução entra como um novo atendimento: medicamento novo, troca, novo status ou nova reação.
        Os atendimentos anteriores não são editados aqui; se um dado vindo do hospital estiver errado, ele é corrigido na origem e chega na
        próxima carga.
      </aside>
    </>
  );
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function Trajetoria({ ficha, rotuloStatus }: { ficha: FichaPaciente; rotuloStatus: (s: StatusTratamento) => string }) {
  const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const inicio = Math.min(...ficha.tratamentos.map((t) => dia(t.data_inicio)));
  const fim = Math.max(dia(ficha.ultimo_atendimento), inicio + 30);
  const ESQ = 190;
  const DIR = 980;
  const x = (d: number) => ESQ + ((d - inicio) / (fim - inicio)) * (DIR - ESQ);
  const ALTURA_LINHA = 56;
  const altura = 30 + ficha.tratamentos.length * ALTURA_LINHA + 30;

  const marcas: { x: number; rotulo: string }[] = [];
  const d0 = new Date(inicio * 86_400_000);
  const mes = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1));
  const passo = Math.max(1, Math.ceil((fim - inicio) / 30 / 10));
  for (let i = 0; mes.getTime() / 86_400_000 <= fim; i++, mes.setUTCMonth(mes.getUTCMonth() + 1)) {
    if (i % passo === 0) {
      const m = mes.getUTCMonth();
      marcas.push({ x: x(mes.getTime() / 86_400_000), rotulo: m === 0 ? `${MESES[m]} ${mes.getUTCFullYear()}` : MESES[m] });
    }
  }

  const descricao = ficha.tratamentos
    .map((t) => `${inicialMaiuscula(t.principio_ativo)}, de ${formatarData(t.data_inicio)} a ${formatarData(t.data_ultima_observacao)}, ${rotuloStatus(t.status).toLowerCase()}`)
    .join('; ');

  return (
    <figure className="trajetoria">
      <svg viewBox={`0 0 1000 ${altura}`} role="img" aria-label={`Trajetória: ${descricao}`}>
        <g className="trajetoria__grade">
          {marcas.map((m) => (
            <line key={m.x} x1={m.x} y1={20} x2={m.x} y2={altura - 30} />
          ))}
        </g>
        {marcas.map((m) => (
          <text key={m.x} className="trajetoria__mes" x={m.x} y={altura - 10} textAnchor="middle">
            {m.rotulo}
          </text>
        ))}
        {ficha.tratamentos.map((t, i) => {
          const y = 30 + i * ALTURA_LINHA;
          const x0 = x(dia(t.data_inicio));
          const x1 = Math.max(x(dia(t.data_ultima_observacao)), x0 + 4);
          const atendimentos = ficha.atendimentos.filter((a) => a.medicamento_id === t.medicamento_id && dia(a.data) >= dia(t.data_inicio) && dia(a.data) <= dia(t.data_ultima_observacao));
          const reacoes = ficha.atendimentos.flatMap((a) =>
            a.reacoes.filter((r) => r.medicamento_id === t.medicamento_id && r.data_inicio_reacao).map((r) => ({ ...r, x: x(dia(r.data_inicio_reacao!)) })),
          );
          return (
            <g key={`${t.medicamento_id}-${t.data_inicio}`}>
              <text className="trajetoria__nome" x={0} y={y + 12}>
                {t.linha_tratamento ? `${t.linha_tratamento}ª ` : ''}
                {inicialMaiuscula(t.principio_ativo)}
              </text>
              <text className="trajetoria__status" x={0} y={y + 30}>
                {rotuloStatus(t.status)}
              </text>
              <rect className={t.encerrado ? 'trajetoria__barra--encerrado' : 'trajetoria__barra--aberto'} x={x0} y={y + 4} width={x1 - x0} height={14} rx={5} />
              {atendimentos.map((a) => (
                <circle key={a.sk_atendimento} className="trajetoria__atendimento" cx={x(dia(a.data))} cy={y + 11} r={5} />
              ))}
              {reacoes.map((r, j) => (
                <path key={j} className="trajetoria__reacao" d={`M${r.x - 6} ${y - 2} l6 -10 l6 10 z`} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="texto-apoio">Traço cheio: tratamento encerrado. Traço claro: em uso, sem desfecho ainda.</figcaption>
    </figure>
  );
}
