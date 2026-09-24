/**
 * Bloco T1..Tn: cartão interno recolhível com linha-resumo, remoção com confirmação inline.
 * Sem placeholder de dose, sem faixa "plausível", sem pré-seleção de via, status, gravidade
 * (gravidade_padrao do catálogo NÃO pré-preenche) ou "levou à descontinuação".
 */
import { ChevronRight, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import type { GrupoStatus, StatusTratamento } from '../../api/types';
import { Button } from '../../components/Button';
import { Combobox, type OpcaoCombobox } from '../../components/Combobox';
import { DateField } from '../../components/DateField';
import { Field, type CampoA11y } from '../../components/Field';
import { NumberField } from '../../components/NumberField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatarData, plural } from '../../lib/format';
import type { ApiCampos } from './campos';
import {
  chaveReacao,
  chaveTratamento,
  ehCensura,
  ehEncerrado,
  idDom,
  type CampoReacao,
  type CampoTratamento,
  type RascunhoReacao,
  type RascunhoTratamento,
} from './modelo';
import { NotaConsistencia } from './NotaConsistencia';

/** Três grupos rotulados de status (grupo vem de /referencias.opcoes.status_tratamento). */
const GRUPOS_STATUS: { rotulo: string; grupo: GrupoStatus }[] = [
  { rotulo: 'Sem desfecho conhecido', grupo: 'censura' },
  { rotulo: 'Encerrado', grupo: 'sucesso' },
  { rotulo: 'Descontinuado', grupo: 'descontinuacao' },
];

export type PatchTratamento = Partial<Omit<RascunhoTratamento, 'id' | 'reacoes'>>;
export type PatchReacao = Partial<Omit<RascunhoReacao, 'id'>>;

interface Props {
  tratamento: RascunhoTratamento;
  /** Posição atual (0 = T1). */
  indice: number;
  aberto: boolean;
  podeRemover: boolean;
  confirmandoRemocao: boolean;
  /** Existe "data de fim removida · Desfazer" para este bloco. */
  podeDesfazerDataFim: boolean;
  campos: ApiCampos;
  onAlternar: () => void;
  onAtualizar: (patch: PatchTratamento) => void;
  onMudarStatus: (status: StatusTratamento) => void;
  onDesfazerDataFim: () => void;
  onPedirRemocao: () => void;
  onCancelarRemocao: () => void;
  onConfirmarRemocao: () => void;
  onAdicionarReacao: () => void;
  onAtualizarReacao: (rid: number, patch: PatchReacao) => void;
  onRemoverReacao: (rid: number) => void;
}

export function idCabecalhoTratamento(tid: number): string {
  return `reg-t${tid}-cabecalho`;
}
export function idAdicionarReacao(tid: number): string {
  return `reg-t${tid}-adicionar-reacao`;
}

export function BlocoTratamento(props: Props) {
  const { tratamento: t, indice, aberto, campos } = props;
  const { catalogo } = campos;
  const r = catalogo.referencias;
  const rotulo = `T${indice + 1}`;
  const idCorpo = `reg-t${t.id}-corpo`;

  const removerRef = useRef<HTMLButtonElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.confirmandoRemocao) cancelarRef.current?.focus();
  }, [props.confirmandoRemocao]);

  const k = (campo: CampoTratamento) => chaveTratamento(t.id, campo);
  const id = (campo: CampoTratamento) => idDom(k(campo));
  const erro = (campo: CampoTratamento) => campos.erro(k(campo));

  const opcoesMedicamento = useMemo<OpcaoCombobox[]>(
    () => r.medicamentos.map((m) => ({ valor: String(m.id), rotulo: m.principio_ativo, detalhe: m.classe_terapeutica, codigo: m.codigo_atc })),
    [r.medicamentos],
  );

  // ---- linha-resumo ---------------------------------------------------------
  const medicamento = t.medicamento_id !== null ? catalogo.medicamento(t.medicamento_id) : undefined;
  const statusRotulo = t.status ? catalogo.status(t.status)?.rotulo : undefined;
  const pendencias = campos.pendenciasDoTratamento(t.id);
  const resumo = [
    medicamento?.principio_ativo ?? 'medicamento não escolhido',
    t.data_inicio ? `início ${formatarData(t.data_inicio)}` : null,
    statusRotulo ? statusRotulo.charAt(0).toLowerCase() + statusRotulo.slice(1) : null,
    plural(t.reacoes.length, 'reação', 'reações'),
    pendencias ? plural(pendencias, 'pendência', 'pendências') : null,
  ].filter(Boolean);

  const n = t.reacoes.length;
  const perguntaRemocao = n === 0 ? `Remover ${rotulo}?` : `Remover ${rotulo} e ${n === 1 ? 'sua 1 reação' : `suas ${n} reações`}?`;

  function cancelarRemocao() {
    props.onCancelarRemocao();
    removerRef.current?.focus();
  }

  // ---- campos ---------------------------------------------------------------
  const temDose = t.dose_inicial !== null || t.dose_manutencao !== null;
  const censura = ehCensura(t.status);
  const encerrado = ehEncerrado(t.status);

  function numero(campo: 'linha_tratamento' | 'dose_inicial' | 'dose_manutencao', decimais: number) {
    return (a11y: CampoA11y) => (
      <NumberField
        {...a11y}
        id={id(campo)}
        decimais={decimais}
        valor={t[campo]}
        onChange={(valor, valido) => {
          props.onAtualizar({ [campo]: valor });
          campos.marcarEntrada(k(campo), !valido);
        }}
        onBlur={() => campos.tocar(k(campo))}
      />
    );
  }

  function data(campo: 'data_inicio' | 'data_fim' | 'data_ultima_observacao', valorExibido: string | null, min?: string, disabled?: boolean) {
    return (a11y: CampoA11y) => (
      <DateField
        {...a11y}
        id={id(campo)}
        valor={valorExibido}
        min={min}
        disabled={disabled}
        onChange={(iso) => props.onAtualizar({ [campo]: iso })}
        onBlur={({ incompleta }) => {
          campos.marcarEntrada(k(campo), incompleta);
          campos.tocar(k(campo));
        }}
      />
    );
  }

  return (
    <section className="bloco-tratamento" aria-label={`Tratamento ${rotulo}`}>
      <div className="bloco-tratamento__cabecalho">
        <button
          type="button"
          id={idCabecalhoTratamento(t.id)}
          className="bloco-tratamento__alternar"
          aria-expanded={aberto}
          aria-controls={idCorpo}
          onClick={props.onAlternar}
        >
          <ChevronRight size={16} aria-hidden="true" className="bloco-tratamento__chevron" />
          <span className="bloco-tratamento__indice code">{rotulo}</span>
          <span className="bloco-tratamento__resumo">{resumo.join(' · ')}</span>
        </button>
        {props.podeRemover && (
          <Button ref={removerRef} variante="secundario" onClick={props.onPedirRemocao} aria-expanded={props.confirmandoRemocao}>
            Remover
          </Button>
        )}
      </div>

      {props.confirmandoRemocao && (
        <div
          className="confirmacao-inline"
          role="group"
          aria-label={`Confirmar remoção de ${rotulo}`}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancelarRemocao();
            }
          }}
        >
          <p>{perguntaRemocao}</p>
          <div className="confirmacao-inline__acoes">
            <Button variante="primario" onClick={props.onConfirmarRemocao}>
              Remover
            </Button>
            <Button ref={cancelarRef} variante="secundario" onClick={cancelarRemocao}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div id={idCorpo} className="bloco-tratamento__corpo" hidden={!aberto}>
        <Field id={id('medicamento_id')} rotulo="Medicamento" obrigatorio erro={erro('medicamento_id')} className="col-inteira">
          {(a11y) => (
            <Combobox
              {...a11y}
              opcoes={opcoesMedicamento}
              valor={t.medicamento_id !== null ? String(t.medicamento_id) : null}
              onChange={(v) => {
                props.onAtualizar({ medicamento_id: v === null ? null : Number(v) });
                campos.tocar(k('medicamento_id'));
              }}
              textoSelecionado={(o) => `${o.rotulo} · ${o.detalhe}`}
              rotuloLista={`Medicamentos do catálogo (${r.medicamentos.length})`}
              placeholder="Buscar medicamento"
              semResultado="Nenhum medicamento encontrado na base."
            />
          )}
        </Field>

        <Field id={id('data_inicio')} rotulo="Data de início" obrigatorio erro={erro('data_inicio')}>
          {data('data_inicio', t.data_inicio)}
        </Field>
        <Field id={id('linha_tratamento')} rotulo="Linha de tratamento" erro={erro('linha_tratamento')} complemento="opcional">
          {numero('linha_tratamento', 0)}
        </Field>

        <Field id={id('via')} rotulo="Via" obrigatorio grupo erro={erro('via')} className="col-inteira">
          {(a11y) => (
            <SegmentedControl
              {...a11y}
              nome={id('via')}
              opcoes={r.opcoes.via.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }))}
              valor={t.via}
              onChange={(v) => {
                props.onAtualizar({ via: v });
                campos.tocar(k('via'));
              }}
            />
          )}
        </Field>

        <div className="bloco-tratamento__doses col-inteira">
          <Field id={id('dose_inicial')} rotulo="Dose inicial" erro={erro('dose_inicial')}>
            {numero('dose_inicial', 2)}
          </Field>
          <Field id={id('dose_manutencao')} rotulo="Dose de manutenção" erro={erro('dose_manutencao')}>
            {numero('dose_manutencao', 2)}
          </Field>
          <Field id={id('unidade_dose')} rotulo="Unidade" obrigatorio={temDose} erro={erro('unidade_dose')}>
            {(a11y) => (
              <select
                {...a11y}
                className="controle-texto registro-select registro-select--curto"
                value={t.unidade_dose ?? ''}
                onChange={(e) => {
                  props.onAtualizar({ unidade_dose: e.target.value || null });
                  campos.tocar(k('unidade_dose'));
                }}
              >
                <option value="">Selecione</option>
                {r.opcoes.unidades_dose.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <h4 className="registro-subtitulo registro-subtitulo--interno col-inteira">Desfecho</h4>

        <Field id={id('status')} rotulo="Status" obrigatorio grupo erro={erro('status')} className="col-inteira">
          {(a11y) => (
            <div {...a11y} role="radiogroup" className="status-grupos">
              {GRUPOS_STATUS.map((g) => {
                const idGrupo = `${id('status')}-g-${g.grupo}`;
                return (
                  <div key={g.grupo} role="group" aria-labelledby={idGrupo} className="status-grupo">
                    <span id={idGrupo} className="micro status-grupo__rotulo">
                      {g.rotulo}
                    </span>
                    <div className="status-grupo__opcoes">
                      {r.opcoes.status_tratamento
                        .filter((o) => o.grupo === g.grupo)
                        .map((o) => (
                          <label key={o.codigo} className="radio">
                            <input type="radio" name={`${id('status')}-radio`} value={o.codigo} checked={t.status === o.codigo} onChange={() => props.onMudarStatus(o.codigo)} />
                            <span>{o.rotulo}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Field>

        <div>
          <Field
            id={id('data_fim')}
            rotulo="Data de fim"
            obrigatorio={encerrado}
            erro={censura ? null : erro('data_fim')}
            ajuda={censura ? 'Não se aplica a este status.' : undefined}
          >
            {data('data_fim', t.data_fim, t.data_inicio ?? undefined, censura)}
          </Field>
          {props.podeDesfazerDataFim && (
            <p className="linha-desfazer caption">
              Data de fim removida ·{' '}
              <Button variante="link" onClick={props.onDesfazerDataFim}>
                Desfazer
              </Button>
            </p>
          )}
        </div>
        <Field
          id={id('data_ultima_observacao')}
          rotulo="Data da última observação"
          obrigatorio={censura}
          erro={erro('data_ultima_observacao')}
        >
          {data(
            'data_ultima_observacao',
            t.data_ultima_observacao ?? (encerrado ? t.data_fim : null),
            (encerrado ? t.data_fim : null) ?? t.data_inicio ?? undefined,
          )}
        </Field>

        <Field id={id('efetividade_percebida')} rotulo="Efetividade percebida" grupo complemento="opcional" className="col-inteira">
          {(a11y) => (
            <div {...a11y} role="group" className="efetividade">
              {[1, 2, 3, 4, 5].map((nota) => (
                <button
                  key={nota}
                  type="button"
                  className="efetividade__opcao"
                  aria-pressed={t.efetividade_percebida === nota}
                  onClick={() => props.onAtualizar({ efetividade_percebida: t.efetividade_percebida === nota ? null : nota })}
                >
                  {nota}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="col-inteira">
          <h4 id={id('reacoes')} tabIndex={-1} className="registro-subtitulo registro-subtitulo--interno">
            Reações adversas{t.reacoes.length > 0 && <span className="registro-subtitulo__contagem">{t.reacoes.length}</span>}
          </h4>
          {campos.alerta(k('reacoes')) && <NotaConsistencia>{campos.alerta(k('reacoes'))}</NotaConsistencia>}
          {t.reacoes.length > 0 && (
            <ul className="reacoes">
              {t.reacoes.map((reacao, j) => (
                <LinhaReacao
                  key={reacao.id}
                  tid={t.id}
                  reacao={reacao}
                  rotulo={`reação ${j + 1} de ${rotulo}`}
                  usadas={t.reacoes.filter((x) => x.id !== reacao.id).map((x) => x.reacao_adversa_id)}
                  campos={campos}
                  onAtualizar={(patch) => props.onAtualizarReacao(reacao.id, patch)}
                  onRemover={() => props.onRemoverReacao(reacao.id)}
                />
              ))}
            </ul>
          )}
          <Button id={idAdicionarReacao(t.id)} variante="link" icone={<Plus size={14} />} onClick={props.onAdicionarReacao}>
            Adicionar reação
          </Button>
        </div>
      </div>
    </section>
  );
}

interface PropsReacao {
  tid: number;
  reacao: RascunhoReacao;
  rotulo: string;
  usadas: (number | null)[];
  campos: ApiCampos;
  onAtualizar: (patch: PatchReacao) => void;
  onRemover: () => void;
}

function LinhaReacao({ tid, reacao, rotulo, usadas, campos, onAtualizar, onRemover }: PropsReacao) {
  const r = campos.catalogo.referencias;
  const k = (campo: CampoReacao) => chaveReacao(tid, reacao.id, campo);
  const id = (campo: CampoReacao) => idDom(k(campo));
  const erro = (campo: CampoReacao) => campos.erro(k(campo));

  const opcoes = useMemo<OpcaoCombobox[]>(
    () =>
      r.reacoes_adversas.map((x) => ({
        valor: String(x.id),
        rotulo: x.termo,
        detalhe: x.soc,
        desabilitada: usadas.includes(x.id),
        motivoDesabilitada: 'já registrada neste tratamento',
      })),
    [r.reacoes_adversas, usadas],
  );
  const notas = [campos.alerta(k('dias_ate_inicio')), campos.alerta(k('levou_descontinuacao'))].filter(Boolean);

  return (
    <li className="reacao">
      <Field id={id('reacao_adversa_id')} rotulo="Reação" obrigatorio erro={erro('reacao_adversa_id')}>
        {(a11y) => (
          <Combobox
            {...a11y}
            opcoes={opcoes}
            valor={reacao.reacao_adversa_id !== null ? String(reacao.reacao_adversa_id) : null}
            onChange={(v) => {
              onAtualizar({ reacao_adversa_id: v === null ? null : Number(v) });
              campos.tocar(k('reacao_adversa_id'));
            }}
            textoSelecionado={(o) => o.rotulo}
            rotuloLista="Reações adversas do catálogo"
            placeholder="Buscar termo"
            semResultado="Nenhum termo encontrado na base."
          />
        )}
      </Field>
      <Field id={id('dias_ate_inicio')} rotulo="Início após" erro={erro('dias_ate_inicio')}>
        {(a11y) => (
          <NumberField
            {...a11y}
            valor={reacao.dias_ate_inicio}
            unidade="dias"
            onChange={(valor, valido) => {
              onAtualizar({ dias_ate_inicio: valor });
              campos.marcarEntrada(k('dias_ate_inicio'), !valido);
            }}
            onBlur={() => campos.tocar(k('dias_ate_inicio'))}
          />
        )}
      </Field>
      <Field id={id('gravidade_observada')} rotulo="Gravidade" obrigatorio grupo erro={erro('gravidade_observada')}>
        {(a11y) => (
          <SegmentedControl
            {...a11y}
            nome={id('gravidade_observada')}
            opcoes={r.opcoes.gravidade.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }))}
            valor={reacao.gravidade_observada}
            onChange={(v) => {
              onAtualizar({ gravidade_observada: v });
              campos.tocar(k('gravidade_observada'));
            }}
          />
        )}
      </Field>
      <Field id={id('levou_descontinuacao')} rotulo="Levou a parar" obrigatorio grupo erro={erro('levou_descontinuacao')}>
        {(a11y) => (
          <SegmentedControl
            {...a11y}
            nome={id('levou_descontinuacao')}
            opcoes={[
              { valor: 'sim', rotulo: 'Sim' },
              { valor: 'nao', rotulo: 'Não' },
            ]}
            valor={reacao.levou_descontinuacao === null ? null : reacao.levou_descontinuacao ? 'sim' : 'nao'}
            onChange={(v) => {
              onAtualizar({ levou_descontinuacao: v === 'sim' });
              campos.tocar(k('levou_descontinuacao'));
            }}
          />
        )}
      </Field>
      <button type="button" className="reacao__remover" aria-label={`Remover ${rotulo}`} onClick={onRemover}>
        <X size={16} aria-hidden="true" />
      </button>
      {notas.length > 0 && (
        <div className="reacao__notas">
          {notas.map((nota) => (
            <NotaConsistencia key={nota}>{nota}</NotaConsistencia>
          ))}
        </div>
      )}
    </li>
  );
}
