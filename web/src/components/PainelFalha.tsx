/**
 * <PainelFalha> — falha de API: borda 2px error + error-tint + CircleAlert + texto.
 * Nunca ecoa valores do perfil na mensagem. Na Consulta, o resultado anterior é REMOVIDO
 * (não esmaecido) quando este painel aparece.
 *
 *   <PainelFalha titulo="Não foi possível calcular a coorte. Nenhum resultado foi exibido."
 *                acao={<Button variante="secundario" onClick={tentar}>Tentar novamente</Button>} />
 */
import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import './PainelFalha.css';

export interface PainelFalhaProps {
  titulo: ReactNode;
  /** Mensagens adicionais (ex.: ErroApi.erros[].mensagem). */
  children?: ReactNode;
  acao?: ReactNode;
  className?: string;
}

export function PainelFalha({ titulo, children, acao, className }: PainelFalhaProps) {
  return (
    <div className={['painel-falha', className].filter(Boolean).join(' ')} role="alert">
      <CircleAlert size={16} aria-hidden="true" className="painel-falha__icone" />
      <div className="painel-falha__corpo">
        <p className="painel-falha__titulo">{titulo}</p>
        {children && <div className="painel-falha__texto">{children}</div>}
        {acao && <div className="painel-falha__acao">{acao}</div>}
      </div>
    </div>
  );
}
