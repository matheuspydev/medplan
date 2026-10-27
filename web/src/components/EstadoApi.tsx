/**
 * <EstadoApi> — estados de uma tela que carrega da API: linha fina enquanto carrega, falha
 * que REMOVE o resultado e explica (com "Tentar novamente"), e o conteúdo quando há dados.
 *
 *   <EstadoApi estado={estado} rotulo="Carregando a visão geral…">{(dados) => ...}</EstadoApi>
 */
import type { ReactNode } from 'react';
import type { EstadoApi as Estado } from '../lib/useApi';
import { Button } from './Button';
import { LoadingLine } from './LoadingLine';
import { PainelFalha } from './PainelFalha';

export function EstadoApi<T>({ estado, rotulo, children }: { estado: Estado<T>; rotulo: string; children: (dados: T) => ReactNode }) {
  return (
    <>
      <LoadingLine ativo={estado.carregando} rotulo={rotulo} />
      {estado.erro ? (
        <PainelFalha
          titulo="Não foi possível carregar. Nenhum número foi exibido."
          acao={
            <Button variante="secundario" onClick={estado.recarregar}>
              Tentar novamente
            </Button>
          }
        >
          {estado.erro.erros.map((e, i) => (
            <p key={i}>{e.mensagem}</p>
          ))}
        </PainelFalha>
      ) : (
        estado.dados !== null && children(estado.dados)
      )}
    </>
  );
}
