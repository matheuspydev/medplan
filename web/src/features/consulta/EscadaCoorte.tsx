/**
 * Cartão COMO A COORTE FOI MONTADA: os 6 níveis da escada como etapas lado a lado, em linguagem
 * de quem não é da área. Cada etapa: o que foi ignorado, quantos pacientes parecidos entraram,
 * quantos tratamentos tinha o medicamento com mais casos, e o que aconteceu naquela etapa
 * (poucos casos, usada no resultado, não foi necessária). Só contagens (sem IC, sem percentual).
 * A barra mostra os tratamentos do medicamento com mais casos; o traço, o mínimo exigido.
 */
import type { CSSProperties, Ref } from 'react';
import type { AnaliseResposta, DegrauEscada } from '../../api/types';
import { PainelMedicao } from '../../components/PainelMedicao';
import { formatarInteiro, plural } from '../../lib/format';

export interface EscadaCoorteProps {
  resposta: AnaliseResposta;
  refPainel?: Ref<HTMLElement>;
}

export function EscadaCoorte({ resposta, refPainel }: EscadaCoorteProps) {
  const { escada, nivel, n_minimo: nMinimo, dados_insuficientes: insuficiente } = resposta;
  const escala = Math.max(nMinimo, ...escada.map((d) => d.melhor_n_avaliavel)) * 1.15;
  const minimo = formatarInteiro(nMinimo);

  function classe(d: DegrauEscada): string {
    if (d.selecionado) return insuficiente ? 'escada__passo escada__passo--ultimo' : 'escada__passo escada__passo--parou';
    return d.ordem > nivel.ordem ? 'escada__passo escada__passo--depois' : 'escada__passo';
  }

  function situacao(d: DegrauEscada): string {
    if (d.selecionado) return insuficiente ? `Nenhum passo chegou a ${minimo}` : 'Usado no resultado';
    if (d.ordem > nivel.ordem) return 'Não foi necessário';
    return `Poucos casos: passou para o próximo`;
  }

  return (
    <PainelMedicao
      ref={refPainel}
      titulo="Como o sistema encontrou pacientes parecidos"
      subtitulo={`Quase ninguém na base tem exatamente o mesmo perfil. Por isso o sistema começa pelo perfil completo e, quando faltam casos, deixa de exigir um critério por vez, da esquerda para a direita. Ele para no primeiro passo em que algum medicamento tem pelo menos ${minimo} tratamentos para avaliar.`}
      className="painel-escada"
    >
      <ol className="escada">
        {escada.map((d) => (
          <li key={d.ordem} className={classe(d)} aria-current={d.selecionado ? 'step' : undefined}>
            <span className="escada__topo">
              <span className="escada__nivel">{d.ordem}</span>
              {d.selecionado && !insuficiente && <span className="escada__tag">Parou aqui</span>}
              {d.selecionado && insuficiente && <span className="escada__tag escada__tag--ultimo">Último nível tentado</span>}
            </span>
            <span className="escada__rotulo">{d.rotulo}</span>
            <span className="escada__perfis">
              <strong>{formatarInteiro(d.n_perfis)}</strong> {d.n_perfis === 1 ? 'paciente parecido' : 'pacientes parecidos'}
            </span>
            <span className="escada__sub">
              Medicamento com mais casos: {plural(d.melhor_n_avaliavel, 'tratamento', 'tratamentos')}
              {!d.atingiu_n_minimo && ` (precisa de ${minimo})`}
            </span>
            <span className="escada__trilho" style={{ '--fracao': d.melhor_n_avaliavel / escala, '--limiar': nMinimo / escala } as CSSProperties} aria-hidden="true">
              <span className={d.atingiu_n_minimo ? 'escada__barra escada__barra--ok' : 'escada__barra'} />
              <span className="escada__limiar" />
            </span>
            <span className="escada__situacao">{situacao(d)}</span>
          </li>
        ))}
      </ol>
      <p className="escada__legenda">
        Barra: tratamentos do medicamento com mais casos naquele passo. Traço: o mínimo de {minimo}. Quanto mais à direita o passo usado, menos
        os pacientes da comparação se parecem com o perfil informado; o que foi deixado de lado aparece no aviso âmbar acima.
      </p>
    </PainelMedicao>
  );
}
