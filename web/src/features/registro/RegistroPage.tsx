/**
 * Registrar atendimento (/registro, chave no fragmento #chave=...): uma consulta de um paciente,
 * o grão do Data Mart. Quatro seções (paciente, atendimento, medicamento prescrito, reações
 * relatadas) e o resumo lateral com o que falta preencher.
 *
 * - Enter nunca envia (não há <form>; botões são type="button"). Ctrl+S salva.
 * - Erros aparecem nos campos depois de tentar salvar; os do servidor (422) vão para o campo.
 * - Rascunho só em memória. Depois de salvar, abre a ficha do paciente.
 */
import { ArrowLeft, Copy, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErroApi, obterPaciente, registrarAtendimento } from '../../api/client';
import { ComReferencias, rotuloGrupoCid, type Catalogo } from '../../api/referencias';
import type { FichaPaciente, GrupoStatus, StatusTratamento } from '../../api/types';
import { fragmentoChave, lerChaveDoFragmento, LinkRota, navegar } from '../../app/rotas';
import { Button } from '../../components/Button';
import { Combobox, type OpcaoCombobox } from '../../components/Combobox';
import { DateField } from '../../components/DateField';
import { Field } from '../../components/Field';
import { MultiCombobox } from '../../components/MultiCombobox';
import { PainelFalha } from '../../components/PainelFalha';
import { PainelMedicao } from '../../components/PainelMedicao';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useAtalhos } from '../../lib/atalhos';
import { formatarData, hojeIso, inicialMaiuscula, plural } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { BlocoReacao } from './BlocoReacao';
import {
  chaveDoCampoServidor,
  FORMATO_CHAVE,
  idDom,
  montarEntrada,
  novaReacao,
  novoRascunho,
  validar,
  type Rascunho,
  type RascunhoReacao,
} from './modelo';
import { ResumoRegistro } from './ResumoRegistro';
import './registro.css';

/** Valor do <select> de IMC para "Não informado" (vira null no corpo). */
const IMC_NAO_INFORMADO = '__nao_informado';

const GRUPOS_STATUS: { rotulo: string; grupo: GrupoStatus }[] = [
  { rotulo: 'Sem desfecho ainda', grupo: 'censura' },
  { rotulo: 'Concluído', grupo: 'sucesso' },
  { rotulo: 'Descontinuado', grupo: 'descontinuacao' },
];

/** Valor do controle de linha para "Não sabemos" (vira null no corpo). */
const LINHA_NAO_SABEMOS = 'nao_sabemos';

const LINHAS = [
  { valor: '1', rotulo: '1ª' },
  { valor: '2', rotulo: '2ª' },
  { valor: '3', rotulo: '3ª' },
  { valor: '4', rotulo: '4ª ou mais' },
  { valor: LINHA_NAO_SABEMOS, rotulo: 'Não sabemos' },
];

const GRUPOS_COMORBIDADE = [
  { chave: 'psiquiatrica', rotulo: 'Psiquiátricas (capítulo F)' },
  { chave: 'clinica', rotulo: 'Clínicas' },
];

export default function RegistroPage() {
  const chave = lerChaveDoFragmento(window.location.hash);
  return (
    <div className="pagina">
      {chave ? (
        <LinkRota para="/paciente" fragmento={fragmentoChave(chave)}>
          <ArrowLeft size={14} aria-hidden="true" /> Ficha de {chave}
        </LinkRota>
      ) : (
        <LinkRota para="/pacientes">
          <ArrowLeft size={14} aria-hidden="true" /> Pacientes
        </LinkRota>
      )}
      <ComReferencias>{(catalogo) => <Formulario catalogo={catalogo} chaveInicial={chave} />}</ComReferencias>
    </div>
  );
}

function Formulario({ catalogo, chaveInicial }: { catalogo: Catalogo; chaveInicial: string | null }) {
  const r = catalogo.referencias;
  const [rascunho, setRascunho] = useState<Rascunho>(() => novoRascunho(chaveInicial));
  /** Chave buscada na base (no blur do campo ou vinda da ficha). */
  const [chaveBuscada, setChaveBuscada] = useState(chaveInicial ?? '');
  const [tentou, setTentou] = useState(false);
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [falhaGeral, setFalhaGeral] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);

  const buscar = rascunho.modo === 'existente' && FORMATO_CHAVE.test(chaveBuscada);
  const estadoFicha = useApi(buscar ? (signal) => obterPaciente(chaveBuscada, signal) : null, buscar ? chaveBuscada : '');
  const ficha = buscar && rascunho.chave === chaveBuscada ? estadoFicha.dados : null;
  const encontrado = !buscar || rascunho.chave !== chaveBuscada ? null : ficha ? true : estadoFicha.erro?.status === 404 ? false : null;

  const hoje = hojeIso();
  const pendencias = useMemo(() => validar(rascunho, hoje, encontrado), [rascunho, hoje, encontrado]);
  const erroLocal = useMemo(() => new Map(pendencias.map((p) => [p.chave, p.mensagem])), [pendencias]);
  const erro = (chave: string) => (tentou ? erroLocal.get(chave) : undefined) ?? errosServidor[chave] ?? null;

  useEffect(() => {
    if (!foco) return;
    setFoco(null);
    const el = document.getElementById(foco);
    const alvo = el?.matches('input, select, button') ? el : el?.querySelector<HTMLElement>('input:not(:disabled), select, button');
    alvo?.focus({ preventScroll: true });
    alvo?.scrollIntoView?.({ block: 'center' });
  }, [foco]);

  function mudar(patch: Partial<Rascunho>) {
    setRascunho((a) => ({ ...a, ...patch }));
    const chaves = Object.keys(patch);
    setErrosServidor((e) => Object.fromEntries(Object.entries(e).filter(([c]) => !chaves.includes(c))));
  }

  function mudarReacao(id: number, patch: Partial<RascunhoReacao>) {
    setRascunho((a) => ({ ...a, reacoes: a.reacoes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    const chaves = Object.keys(patch).map((c) => `r${id}.${c === 'sem_data' ? 'data_inicio_reacao' : c}`);
    setErrosServidor((e) => Object.fromEntries(Object.entries(e).filter(([c]) => !chaves.includes(c))));
  }

  function adicionarReacao() {
    const nova = novaReacao();
    setRascunho((a) => ({ ...a, reacoes: [...a.reacoes, nova] }));
    setFoco(idDom(`r${nova.id}.reacao_adversa_id`));
  }

  function removerReacao(id: number) {
    setRascunho((a) => ({ ...a, reacoes: a.reacoes.filter((x) => x.id !== id) }));
    setFoco('reg-adicionar-reacao');
  }

  // ---- histórico do paciente ----------------------------------------------------------
  const ultimo = ficha?.atendimentos[0];
  const atual = ficha?.tratamentos.at(-1);
  const emAndamento = atual && !atual.encerrado ? atual : undefined;
  const maiorLinha = Math.max(0, ...(ficha?.tratamentos.map((t) => t.linha_tratamento ?? 0) ?? []));
  const anteriores = (ficha?.tratamentos ?? []).filter(
    (t) => !(t.medicamento_id === rascunho.medicamento_id && t.data_inicio === rascunho.data_inicio_medicamento),
  );

  function copiarAnterior(a: FichaPaciente['atendimentos'][number]) {
    // O Data Mart guarda tabagista (sim/não) e só a quantidade de comorbidades: o resto o médico confirma.
    mudar({
      faixa_etaria_cod: a.faixa_etaria_cod,
      faixa_imc_cod: a.faixa_imc_cod,
      cid10_principal: a.cid10,
      ...(a.tabagista ? { tabagismo: 'atual' as const } : {}),
    });
    setCopiado(formatarData(a.data));
  }

  function manter(t: FichaPaciente['tratamentos'][number]) {
    mudar({ medicamento_id: t.medicamento_id, data_inicio_medicamento: t.data_inicio, linha_tratamento: t.linha_tratamento });
  }

  // ---- envio --------------------------------------------------------------------------
  async function salvar() {
    if (salvando) return;
    setTentou(true);
    setFalhaGeral(null);
    setErrosServidor({});
    if (pendencias.length) {
      setFoco(idDom(pendencias[0].chave));
      return;
    }
    const enviado = rascunho;
    setSalvando(true);
    try {
      const criado = await registrarAtendimento(montarEntrada(enviado));
      navegar('/paciente', fragmentoChave(criado.chave_pseudonima));
    } catch (e) {
      const erros = e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha inesperada ao enviar o registro.' }];
      const porCampo: Record<string, string> = {};
      const gerais: string[] = [];
      for (const item of erros) {
        const chave = item.campo ? chaveDoCampoServidor(item.campo, enviado) : null;
        if (chave) porCampo[chave] ??= item.mensagem;
        else gerais.push(item.mensagem);
      }
      setErrosServidor(porCampo);
      setFalhaGeral(gerais);
      setSalvando(false);
      const primeiro = Object.keys(porCampo)[0];
      setFoco(primeiro ? idDom(primeiro) : 'reg-falha');
    }
  }

  useAtalhos([{ tecla: 's', ctrl: true, acao: () => void salvar() }]);

  // ---- opções -------------------------------------------------------------------------
  const opcoesDx = useMemo<OpcaoCombobox[]>(
    () => r.diagnosticos.map((d) => ({ valor: d.codigo, codigo: d.codigo, rotulo: d.descricao, grupo: d.grupo })),
    [r.diagnosticos],
  );
  const opcoesComorbidade = useMemo<OpcaoCombobox[]>(
    () =>
      r.cid10.map((c) => ({
        valor: c.codigo,
        codigo: c.codigo,
        rotulo: c.descricao,
        grupo: c.tipo,
        desabilitada: c.codigo === rascunho.cid10_principal,
        motivoDesabilitada: 'já é o diagnóstico principal',
      })),
    [r.cid10, rascunho.cid10_principal],
  );
  const opcoesMedicamento = useMemo<OpcaoCombobox[]>(
    () =>
      [...r.medicamentos]
        .sort((a, b) => a.principio_ativo.localeCompare(b.principio_ativo, 'pt-BR'))
        .map((m) => ({ valor: String(m.id), codigo: m.codigo_atc, rotulo: inicialMaiuscula(m.principio_ativo), detalhe: m.classe_terapeutica })),
    [r.medicamentos],
  );

  const id = idDom;
  const medicamento = rascunho.medicamento_id !== null ? catalogo.medicamento(rascunho.medicamento_id) : undefined;
  const rotuloStatus = (s: StatusTratamento) => catalogo.status(s)?.rotulo.toLowerCase() ?? s;
  const novo = rascunho.modo === 'novo';

  return (
    <>
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Registrar atendimento</h1>
          <p className="cabecalho-pagina__texto">
            Um registro por consulta: o medicamento prescrito naquele dia, o status do tratamento e as reações relatadas. A evolução do
            paciente é a sequência dos seus atendimentos.
          </p>
        </div>
        <div className="cabecalho-pagina__acoes">
          <LinkRota para={chaveInicial ? '/paciente' : '/pacientes'} fragmento={chaveInicial ? fragmentoChave(chaveInicial) : ''} className="botao botao--secundario">
            Cancelar
          </LinkRota>
          <Button variante="primario" atalho="Ctrl+S" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar atendimento'}
          </Button>
        </div>
      </header>

      {tentou && pendencias.length > 0 && (
        <div className="aviso-pendencias" role="alert">
          <strong>Faltam {plural(pendencias.length, 'campo', 'campos')} para salvar.</strong> Eles estão listados no resumo ao lado. Clique em cada um
          para ir até o campo.
        </div>
      )}
      {falhaGeral && (
        <PainelFalha titulo="Não foi possível salvar o atendimento. Os valores digitados foram mantidos." className="registro__falha">
          <div id="reg-falha" tabIndex={-1}>
            {falhaGeral.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
            {Object.keys(errosServidor).length > 0 && <p>O servidor recusou campos, marcados no formulário.</p>}
          </div>
        </PainelFalha>
      )}

      <div className="registro__grade">
        <div className="registro__formulario">
          {/* ---- 1. Paciente ---------------------------------------------------------- */}
          <PainelMedicao
            titulo={<Etapa n={1}>Paciente</Etapa>}
            subtitulo="A chave pseudônima vem da exportação do hospital. Nome, CPF, prontuário e nascimento nunca entram aqui."
            densidade="formulario"
          >
            <SegmentedControl
              nome="reg-modo"
              aria-label="Paciente"
              opcoes={[
                { valor: 'existente', rotulo: 'Paciente já registrado' },
                { valor: 'novo', rotulo: 'Primeiro atendimento' },
              ]}
              valor={rascunho.modo}
              onChange={(modo) => {
                mudar({ modo, sexo: null });
                setCopiado(null);
              }}
              className="registro__modo"
            />
            <div className="registro-campos">
              <Field
                id={id('chave')}
                rotulo={novo ? 'Chave pseudônima (da origem)' : 'Chave do paciente'}
                obrigatorio
                ajuda={novo ? 'Use a chave da exportação. Não crie uma chave nova aqui.' : undefined}
                erro={erro('chave')}
                className="registro-linha"
              >
                {(a11y) => (
                  <input
                    {...a11y}
                    className="controle-texto registro-chave mono"
                    value={rascunho.chave}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => mudar({ chave: e.target.value.toUpperCase().trim() })}
                    onBlur={() => setChaveBuscada(rascunho.chave)}
                    onKeyDown={(e) => e.key === 'Enter' && setChaveBuscada(rascunho.chave)}
                  />
                )}
              </Field>
              {novo && (
                <Field id={id('sexo')} rotulo="Sexo" obrigatorio grupo erro={erro('sexo')} className="registro-linha">
                  {(a11y) => (
                    <SegmentedControl
                      {...a11y}
                      nome={id('sexo')}
                      opcoes={r.opcoes.sexo.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }))}
                      valor={rascunho.sexo}
                      onChange={(sexo) => mudar({ sexo })}
                    />
                  )}
                </Field>
              )}
            </div>
            {!novo && buscar && rascunho.chave === chaveBuscada && estadoFicha.carregando && <p className="texto-apoio">Buscando o paciente…</p>}
            {!novo && estadoFicha.erro && estadoFicha.erro.status !== 404 && rascunho.chave === chaveBuscada && (
              <p className="texto-apoio">{estadoFicha.erro.message}</p>
            )}
            {ficha && ultimo && (
              <dl className="registro__paciente">
                <div>
                  <dt>Sexo</dt>
                  <dd>{catalogo.rotuloOpcao('sexo', ficha.sexo)}</dd>
                </div>
                <div>
                  <dt>Atendimentos</dt>
                  <dd>{ficha.atendimentos.length}</dd>
                </div>
                <div>
                  <dt>Último atendimento</dt>
                  <dd>{formatarData(ficha.ultimo_atendimento)}</dd>
                </div>
                <div>
                  <dt>Medicamento atual</dt>
                  <dd>
                    {atual
                      ? `${inicialMaiuscula(atual.principio_ativo)}${atual.linha_tratamento ? ` · ${atual.linha_tratamento}ª linha` : ''} · ${rotuloStatus(atual.status)}`
                      : '—'}
                  </dd>
                </div>
                <LinkRota para="/paciente" fragmento={fragmentoChave(ficha.chave_pseudonima)} className="registro__ver-ficha">
                  Ver ficha
                </LinkRota>
              </dl>
            )}
          </PainelMedicao>

          {/* ---- 2. Atendimento ------------------------------------------------------- */}
          <PainelMedicao
            titulo={<Etapa n={2}>Atendimento</Etapa>}
            subtitulo="Idade, IMC, tabagismo e comorbidades mudam com o tempo: valem para esta consulta."
            densidade="formulario"
            acoes={
              ultimo && (
                <Button variante="secundario" className="botao--pequeno" icone={<Copy size={14} />} onClick={() => copiarAnterior(ultimo)}>
                  Copiar do atendimento anterior
                </Button>
              )
            }
          >
            {copiado && (
              <p className="registro__copiado" role="status">
                Copiado do atendimento de {copiado}: faixa etária, IMC e diagnóstico{rascunho.tabagismo === 'atual' ? ', tabagismo' : ''}. Confira cada campo
                antes de salvar; a data do atendimento não é copiada. A base guarda só a quantidade de comorbidades
                {ultimo ? ` (${ultimo.qtd_comorbidades} no anterior)` : ''}: escolha os códigos de novo.
              </p>
            )}
            <div className="registro-campos">
              <Field id={id('data_atendimento')} rotulo="Data do atendimento" obrigatorio erro={erro('data_atendimento')} className="registro-linha">
                {(a11y) => <DateField {...a11y} valor={rascunho.data_atendimento} max={hoje} onChange={(v) => mudar({ data_atendimento: v })} />}
              </Field>
              <Field id={id('faixa_etaria_cod')} rotulo="Faixa etária" obrigatorio erro={erro('faixa_etaria_cod')} className="registro-linha">
                {(a11y) => (
                  <select
                    {...a11y}
                    className="controle-texto registro-select"
                    value={rascunho.faixa_etaria_cod ?? ''}
                    onChange={(e) => mudar({ faixa_etaria_cod: e.target.value || null })}
                  >
                    <option value="">Selecione…</option>
                    {[...r.faixas_etarias]
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((f) => (
                        <option key={f.codigo} value={f.codigo}>
                          {f.rotulo}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
              <Field id={id('faixa_imc_cod')} rotulo="Faixa de IMC (OMS)" obrigatorio erro={erro('faixa_imc_cod')} className="registro-linha">
                {(a11y) => (
                  <select
                    {...a11y}
                    className="controle-texto registro-select"
                    value={rascunho.faixa_imc_cod === undefined ? '' : rascunho.faixa_imc_cod === null ? IMC_NAO_INFORMADO : rascunho.faixa_imc_cod}
                    onChange={(e) => {
                      const v = e.target.value;
                      mudar({ faixa_imc_cod: v === '' ? undefined : v === IMC_NAO_INFORMADO ? null : v });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {[...r.faixas_imc]
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((f) => (
                        <option key={f.codigo} value={f.codigo}>
                          {f.rotulo}
                        </option>
                      ))}
                    <option value={IMC_NAO_INFORMADO}>Não informado</option>
                  </select>
                )}
              </Field>
              <Field
                id={id('tabagismo')}
                rotulo="Tabagismo"
                obrigatorio
                grupo
                ajuda="Nos painéis, tabagista = fumante atual."
                erro={erro('tabagismo')}
                className="registro-linha"
              >
                {(a11y) => (
                  <SegmentedControl
                    {...a11y}
                    nome={id('tabagismo')}
                    opcoes={r.opcoes.tabagismo.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }))}
                    valor={rascunho.tabagismo}
                    onChange={(tabagismo) => mudar({ tabagismo })}
                  />
                )}
              </Field>
              <Field id={id('cid10_principal')} rotulo="Diagnóstico principal (CID-10)" obrigatorio erro={erro('cid10_principal')} className="registro-linha">
                {(a11y) => (
                  <Combobox
                    {...a11y}
                    opcoes={opcoesDx}
                    valor={rascunho.cid10_principal}
                    onChange={(v) => mudar({ cid10_principal: v })}
                    rotuloGrupo={rotuloGrupoCid}
                    rotuloLista="Diagnósticos CID-10"
                    placeholder="CID-10 ou nome"
                    semResultado="Nenhum código encontrado na base."
                  />
                )}
              </Field>
              <Field
                id={id('comorbidades')}
                rotulo="Comorbidades"
                ajuda={`${plural(rascunho.comorbidades.length, 'comorbidade', 'comorbidades')}. O Data Mart guarda a quantidade; os códigos alimentam a Consulta por perfil.`}
                erro={erro('comorbidades')}
                className="registro-linha"
              >
                {(a11y) => (
                  <MultiCombobox
                    {...a11y}
                    opcoes={opcoesComorbidade}
                    valores={rascunho.comorbidades}
                    onChange={(comorbidades) => mudar({ comorbidades })}
                    grupos={GRUPOS_COMORBIDADE}
                    rotuloLista="Comorbidades CID-10"
                    semResultado="Nenhum código encontrado na base."
                    placeholder="Adicionar"
                  />
                )}
              </Field>
            </div>
          </PainelMedicao>

          {/* ---- 3. Medicamento ------------------------------------------------------- */}
          <PainelMedicao
            titulo={<Etapa n={3}>Medicamento prescrito neste atendimento</Etapa>}
            subtitulo="Se o paciente continua no mesmo medicamento, registre-o de novo com o status atual."
            densidade="formulario"
          >
            {emAndamento && (
              <div className="registro__anterior">
                <span>
                  No atendimento anterior: <strong>{inicialMaiuscula(emAndamento.principio_ativo)}</strong> desde {formatarData(emAndamento.data_inicio)}
                  {emAndamento.linha_tratamento ? ` · ${emAndamento.linha_tratamento}ª linha` : ''} · {rotuloStatus(emAndamento.status)}
                </span>
                <Button variante="secundario" className="botao--pequeno" onClick={() => manter(emAndamento)}>
                  Manter {inicialMaiuscula(emAndamento.principio_ativo)}
                </Button>
              </div>
            )}
            <div className="registro-campos">
              <Field id={id('medicamento_id')} rotulo="Medicamento (princípio ativo)" obrigatorio erro={erro('medicamento_id')} className="registro-linha">
                {(a11y) => (
                  <Combobox
                    {...a11y}
                    opcoes={opcoesMedicamento}
                    valor={rascunho.medicamento_id === null ? null : String(rascunho.medicamento_id)}
                    onChange={(v) => mudar({ medicamento_id: v === null ? null : Number(v) })}
                    textoSelecionado={(o) => o.rotulo}
                    rotuloLista="Medicamentos do catálogo"
                    placeholder="Buscar princípio ativo"
                    semResultado="Nenhum medicamento no catálogo."
                  />
                )}
              </Field>
              <Field
                id={id('data_inicio_medicamento')}
                rotulo="Data de início do medicamento"
                obrigatorio
                ajuda="Em continuação, é a data original."
                erro={erro('data_inicio_medicamento')}
                className="registro-linha"
              >
                {(a11y) => (
                  <DateField
                    {...a11y}
                    valor={rascunho.data_inicio_medicamento}
                    max={rascunho.data_atendimento ?? hoje}
                    onChange={(v) => mudar({ data_inicio_medicamento: v })}
                  />
                )}
              </Field>
              <Field
                id={id('linha_tratamento')}
                rotulo="Linha de tratamento"
                grupo
                ajuda={`${
                  ficha
                    ? `Pelo histórico, um medicamento novo seria a ${Math.min(maiorLinha + 1, 4)}ª linha${maiorLinha + 1 >= 4 ? ' ou mais' : ''}.`
                    : 'Primeiro medicamento tentado = 1ª linha.'
                } Opcional: se não souber, marque "Não sabemos" em vez de estimar.`}
                erro={erro('linha_tratamento')}
                className="registro-linha"
              >
                {(a11y) => (
                  <SegmentedControl
                    {...a11y}
                    nome={id('linha_tratamento')}
                    opcoes={LINHAS}
                    valor={
                      rascunho.linha_tratamento === undefined
                        ? null
                        : rascunho.linha_tratamento === null
                          ? LINHA_NAO_SABEMOS
                          : String(Math.min(rascunho.linha_tratamento, 4))
                    }
                    onChange={(v) => mudar({ linha_tratamento: v === LINHA_NAO_SABEMOS ? null : Number(v) })}
                  />
                )}
              </Field>
              <Field
                id={id('status')}
                rotulo="Status do tratamento nesta consulta"
                obrigatorio
                ajuda="Dias de seguimento (data do atendimento − início do medicamento) são calculados ao salvar."
                erro={erro('status')}
                className="registro-linha"
              >
                {(a11y) => (
                  <select
                    {...a11y}
                    className="controle-texto registro-select"
                    value={rascunho.status ?? ''}
                    onChange={(e) => mudar({ status: (e.target.value || null) as StatusTratamento | null })}
                  >
                    <option value="">Selecione…</option>
                    {GRUPOS_STATUS.map((g) => (
                      <optgroup key={g.grupo} label={g.rotulo}>
                        {r.opcoes.status_tratamento
                          .filter((o) => o.grupo === g.grupo)
                          .map((o) => (
                            <option key={o.codigo} value={o.codigo}>
                              {o.rotulo}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </PainelMedicao>

          {/* ---- 4. Reações ----------------------------------------------------------- */}
          <PainelMedicao
            titulo={<Etapa n={4}>Reações adversas relatadas neste atendimento</Etapa>}
            subtitulo="Uma consulta pode ter várias reações. A reação pode ser do medicamento anterior, quando a troca aconteceu por causa dela."
            densidade="formulario"
          >
            {rascunho.reacoes.length === 0 && <p className="texto-apoio">Nenhuma reação adicionada.</p>}
            <ol className="reacoes">
              {rascunho.reacoes.map((x, i) => (
                <BlocoReacao
                  key={x.id}
                  n={i + 1}
                  reacao={x}
                  rascunho={rascunho}
                  catalogo={catalogo}
                  anteriores={anteriores}
                  erro={erro}
                  onMudar={(patch) => mudarReacao(x.id, patch)}
                  onRemover={() => removerReacao(x.id)}
                />
              ))}
            </ol>
            <Button id="reg-adicionar-reacao" variante="secundario" icone={<Plus size={14} />} onClick={adicionarReacao} disabled={rascunho.reacoes.length >= 20}>
              {rascunho.reacoes.length ? 'Adicionar outra reação' : 'Adicionar reação'}
            </Button>
          </PainelMedicao>
        </div>

        <ResumoRegistro
          chave={rascunho.chave && FORMATO_CHAVE.test(rascunho.chave) ? rascunho.chave : novo ? 'nova' : '—'}
          numero={novo ? '1º' : ficha ? `${ficha.atendimentos.length + 1}º deste paciente` : '—'}
          medicamento={medicamento ? inicialMaiuscula(medicamento.principio_ativo) : 'a definir'}
          nReacoes={rascunho.reacoes.length}
          pendencias={pendencias}
          ficha={ficha}
          rotuloStatus={rotuloStatus}
          onIrPara={(chave) => setFoco(idDom(chave))}
        />
      </div>

      <p className="texto-apoio registro__rodape">
        O atendimento entra na base da ala e alimenta as próximas análises. Correções de dados vindos do hospital são feitas na origem e
        chegam pela próxima carga. <LinkRota para="/metodologia">Metodologia</LinkRota>
      </p>
    </>
  );
}

function Etapa({ n, children }: { n: number; children: string }) {
  return (
    <span className="etapa">
      <span className="etapa__numero" aria-hidden="true">
        {n}
      </span>
      {children}
    </span>
  );
}
