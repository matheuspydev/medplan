/**
 * Cartão COMO A COORTE FOI MONTADA: os 6 níveis da escada como etapas lado a lado.
 * Cada etapa: número, rótulo do motor, perfis, maior n avaliável, medicamentos e uma barra de n com a
 * marca do n mínimo. Só contagens (sem IC, sem percentual).
 * Etapa onde o motor parou: destaque + "Parou aqui". Sem nível suficiente: "Último nível tentado".
 * Etapas depois da parada ficam esmaecidas ("não necessário" para leitores de tela).
 */
import type { CSSProperties, Ref } from 'react';
import type { AnaliseResposta } from '../../api/types';
import { PainelMedicao } from '../../components/PainelMedicao';
import { formatarInteiro, plural } from '../../lib/format';

export interface EscadaCoorteProps {
  resposta: AnaliseResposta;
  refPainel?: Ref<HTMLElement>;
}

export function EscadaCoorte({ resposta, refPainel }: EscadaCoorteProps) {
  const { escada, nivel, n_minimo: nMinimo, dados_insuficientes: insuficiente } = resposta;
  const escala = Math.max(nMinimo, ...escada.map((d) => d.melhor_n_avaliavel)) * 1.15;

  function classe(ordem: number, selecionado: boolean): string {
    if (selecionado) return insuficiente ? 'escada__passo escada__passo--ultimo' : 'escada__passo escada__passo--parou';
    return ordem > nivel.ordem ? 'escada__passo escada__passo--depois' : 'escada__passo';
  }

  return (
    <PainelMedicao
      ref={refPainel}
      titulo="Como a coorte foi montada"
      subtitulo={`O sistema afrouxa um critério por vez até algum medicamento atingir n mínimo ${formatarInteiro(nMinimo)}.`}
      className="painel-escada"
    >
      <ol className="escada">
        {escada.map((d) => (
          <li key={d.ordem} className={classe(d.ordem, d.selecionado)} aria-current={d.selecionado ? 'step' : undefined}>
            <span className="escada__topo">
              <span className="escada__nivel">{d.ordem}</span>
              {d.selecionado && !insuficiente && <span className="escada__tag">Parou aqui</span>}
              {d.selecionado && insuficiente && <span className="escada__tag escada__tag--ultimo">Último nível tentado</span>}
              {!d.selecionado && d.ordem > nivel.ordem && <span className="sr-only">não necessário</span>}
            </span>
            <span className="escada__rotulo">{d.rotulo}</span>
            <span className="escada__perfis">
              <strong>{formatarInteiro(d.n_perfis)}</strong> {d.n_perfis === 1 ? 'perfil' : 'perfis'}
            </span>
            <span className="escada__sub">
              maior n {formatarInteiro(d.melhor_n_avaliavel)} · {plural(d.n_medicamentos, 'medicamento', 'medicamentos')}
            </span>
            <span className="escada__trilho" style={{ '--fracao': d.melhor_n_avaliavel / escala, '--limiar': nMinimo / escala } as CSSProperties} aria-hidden="true">
              <span className={d.atingiu_n_minimo ? 'escada__barra escada__barra--ok' : 'escada__barra'} />
              <span className="escada__limiar" />
            </span>
          </li>
        ))}
      </ol>
    </PainelMedicao>
  );
}
