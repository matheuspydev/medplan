/**
 * Caixa CRITÉRIOS IGNORADOS: uma linha por critério, valor informado riscado -> valor usado;
 * no CID, a lista de códigos do grupo, ou o aviso de que o grupo tem um só código. Nunca dispensável.
 * No nível 0 não aparece (o cabeçalho mostra "Perfil completo").
 */
import { FunnelX } from 'lucide-react';
import type { Ref } from 'react';
import type { AnaliseResposta } from '../../api/types';
import { formatarInteiro } from '../../lib/format';
import { grupoDaSubstituicao, ValorSubstituido } from './ValorSubstituido';

/** Frase final do motor (engine.recomendar, aviso de relaxamento). Conferida por teste contra engine.py. */
export const FRASE_COORTE_DIFERENTE = 'A coorte abaixo não corresponde exatamente ao perfil informado.';

export interface CriteriosIgnoradosProps {
  resposta: AnaliseResposta;
  refTitulo?: Ref<HTMLHeadingElement>;
}

export function CriteriosIgnorados({ resposta, refTitulo }: CriteriosIgnoradosProps) {
  const { nivel, n_minimo: nMinimo, dados_insuficientes: insuficiente } = resposta;

  if (nivel.substituicoes.length === 0) return null;

  const cid = nivel.substituicoes.find((s) => s.criterio === 'código CID-10');

  return (
    <section className="criterios-ignorados" id="criterios-ignorados" aria-labelledby="criterios-ignorados-titulo">
      <span className="criterios-ignorados__icone" aria-hidden="true">
        <FunnelX size={16} />
      </span>
      <div className="criterios-ignorados__corpo">
        <h3 ref={refTitulo} id="criterios-ignorados-titulo" tabIndex={-1} className="criterios-ignorados__titulo">
          Critérios ignorados {insuficiente ? 'na tentativa de atingir' : 'para atingir'} <span className="minusculo">n</span> mínimo{' '}
          {formatarInteiro(nMinimo)}
        </h3>
        <p className="criterios-ignorados__fecho">{FRASE_COORTE_DIFERENTE}</p>
        <ul className="criterios-ignorados__lista">
          {nivel.substituicoes.map((s) => (
            <li key={s.criterio} className="criterios-ignorados__item">
              <span className="criterios-ignorados__criterio">{s.criterio}</span>
              <span className="criterios-ignorados__valor">
                <ValorSubstituido criterio={s.criterio} informado={s.valor_informado} usado={s.valor_usado} riscado />
                {s.codigos_grupo && s.grupo_amplia && <span className="criterios-ignorados__codigos">{s.codigos_grupo.join(', ')}</span>}
              </span>
            </li>
          ))}
        </ul>
        {cid && cid.grupo_amplia === false && (
          <p className="criterios-ignorados__nota">
            O grupo {grupoDaSubstituicao(cid.valor_usado)} contém só {(cid.codigos_grupo ?? []).join(', ')} neste catálogo: o nível {nivel.ordem} não ampliou o
            diagnóstico.
          </p>
        )}
      </div>
    </section>
  );
}
