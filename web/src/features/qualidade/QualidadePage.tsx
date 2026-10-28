/**
 * Qualidade dos dados: envio de CSV, modelo dos arquivos, histórico de cargas (o que foi aceito
 * ou rejeitado, e por quê), reconciliação origem × banco e integridade do Data Mart.
 * Os filtros globais não se aplicam. Nada aqui é estatística de paciente: só contagens de linhas.
 */
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { ErroApi, enviarCarga, obterCarga, obterQualidade } from '../../api/client';
import { ComReferencias, type Catalogo } from '../../api/referencias';
import type { DetalheCarga, Qualidade, ResumoCarga } from '../../api/types';
import { LinkRota } from '../../app/rotas';
import { BarrasHorizontais } from '../../components/BarrasHorizontais';
import { Button } from '../../components/Button';
import { EstadoApi } from '../../components/EstadoApi';
import { PainelFalha } from '../../components/PainelFalha';
import { PainelMedicao } from '../../components/PainelMedicao';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatarData, formatarDataHora, formatarInteiro, plural } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { colunasModelo, exemploCsv, GRAO, type ArquivoModelo } from './modeloCsv';
import './qualidade.css';

const SITUACAO: Record<ResumoCarga['situacao'], string> = {
  completa: 'Completa',
  com_rejeicoes: 'Com rejeições',
  recusada: 'Não processada',
};

const SITUACAO_RECONCILIACAO: Record<DetalheCarga['reconciliacao'][number]['situacao'], string> = {
  confere: 'Confere',
  explicada: 'Explicada pelas linhas rejeitadas',
  a_conferir: 'A conferir',
  nao_processada: 'Carga não processada',
};

export default function QualidadePage() {
  const [tentativa, setTentativa] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  /** Resposta do último envio: só ela traz o valor recusado (não gravado). */
  const [ultimoEnvio, setUltimoEnvio] = useState<DetalheCarga | null>(null);
  const estado = useApi((signal) => obterQualidade(signal), String(tentativa));

  function aoEnviar(d: DetalheCarga) {
    setUltimoEnvio(d);
    setSelecionada(d.id);
    setEnviando(false);
    setTentativa((t) => t + 1);
  }

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Qualidade dos dados</h1>
          <p className="cabecalho-pagina__texto">Cargas de CSV, o que foi aceito ou rejeitado e se o banco bate com a origem.</p>
        </div>
        <Button variante="primario" icone={<Upload size={16} />} aria-expanded={enviando} onClick={() => setEnviando((e) => !e)}>
          Enviar CSV
        </Button>
      </header>

      {enviando && <EnvioCsv onEnviado={aoEnviar} onCancelar={() => setEnviando(false)} />}

      <EstadoApi estado={estado} rotulo="Carregando a qualidade dos dados…">
        {(q) => {
          const id = selecionada ?? q.cargas[0]?.id ?? null;
          return (
            <>
              <Indicadores q={q} />
              <ComReferencias>{(catalogo) => <ModeloCsv catalogo={catalogo} />}</ComReferencias>
              <Historico q={q} selecionada={id} onSelecionar={setSelecionada} />
              {id !== null && <DetalheSelecionado id={id} ultimoEnvio={ultimoEnvio?.id === id ? ultimoEnvio : null} versao={tentativa} />}
              <Integridade q={q} />
            </>
          );
        }}
      </EstadoApi>

      <p className="texto-apoio">
        Linhas rejeitadas não entram em nenhuma análise. O registro de cargas é somente de inclusão. <LinkRota para="/metodologia">Metodologia</LinkRota>
      </p>
    </div>
  );
}

// ---- envio ------------------------------------------------------------------------------
function EnvioCsv({ onEnviado, onCancelar }: { onEnviado: (d: DetalheCarga) => void; onCancelar: () => void }) {
  const [atendimentos, setAtendimentos] = useState<File | null>(null);
  const [reacoes, setReacoes] = useState<File | null>(null);
  const [informadas, setInformadas] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const informadasValida = informadas === '' || /^\d+$/.test(informadas);

  async function enviar() {
    if (!atendimentos || !informadasValida || salvando) {
      setErros([!atendimentos ? 'Escolha o atendimentos.csv.' : 'Linhas informadas pela origem: número inteiro, ou vazio.']);
      return;
    }
    setSalvando(true);
    setErros([]);
    try {
      const d = await enviarCarga({
        atendimentos: { nome: atendimentos.name, conteudo: await atendimentos.text() },
        ...(reacoes ? { reacoes: { nome: reacoes.name, conteudo: await reacoes.text() } } : {}),
        ...(informadas ? { linhas_informadas: Number(informadas) } : {}),
      });
      onEnviado(d);
    } catch (e) {
      setErros(e instanceof ErroApi ? e.erros.map((x) => x.mensagem) : ['Falha inesperada ao enviar a carga.']);
      setSalvando(false);
    }
  }

  return (
    <PainelMedicao titulo="Enviar CSV" subtitulo="UTF-8, separador ponto e vírgula, uma linha de cabeçalho. O modelo está logo abaixo." densidade="formulario">
      <div className="envio-csv">
        <label className="painel-filtros__campo">
          <span>atendimentos.csv (obrigatório)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setAtendimentos(e.target.files?.[0] ?? null)} />
        </label>
        <label className="painel-filtros__campo">
          <span>reacoes.csv (opcional)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setReacoes(e.target.files?.[0] ?? null)} />
        </label>
        <label className="painel-filtros__campo">
          <span>Linhas de atendimento informadas pela origem (opcional)</span>
          <input className="controle-texto envio-csv__numero" inputMode="numeric" value={informadas} onChange={(e) => setInformadas(e.target.value.trim())} />
        </label>
      </div>
      <p className="texto-apoio">Coluna fora do modelo ou obrigatória ausente: a carga inteira é recusada e nada entra no banco.</p>
      {erros.length > 0 && (
        <PainelFalha titulo="A carga não foi enviada.">
          {erros.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </PainelFalha>
      )}
      <div className="envio-csv__acoes">
        <Button variante="secundario" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variante="primario" onClick={() => void enviar()} disabled={salvando}>
          {salvando ? 'Enviando…' : 'Enviar carga'}
        </Button>
      </div>
    </PainelMedicao>
  );
}

// ---- indicadores ----------------------------------------------------------------------------
function Indicadores({ q }: { q: Qualidade }) {
  const ultima = q.cargas[0];
  const problemas = q.integridade.reduce((s, i) => s + i.n, 0);
  return (
    <div className="grade-indicadores">
      <div className="indicador">
        <div className="indicador__rotulo">Rejeição na última carga</div>
        <div className="indicador__valor">{ultima ? formatarInteiro(ultima.rejeitadas) : '—'}</div>
        <div className="indicador__detalhe">{ultima ? `de ${formatarInteiro(ultima.lidas)} linhas lidas` : 'nenhuma carga ainda'}</div>
      </div>
      <div className="indicador">
        <div className="indicador__rotulo">Cargas</div>
        <div className="indicador__valor">{formatarInteiro(q.n_cargas)}</div>
        <div className="indicador__detalhe">{ultima ? `última em ${formatarData(ultima.criado_em)}` : 'nenhuma carga ainda'}</div>
      </div>
      <div className="indicador">
        <div className="indicador__rotulo">Integridade do Data Mart</div>
        <div className="indicador__valor">{formatarInteiro(problemas)}</div>
        <div className="indicador__detalhe">{problemas ? 'problemas a conferir' : 'nenhum problema encontrado'}</div>
      </div>
      <div className="indicador">
        <div className="indicador__rotulo">Atendimentos na base</div>
        <div className="indicador__valor">{formatarInteiro(q.base.n_atendimentos)}</div>
        <div className="indicador__detalhe">de {plural(q.base.n_pacientes, 'paciente', 'pacientes')}</div>
      </div>
    </div>
  );
}

// ---- modelo de CSV -------------------------------------------------------------------------
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function ModeloCsv({ catalogo }: { catalogo: Catalogo }) {
  const [arquivo, setArquivo] = useState<ArquivoModelo>('atendimentos');
  const nome = `${arquivo}.csv`;
  const exemplo = exemploCsv(arquivo, catalogo);

  return (
    <PainelMedicao
      titulo="Modelo de CSV para envio"
      subtitulo="Dois arquivos: um com os atendimentos e outro com as reações adversas. UTF-8, separador ponto e vírgula, uma linha de cabeçalho com estes nomes."
      acoes={
        <Button variante="secundario" className="botao--pequeno" icone={<Download size={14} />} onClick={() => baixar(nome, exemplo)}>
          Baixar modelo {nome}
        </Button>
      }
    >
      <SegmentedControl
        nome="modelo-csv"
        aria-label="Arquivo do modelo"
        opcoes={[
          { valor: 'atendimentos', rotulo: 'atendimentos.csv' },
          { valor: 'reacoes', rotulo: 'reacoes.csv' },
        ]}
        valor={arquivo}
        onChange={setArquivo}
      />
      <p className="texto-apoio">{GRAO[arquivo]}</p>
      <div className="rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Coluna</th>
              <th>Obrigatória</th>
              <th>Formato</th>
              <th>Valores aceitos e regras</th>
            </tr>
          </thead>
          <tbody>
            {colunasModelo(arquivo, catalogo).map((c) => (
              <tr key={c.nome}>
                <td className="mono">{c.nome}</td>
                <td>{c.obrigatoria ? 'Sim' : 'Não'}</td>
                <td>{c.formato}</td>
                <td>{c.regra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="qualidade__subtitulo">Exemplo de arquivo ({nome})</p>
      <pre className="qualidade__exemplo mono">{exemplo}</pre>
      <p className="texto-apoio">Os valores do exemplo são os primeiros itens das listas de referência, só para mostrar o formato.</p>
      <div className="grade-cartoes qualidade__regras">
        <div>
          <p className="qualidade__subtitulo">Quando uma linha é rejeitada</p>
          <p className="texto-apoio">
            Campo obrigatório vazio → registro incompleto. CID, ATC, faixa ou termo fora da lista de referência → código fora do vocabulário. Data
            inválida ou fora de ordem → data inconsistente. Sexo, tabagismo, status ou gravidade fora da lista → valor fora do domínio. Reação sem
            o atendimento no mesmo envio → sem atendimento correspondente. Atendimento repetido → já carregado.
          </p>
        </div>
        <div>
          <p className="qualidade__subtitulo">Antes de exportar</p>
          <p className="texto-apoio">
            A anonimização acontece no hospital. O arquivo não pode ter nome, CPF, prontuário, data de nascimento, endereço ou texto livre. Uma
            coluna fora do modelo faz a carga inteira ser recusada.
          </p>
        </div>
      </div>
    </PainelMedicao>
  );
}

// ---- histórico --------------------------------------------------------------------------
function Informado({ c }: { c: ResumoCarga }) {
  if (c.linhas_informadas === null) return <span className="texto-secundario">—</span>;
  const diferenca = c.lidas_atendimentos - c.linhas_informadas;
  return (
    <span>
      {formatarInteiro(c.linhas_informadas)}{' '}
      <span className={diferenca ? 'qualidade__alerta' : 'texto-secundario'}>
        {diferenca === 0 ? '· confere' : diferenca < 0 ? `· faltam ${formatarInteiro(-diferenca)}` : `· sobram ${formatarInteiro(diferenca)}`}
      </span>
    </span>
  );
}

function Historico({ q, selecionada, onSelecionar }: { q: Qualidade; selecionada: number | null; onSelecionar: (id: number) => void }) {
  return (
    <PainelMedicao titulo="Histórico de cargas" subtitulo="clique numa carga para ver as rejeições">
      {q.cargas.length === 0 ? (
        <p className="texto-apoio">Nenhuma carga enviada ainda.</p>
      ) : (
        <div className="rolagem">
          <table className="tabela qualidade__historico">
            <thead>
              <tr>
                <th>Data</th>
                <th>Arquivos</th>
                <th>Informado pela origem</th>
                <th className="numero">Lidas</th>
                <th className="numero">Aceitas</th>
                <th className="numero">Rejeitadas</th>
                <th>Aceitas × rejeitadas</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {q.cargas.map((c) => (
                <tr key={c.id} aria-selected={c.id === selecionada} className={c.id === selecionada ? 'qualidade__linha--selecionada' : undefined}>
                  <td>
                    <button type="button" className="qualidade__abrir" onClick={() => onSelecionar(c.id)}>
                      {formatarDataHora(c.criado_em)}
                    </button>
                  </td>
                  <td className="mono">
                    {c.arquivo_atendimentos}
                    {c.arquivo_reacoes && (
                      <>
                        <br />
                        {c.arquivo_reacoes}
                      </>
                    )}
                  </td>
                  <td>
                    <Informado c={c} />
                  </td>
                  <td className="numero">{formatarInteiro(c.lidas)}</td>
                  <td className="numero">{formatarInteiro(c.aceitas)}</td>
                  <td className="numero">{formatarInteiro(c.rejeitadas)}</td>
                  <td>
                    {c.lidas > 0 && (
                      <span
                        className="qualidade__barra"
                        role="img"
                        aria-label={`${formatarInteiro(c.aceitas)} aceitas, ${formatarInteiro(c.rejeitadas)} rejeitadas`}
                      >
                        <span className="qualidade__barra-aceitas" style={{ flexGrow: c.aceitas }} />
                        <span className="qualidade__barra-rejeitadas" style={{ flexGrow: c.rejeitadas }} />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`qualidade__situacao qualidade__situacao--${c.situacao}`}>{SITUACAO[c.situacao]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PainelMedicao>
  );
}

// ---- detalhe da carga -----------------------------------------------------------------------
function DetalheSelecionado({ id, ultimoEnvio, versao }: { id: number; ultimoEnvio: DetalheCarga | null; versao: number }) {
  const estado = useApi(ultimoEnvio ? null : (signal) => obterCarga(id, signal), `${id}|${versao}`);
  if (ultimoEnvio) return <Detalhe d={ultimoEnvio} />;
  return (
    <EstadoApi estado={estado} rotulo="Carregando a carga…">
      {(d) => <Detalhe d={d} />}
    </EstadoApi>
  );
}

function Detalhe({ d }: { d: DetalheCarga }) {
  const comValor = d.rejeicoes.some((r) => r.valor !== undefined);
  return (
    <div className="grade-cartoes">
      <PainelMedicao titulo="Motivos de rejeição" subtitulo={`carga de ${formatarDataHora(d.criado_em)} · ${plural(d.rejeitadas, 'linha', 'linhas')}`}>
        {d.motivo_recusa ? (
          <div className="aviso-limitacao" role="note">
            <strong>Carga não processada.</strong> {d.motivo_recusa}
          </div>
        ) : d.n_rejeicoes === 0 ? (
          <p className="texto-apoio">Nenhuma linha rejeitada.</p>
        ) : (
          <>
            <BarrasHorizontais
              rotuloAcessivel="Linhas rejeitadas por motivo"
              itens={d.motivos.filter((m) => m.n > 0).map((m) => ({ chave: m.motivo, rotulo: m.rotulo, valor: m.n }))}
            />
            <p className="qualidade__subtitulo">Linhas rejeitadas</p>
            <div className="rolagem qualidade__rejeicoes">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th className="numero">Linha</th>
                    <th>Campo</th>
                    {comValor && <th>Valor</th>}
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rejeicoes.map((r) => (
                    <tr key={`${r.arquivo}-${r.linha}`}>
                      <td>{r.arquivo}.csv</td>
                      <td className="numero">{r.linha}</td>
                      <td className="mono">{r.campo}</td>
                      {comValor && <td className="mono">{r.valor || 'vazio'}</td>}
                      <td>{r.mensagem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.n_rejeicoes > d.rejeicoes.length && (
              <p className="texto-apoio">Mostrando as primeiras {formatarInteiro(d.rejeicoes.length)} de {formatarInteiro(d.n_rejeicoes)}.</p>
            )}
            <p className="texto-apoio">
              {comValor
                ? 'O valor recusado aparece só agora, logo após o envio: ele não é gravado.'
                : 'O valor recusado não é gravado; só a linha, o campo e o motivo.'}
            </p>
          </>
        )}
      </PainelMedicao>

      <PainelMedicao titulo="Reconciliação origem × banco" subtitulo="origem = o que está nos arquivos; banco = o que entrou, medido no Data Mart">
        <table className="tabela">
          <thead>
            <tr>
              <th>Entidade</th>
              <th className="numero">Origem</th>
              <th className="numero">Banco</th>
              <th className="numero">Diferença</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {d.reconciliacao.map((r) => (
              <tr key={r.entidade}>
                <td>{r.entidade}</td>
                <td className="numero">{formatarInteiro(r.origem)}</td>
                <td className="numero">{formatarInteiro(r.banco)}</td>
                <td className="numero">{r.diferenca === 0 ? '0' : r.diferenca < 0 ? `−${formatarInteiro(-r.diferenca)}` : `+${formatarInteiro(r.diferenca)}`}</td>
                <td className={r.situacao === 'a_conferir' ? 'qualidade__alerta' : undefined}>{SITUACAO_RECONCILIACAO[r.situacao]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PainelMedicao>
    </div>
  );
}

// ---- integridade --------------------------------------------------------------------------
function Integridade({ q }: { q: Qualidade }) {
  return (
    <PainelMedicao titulo="Integridade do Data Mart" subtitulo="a base inteira, não só a última carga">
      {q.integridade.map((i) => (
        <div key={i.verificacao} className="linha-leitura">
          <span>{i.verificacao}</span>
          <strong className={i.n ? 'qualidade__alerta' : undefined}>{i.n ? `${formatarInteiro(i.n)} a conferir` : '0'}</strong>
        </div>
      ))}
    </PainelMedicao>
  );
}
