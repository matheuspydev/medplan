/**
 * Seção Perfil — diagnóstico, sexo, faixa etária, comorbidades e condições clínicas.
 * Tudo exige escolha explícita, sem valor inicial. Gestação/lactação NÃO reage ao sexo (de propósito).
 */
import { useMemo } from 'react';
import { rotuloGrupoCid } from '../../api/referencias';
import type { OpcaoRotulo } from '../../api/types';
import { Combobox, type OpcaoCombobox } from '../../components/Combobox';
import { Field } from '../../components/Field';
import { MultiCombobox } from '../../components/MultiCombobox';
import { PainelMedicao } from '../../components/PainelMedicao';
import { SegmentedControl } from '../../components/SegmentedControl';
import { rotuloCurtoFaixa } from '../../lib/format';
import type { ApiCampos } from './campos';
import { chavePerfil, idDom, type CampoPerfil, type RascunhoPerfil } from './modelo';

/** Valor do <select> de IMC para "Desconhecida" (vira null no payload). */
const IMC_DESCONHECIDA = '__desconhecida';

const GRUPOS_COMORBIDADE = [
  { chave: 'psiquiatrica', rotulo: 'Psiquiátricas (capítulo F)' },
  { chave: 'clinica', rotulo: 'Clínicas' },
];

interface Props {
  perfil: RascunhoPerfil;
  campos: ApiCampos;
  onChange: <K extends CampoPerfil>(campo: K, valor: RascunhoPerfil[K]) => void;
}

const segmentos = <C extends string>(lista: OpcaoRotulo<C>[]) => lista.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }));

export function SecaoPerfil({ perfil, campos, onChange }: Props) {
  const { catalogo } = campos;
  const r = catalogo.referencias;

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
        desabilitada: c.codigo === perfil.cid10_principal,
        motivoDesabilitada: 'já é o diagnóstico principal',
      })),
    [r.cid10, perfil.cid10_principal],
  );

  /** Escolha em controle de opção: marca como tocado já na mudança. */
  function escolher<K extends CampoPerfil>(campo: K, valor: RascunhoPerfil[K]) {
    onChange(campo, valor);
    campos.tocar(chavePerfil(campo));
  }

  const id = (campo: CampoPerfil) => idDom(chavePerfil(campo));
  const erro = (campo: CampoPerfil) => campos.erro(chavePerfil(campo));

  type CampoSegmentado = 'sexo' | 'tabagismo' | 'gestacao_lactacao' | 'funcao_renal' | 'funcao_hepatica' | 'uso_substancias';

  function segmentado(campo: CampoSegmentado, rotulo: string, opcoes: OpcaoRotulo[]) {
    return (
      <Field id={id(campo)} rotulo={rotulo} obrigatorio grupo erro={erro(campo)} className="registro-linha">
        {(a11y) => (
          <SegmentedControl
            {...a11y}
            nome={id(campo)}
            opcoes={segmentos(opcoes)}
            valor={perfil[campo]}
            onChange={(v) => escolher(campo, v as RascunhoPerfil[CampoSegmentado])}
          />
        )}
      </Field>
    );
  }

  const valorImc = perfil.faixa_imc_cod === undefined ? '' : perfil.faixa_imc_cod === null ? IMC_DESCONHECIDA : perfil.faixa_imc_cod;

  return (
    <PainelMedicao titulo="Perfil" densidade="formulario" id="reg-secao-perfil">
      <div className="registro-campos">
        <Field id={id('cid10_principal')} rotulo="Diagnóstico principal" obrigatorio erro={erro('cid10_principal')} className="registro-linha">
          {(a11y) => (
            <Combobox
              {...a11y}
              opcoes={opcoesDx}
              valor={perfil.cid10_principal}
              onChange={(v) => {
                escolher('cid10_principal', v);
                campos.tocar(chavePerfil('comorbidades'));
              }}
              rotuloGrupo={rotuloGrupoCid}
              rotuloLista="Diagnósticos CID-10"
              placeholder="CID-10 ou nome"
              semResultado="Nenhum código encontrado na base."
            />
          )}
        </Field>

        {segmentado('sexo', 'Sexo', r.opcoes.sexo)}

        <Field id={id('faixa_etaria_cod')} rotulo="Faixa etária" obrigatorio grupo erro={erro('faixa_etaria_cod')} className="registro-linha">
          {(a11y) => (
            <SegmentedControl
              {...a11y}
              nome={id('faixa_etaria_cod')}
              opcoes={[...r.faixas_etarias]
                .sort((a, b) => a.ordem - b.ordem)
                .map((f) => ({
                  valor: f.codigo,
                  rotulo: (
                    <>
                      <span aria-hidden="true">{rotuloCurtoFaixa(f.rotulo)}</span>
                      <span className="sr-only">{f.rotulo}</span>
                    </>
                  ),
                }))}
              valor={perfil.faixa_etaria_cod}
              onChange={(v) => escolher('faixa_etaria_cod', v)}
            />
          )}
        </Field>

        <Field id={id('comorbidades')} rotulo="Comorbidades" erro={erro('comorbidades')} className="registro-linha">
          {(a11y) => (
            <MultiCombobox
              {...a11y}
              opcoes={opcoesComorbidade}
              valores={perfil.comorbidades}
              onChange={(v) => escolher('comorbidades', v)}
              grupos={GRUPOS_COMORBIDADE}
              rotuloLista="Comorbidades CID-10"
              semResultado="Nenhum código encontrado na base."
              placeholder="Adicionar"
            />
          )}
        </Field>
      </div>

      <h3 className="registro-subtitulo">Condições clínicas</h3>
      <div className="registro-campos">
        <Field id={id('faixa_imc_cod')} rotulo="Faixa de IMC" obrigatorio erro={erro('faixa_imc_cod')} className="registro-linha">
          {(a11y) => (
            <select
              {...a11y}
              className="controle-texto registro-select"
              value={valorImc}
              onChange={(e) => {
                const v = e.target.value;
                escolher('faixa_imc_cod', v === '' ? undefined : v === IMC_DESCONHECIDA ? null : v);
              }}
            >
              <option value="">Selecione</option>
              {[...r.faixas_imc]
                .sort((a, b) => a.ordem - b.ordem)
                .map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.rotulo}
                  </option>
                ))}
              <option value={IMC_DESCONHECIDA}>Desconhecida</option>
            </select>
          )}
        </Field>
        {segmentado('tabagismo', 'Tabagismo', r.opcoes.tabagismo)}
        {segmentado('gestacao_lactacao', 'Gestação/lactação', r.opcoes.gestacao_lactacao)}
        {segmentado('funcao_renal', 'Função renal', r.opcoes.funcao_renal)}
        {segmentado('funcao_hepatica', 'Função hepática', r.opcoes.funcao_hepatica)}
        {segmentado('uso_substancias', 'Uso de substâncias', r.opcoes.uso_substancias)}
      </div>
    </PainelMedicao>
  );
}
