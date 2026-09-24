/**
 * Cartão "Perfil do paciente" no topo da Consulta: diagnóstico, comorbidades, sexo e faixa etária,
 * e no rodapé os parâmetros (horizonte, n mínimo) com o botão Analisar. Largo de propósito: nomes de
 * CID longos e a lista de opções cabem sem corte. Continua editável depois da leitura; com uma
 * leitura vigente (não desatualizada), mostra sob cada campo ignorado "ignorado no nível k · ...".
 */
import { FunnelX } from 'lucide-react';
import { forwardRef, useMemo, type ReactNode } from 'react';
import { rotuloGrupoCid, type Catalogo } from '../../api/referencias';
import type { AnaliseResposta, Sexo } from '../../api/types';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { Button } from '../../components/Button';
import { Combobox, type OpcaoCombobox } from '../../components/Combobox';
import { Field } from '../../components/Field';
import { MultiCombobox } from '../../components/MultiCombobox';
import { NumberField } from '../../components/NumberField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Stepper } from '../../components/Stepper';
import { formatarInteiro, NBSP, plural, rotuloCurtoFaixa } from '../../lib/format';
import { ID_FOCO, type ErrosConsulta, type Formulario } from './formulario';
import { grupoDaSubstituicao } from './ValorSubstituido';

const PRESETS_SEMANAS = [4, 8, 12, 16, 24];

const GRUPOS_COMORBIDADE = [
  { chave: 'psiquiatrica', rotulo: 'Psiquiátricas (capítulo F)' },
  { chave: 'clinica', rotulo: 'Clínicas' },
];

function LinhaDesvio({ children }: { children: ReactNode }) {
  return (
    <p className="linha-desvio">
      <FunnelX size={12} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Linhas por campo, a partir das substituições do nível em que o motor parou. */
function linhasDesvio(leitura: AnaliseResposta | null): Partial<Record<'dx' | 'sexo' | 'faixa' | 'com', string>> {
  if (!leitura) return {};
  const { ordem, substituicoes } = leitura.nivel;
  const prefixo = `ignorado no nível ${ordem} · `;
  const sub = (criterio: string) => substituicoes.find((s) => s.criterio === criterio);
  const linhas: Partial<Record<'dx' | 'sexo' | 'faixa' | 'com', string>> = {};

  if (ordem >= 2) linhas.com = `${prefixo}comorbidades não filtradas`;
  else if (ordem === 1) linhas.com = `${prefixo}comorbidades clínicas não filtradas`;

  const faixa = sub('faixa etária');
  if (faixa) linhas.faixa = `${prefixo}coorte usou ${faixa.valor_usado}`;

  if (sub('sexo')) linhas.sexo = `${prefixo}coorte inclui todos os sexos`;

  const cid = sub('código CID-10');
  if (cid) {
    const grupo = grupoDaSubstituicao(cid.valor_usado);
    const codigos = cid.codigos_grupo ?? [];
    linhas.dx =
      cid.grupo_amplia === false
        ? `${prefixo}o grupo ${grupo} só contém ${codigos.join(', ')} neste catálogo`
        : `${prefixo}coorte usou o grupo ${grupo} (${plural(codigos.length, 'código', 'códigos')})`;
  }
  return linhas;
}

export interface PerfilPacienteProps {
  catalogo: Catalogo;
  form: Formulario;
  alterar: (parcial: Partial<Formulario>) => void;
  erros: ErrosConsulta;
  /** Leitura vigente e atual; null esconde as linhas de desvio (sem leitura, desatualizada ou carregando). */
  leituraVigente: AnaliseResposta | null;
  onAnalisar: () => void;
}

export const PerfilPaciente = forwardRef<HTMLElement, PerfilPacienteProps>(function PerfilPaciente(
  { catalogo, form, alterar, erros, leituraVigente, onAnalisar },
  ref,
) {
  const { referencias } = catalogo;
  const { limites } = referencias;

  const opcoesDx = useMemo<OpcaoCombobox[]>(
    () =>
      referencias.diagnosticos.map((d) => ({
        valor: d.codigo,
        codigo: d.codigo,
        rotulo: d.descricao,
        detalhe: plural(d.n_perfis, 'perfil', 'perfis'),
        grupo: d.grupo,
      })),
    [referencias],
  );

  const opcoesComorbidade = useMemo<OpcaoCombobox[]>(
    () =>
      referencias.cid10.map((c) => ({
        valor: c.codigo,
        codigo: c.codigo,
        rotulo: c.descricao,
        grupo: c.tipo,
        desabilitada: c.codigo === form.dx,
        motivoDesabilitada: c.codigo === form.dx ? 'já é o diagnóstico principal' : undefined,
      })),
    [referencias, form.dx],
  );

  const opcoesSexo = referencias.opcoes.sexo.map((o) => ({ valor: o.codigo, rotulo: o.rotulo }));
  const opcoesFaixa = [...referencias.faixas_etarias]
    .sort((a, b) => a.ordem - b.ordem)
    .map((f) => ({
      valor: f.codigo,
      rotulo: (
        <>
          <span aria-hidden="true">{rotuloCurtoFaixa(f.rotulo)}</span>
          <span className="sr-only">{f.rotulo}</span>
        </>
      ),
    }));

  const desvio = linhasDesvio(leituraVigente);
  const semanas = form.h !== null && form.h > 0 && form.h % 7 === 0 ? form.h / 7 : null;
  const nminAlterado = form.nmin !== limites.n_minimo_padrao;

  return (
    <section ref={ref} className="compositor" aria-labelledby="compositor-titulo">
      <h2 id="compositor-titulo" className="compositor__titulo">
        Perfil do paciente
      </h2>

      <div className="compositor__grade">
        <div className="compositor__dx">
          <Field id={ID_FOCO.dx} rotulo="Diagnóstico principal" obrigatorio erro={erros.dx}>
            {(a11y) => (
              <Combobox
                {...a11y}
                opcoes={opcoesDx}
                valor={form.dx}
                onChange={(dx) => alterar({ dx })}
                rotuloGrupo={rotuloGrupoCid}
                rotuloLista="Diagnósticos CID-10"
                placeholder="Buscar por código CID-10 ou nome"
                semResultado="Nenhum código encontrado na base."
              />
            )}
          </Field>
          {desvio.dx && <LinhaDesvio>{desvio.dx}</LinhaDesvio>}
        </div>

        <div className="compositor__com">
          <Field id={ID_FOCO.com} rotulo="Comorbidades" erro={erros.com}>
            {(a11y) => (
              <MultiCombobox
                {...a11y}
                opcoes={opcoesComorbidade}
                valores={form.com}
                onChange={(com) => alterar({ com })}
                grupos={GRUPOS_COMORBIDADE}
                rotuloLista="Comorbidades CID-10"
                placeholder="Adicionar comorbidade"
                semResultado="Nenhum código encontrado na base."
              />
            )}
          </Field>
          {desvio.com && <LinhaDesvio>{desvio.com}</LinhaDesvio>}
        </div>

        <div className="compositor__sexo">
          <Field id="consulta-sexo" rotulo="Sexo" obrigatorio grupo erro={erros.sexo}>
            {(a11y) => <SegmentedControl<Sexo> {...a11y} nome="consulta-sexo" opcoes={opcoesSexo} valor={form.sexo} onChange={(sexo) => alterar({ sexo })} />}
          </Field>
          {desvio.sexo && <LinhaDesvio>{desvio.sexo}</LinhaDesvio>}
        </div>

        <div className="compositor__faixa">
          <Field id="consulta-faixa" rotulo="Faixa etária" obrigatorio grupo erro={erros.faixa}>
            {(a11y) => <SegmentedControl {...a11y} nome="consulta-faixa" opcoes={opcoesFaixa} valor={form.faixa} onChange={(faixa) => alterar({ faixa })} />}
          </Field>
          {desvio.faixa && <LinhaDesvio>{desvio.faixa}</LinhaDesvio>}
        </div>
      </div>

      <div className="compositor__rodape">
        <div className="compositor__parametros">
          <div className="compositor__horizonte">
            <Field
              id={ID_FOCO.h}
              rotulo="Horizonte"
              erro={erros.h}
              complemento={semanas !== null ? `${formatarInteiro(semanas)}${NBSP}${semanas === 1 ? 'semana' : 'semanas'}` : undefined}
            >
              {(a11y) => <NumberField {...a11y} valor={form.h} onChange={(h, valido) => alterar({ h: valido ? h : null })} unidade="dias" />}
            </Field>
            <div className="compositor__presets" role="group" aria-label="Horizontes em semanas">
              {PRESETS_SEMANAS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="compositor__preset"
                  aria-pressed={form.h === s * 7}
                  aria-label={`${s} semanas (${s * 7} dias)`}
                  onClick={() => alterar({ h: s * 7 })}
                >
                  {s}
                  {NBSP}sem
                </button>
              ))}
            </div>
          </div>

          <div className="compositor__nmin">
            <Field
              id={ID_FOCO.nmin}
              rotulo={
                <>
                  <span className="minusculo">n</span> mínimo
                </>
              }
              complemento={nminAlterado ? <span className="tag-neutra">alterado (padrão {limites.n_minimo_padrao})</span> : undefined}
            >
              {(a11y) => (
                <Stepper
                  {...a11y}
                  valor={form.nmin}
                  min={limites.n_minimo_min}
                  max={limites.n_minimo_max}
                  onChange={(nmin) => alterar({ nmin })}
                  rotuloAcessivel="n mínimo"
                />
              )}
            </Field>
            {form.nmin < limites.n_minimo_padrao && <p className="caption">Abaixo de {limites.n_minimo_padrao}, os intervalos ficam mais largos.</p>}
          </div>
        </div>

        <div className="compositor__acao">
          <Button variante="primario" atalho="Ctrl+Enter" onClick={onAnalisar} className="compositor__analisar">
            Analisar coorte
          </Button>
          <AvisoNaoPrescreve variante="curto" />
        </div>
      </div>
    </section>
  );
});
