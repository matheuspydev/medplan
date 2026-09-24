/** O que as seções do formulário recebem para exibir erro/alerta e registrar interação. */
import type { Catalogo } from '../../api/referencias';

export interface ApiCampos {
  catalogo: Catalogo;
  /** Mensagem de erro visível agora (formato após blur, obrigatório após tentar salvar, ou do servidor). */
  erro(chave: string): string | null;
  /** Nota de consistência não bloqueante (ocre). */
  alerta(chave: string): string | null;
  /** Campo recebeu interação: erros de formato passam a aparecer. */
  tocar(chave: string): void;
  /** Texto digitado que não forma valor (data incompleta, número inválido). */
  marcarEntrada(chave: string, invalida: boolean): void;
  /** Quantidade de pendências bloqueantes de um tratamento (visíveis ou não), para a linha-resumo. */
  pendenciasDoTratamento(tid: number): number;
}
