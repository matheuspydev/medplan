/**
 * Cabeçalho de leitura fixo (vidro fosco): CID e tamanho da coorte, nível, horizonte, n mínimo e hora,
 * com a ficha "N critérios ignorados" (leva à caixa) e a nota de não-prescrição. Quando a nota de viés
 * sai da tela, entra o eco "Observacional". Com o perfil alterado depois da leitura, a faixa
 * "Leitura desatualizada" fica aqui, sempre visível durante a rolagem.
 */
import { FunnelX, RefreshCw, SquarePen } from 'lucide-react';
import type { Ref } from 'react';
import type { AnaliseResposta } from '../../api/types';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { Button } from '../../components/Button';
import { formatarHora, formatarInteiro, plural } from '../../lib/format';
import { LinkMetodologia } from '../metodologia/contexto';

export interface CabecalhoLeituraProps {
  resposta: AnaliseResposta;
  nMinimoPadrao: number;
  desatualizada: boolean;
  /** A nota de viés já saiu da tela por rolagem. */
  eco: boolean;
  onRecalcular: () => void;
  onEditarPerfil: () => void;
  onIrCriterios: () => void;
  refCabecalho: Ref<HTMLElement>;
  refTitulo: Ref<HTMLHeadingElement>;
}

export function CabecalhoLeitura({ resposta, nMinimoPadrao, desatualizada, eco, onRecalcular, onEditarPerfil, onIrCriterios, refCabecalho, refTitulo }: CabecalhoLeituraProps) {
  const hora = formatarHora(resposta.proveniencia.calculado_em);
  const ignorados = resposta.nivel.criterios_relaxados.length;
  const totalNiveis = resposta.escada.length - 1;

  return (
    <header ref={refCabecalho} className="cabecalho-leitura">
      <div className="cabecalho-leitura__linha">
        <div className="cabecalho-leitura__textos">
          <h2 ref={refTitulo} tabIndex={-1} className="cabecalho-leitura__titulo">
            <span className="code">{resposta.perfil.cid10_principal}</span> · {plural(resposta.n_perfis, 'perfil semelhante', 'perfis semelhantes')}
          </h2>
          <p className="cabecalho-leitura__meta">
            Nível {resposta.nivel.ordem} de {totalNiveis} · {resposta.horizonte_dias} dias · n mínimo {formatarInteiro(resposta.n_minimo)}
            {resposta.n_minimo !== nMinimoPadrao && <span className="tag-neutra">alterado (padrão {nMinimoPadrao})</span>} · {hora}
          </p>
        </div>
        <div className="cabecalho-leitura__acoes">
          {ignorados > 0 ? (
            <button type="button" className="badge-desvio" onClick={onIrCriterios}>
              <FunnelX size={14} aria-hidden="true" />
              {plural(ignorados, 'critério ignorado', 'critérios ignorados')}
            </button>
          ) : (
            <span className="badge-completo">Perfil completo</span>
          )}
          <Button variante="secundario" icone={<SquarePen size={14} />} onClick={onEditarPerfil}>
            Editar perfil
          </Button>
        </div>
      </div>
      <div className="cabecalho-leitura__rodape">
        <AvisoNaoPrescreve variante="compacto" />
        {eco && (
          <p className="cabecalho-leitura__eco">
            Observacional: reflete o padrão de prescrição desta base. <LinkMetodologia ancora="vies">Viés de indicação</LinkMetodologia>
          </p>
        )}
      </div>
      {desatualizada && (
        <div className="caixa-desatualizada" role="status">
          <RefreshCw size={14} aria-hidden="true" className="caixa-desatualizada__icone" />
          <p className="caixa-desatualizada__corpo">
            <strong className="caixa-desatualizada__rotulo">Leitura desatualizada</strong> · o perfil mudou depois das {hora}
          </p>
          <Button variante="primario" onClick={onRecalcular} className="caixa-desatualizada__botao">
            Recalcular
          </Button>
        </div>
      )}
    </header>
  );
}
