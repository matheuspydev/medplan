/**
 * Uma reação relatada no atendimento: termo, medicamento que causou (o prescrito agora ou um
 * anterior do paciente), data de início, gravidade e se levou à descontinuação.
 */
import { X } from 'lucide-react';
import { useMemo } from 'react';
import type { Catalogo } from '../../api/referencias';
import { Combobox, type OpcaoCombobox } from '../../components/Combobox';
import { DateField } from '../../components/DateField';
import { Field } from '../../components/Field';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatarData, formatarDias, inicialMaiuscula } from '../../lib/format';
import { CAUSADOR_ATUAL, causadorDe, diasEntre, idDom, valorCausador, type Rascunho, type RascunhoReacao, type TratamentoAnterior } from './modelo';

interface Props {
  n: number;
  reacao: RascunhoReacao;
  rascunho: Rascunho;
  catalogo: Catalogo;
  /** Tratamentos anteriores do paciente (sem o prescrito neste atendimento). */
  anteriores: (TratamentoAnterior & { principio_ativo: string; data_ultima_observacao: string })[];
  erro: (chave: string) => string | null;
  onMudar: (patch: Partial<RascunhoReacao>) => void;
  onRemover: () => void;
}

export function BlocoReacao({ n, reacao, rascunho, catalogo, anteriores, erro, onMudar, onRemover }: Props) {
  const r = catalogo.referencias;
  const k = (campo: string) => `r${reacao.id}.${campo}`;
  const opcoes = useMemo<OpcaoCombobox[]>(
    () => r.reacoes_adversas.map((x) => ({ valor: String(x.id), rotulo: x.termo, detalhe: x.soc })),
    [r.reacoes_adversas],
  );
  const causador = causadorDe(reacao, rascunho);
  const dias = causador && reacao.data_inicio_reacao && !reacao.sem_data ? diasEntre(causador.data_inicio, reacao.data_inicio_reacao) : null;
  const atual = rascunho.medicamento_id !== null ? catalogo.medicamento(rascunho.medicamento_id) : undefined;
  const rotulo = `Reação ${n}`;

  return (
    <li className="reacao">
      <div className="reacao__cabecalho">
        <span className="reacao__titulo">{rotulo}</span>
        <button type="button" className="reacao__remover" aria-label={`Remover ${rotulo}`} onClick={onRemover}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <Field id={idDom(k('reacao_adversa_id'))} rotulo="Termo (MedDRA)" obrigatorio erro={erro(k('reacao_adversa_id'))}>
        {(a11y) => (
          <Combobox
            {...a11y}
            opcoes={opcoes}
            valor={reacao.reacao_adversa_id !== null ? String(reacao.reacao_adversa_id) : null}
            onChange={(v) => onMudar({ reacao_adversa_id: v === null ? null : Number(v) })}
            textoSelecionado={(o) => o.rotulo}
            rotuloLista="Reações adversas do catálogo"
            placeholder="Buscar termo"
            semResultado="Nenhum termo encontrado na base."
          />
        )}
      </Field>
      <Field id={idDom(k('causador'))} rotulo="Medicamento que causou" obrigatorio erro={erro(k('causador'))}>
        {(a11y) => (
          <select {...a11y} className="controle-texto" value={reacao.causador ?? ''} onChange={(e) => onMudar({ causador: e.target.value || null })}>
            <option value="">Selecione…</option>
            <option value={CAUSADOR_ATUAL}>Prescrito neste atendimento{atual ? ` (${inicialMaiuscula(atual.principio_ativo)})` : ''}</option>
            {anteriores.map((t) => (
              <option key={valorCausador(t)} value={valorCausador(t)}>
                {inicialMaiuscula(t.principio_ativo)} (anterior, de {formatarData(t.data_inicio)} a {formatarData(t.data_ultima_observacao)})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field
        id={idDom(k('data_inicio_reacao'))}
        rotulo="Data de início da reação"
        obrigatorio={!reacao.sem_data}
        ajuda={dias !== null ? `Dias até a reação: ${formatarDias(dias)} (início da reação − início do medicamento).` : undefined}
        erro={erro(k('data_inicio_reacao'))}
      >
        {(a11y) => (
          <div className="reacao__data">
            <DateField
              {...a11y}
              valor={reacao.sem_data ? null : reacao.data_inicio_reacao}
              min={causador?.data_inicio}
              max={rascunho.data_atendimento ?? undefined}
              disabled={reacao.sem_data}
              onChange={(v) => onMudar({ data_inicio_reacao: v })}
            />
            <label className="caixa">
              <input type="checkbox" checked={reacao.sem_data} onChange={(e) => onMudar({ sem_data: e.target.checked })} />
              Paciente não soube informar
            </label>
          </div>
        )}
      </Field>
      <Field id={idDom(k('gravidade_observada'))} rotulo="Gravidade" obrigatorio grupo erro={erro(k('gravidade_observada'))}>
        {(a11y) => (
          <SegmentedControl
            {...a11y}
            nome={idDom(k('gravidade_observada'))}
            opcoes={r.opcoes.gravidade.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }))}
            valor={reacao.gravidade_observada}
            onChange={(v) => onMudar({ gravidade_observada: v })}
          />
        )}
      </Field>
      <Field id={idDom(k('levou_descontinuacao'))} rotulo="Levou à descontinuação?" obrigatorio grupo erro={erro(k('levou_descontinuacao'))}>
        {(a11y) => (
          <SegmentedControl
            {...a11y}
            nome={idDom(k('levou_descontinuacao'))}
            opcoes={[
              { valor: 'sim', rotulo: 'Sim' },
              { valor: 'nao', rotulo: 'Não' },
            ]}
            valor={reacao.levou_descontinuacao === null ? null : reacao.levou_descontinuacao ? 'sim' : 'nao'}
            onChange={(v) => onMudar({ levou_descontinuacao: v === 'sim' })}
          />
        )}
      </Field>
    </li>
  );
}
