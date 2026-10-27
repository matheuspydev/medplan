/**
 * Cartão SEM DADOS SUFICIENTES (por medicamento) e estado global DADOS INSUFICIENTES (substitui a tabela).
 * Sem percentual: "dados insuficientes (n=12)". O global nunca sugere baixar o n mínimo.
 */
import { CircleDashed } from 'lucide-react';
import type { Ref } from 'react';
import type { AnaliseResposta } from '../../api/types';
import { Button } from '../../components/Button';
import { Hachura } from '../../components/Hachura';
import { PainelMedicao } from '../../components/PainelMedicao';
import { Proporcao } from '../../components/Proporcao';
import { formatarInteiro, inicialMaiuscula, plural } from '../../lib/format';
import { grupoDaSubstituicao } from './ValorSubstituido';

export function SemDadosSuficientes({ resposta }: { resposta: AnaliseResposta }) {
  const { sem_dados_suficientes: linhas, n_minimo: nMinimo } = resposta;
  return (
    <PainelMedicao
      titulo="Sem dados suficientes"
      subtitulo={`Abaixo de n=${formatarInteiro(nMinimo)}. Ausência de dado não é evidência de que sejam piores.`}
      className="painel-sem-dados"
    >
      <ul className="sem-dados">
        {linhas.map((l) => (
          <li key={l.medicamento_id} className="sem-dados__linha">
            <span className="sem-dados__textos">
              <span className="sem-dados__nome">{inicialMaiuscula(l.principio_ativo)}</span>
              <span className="permanencia__classe">{l.classe_terapeutica}</span>
            </span>
            <Hachura>
              <Proporcao pct={null} n={l.n_avaliavel} icInfPct={null} icSupPct={null} nMinimo={nMinimo} tamanho="linha" />
            </Hachura>
          </li>
        ))}
      </ul>
    </PainelMedicao>
  );
}

export interface DadosInsuficientesProps {
  resposta: AnaliseResposta;
  refTitulo?: Ref<HTMLHeadingElement>;
  onVerEscada: () => void;
  onRevisar: () => void;
}

export function DadosInsuficientes({ resposta, refTitulo, onVerEscada, onRevisar }: DadosInsuficientesProps) {
  const { nivel, n_minimo: nMinimo, n_perfis: nPerfis, escada } = resposta;
  const degrau = escada.find((d) => d.selecionado);
  const cid = nivel.substituicoes.find((s) => s.criterio === 'código CID-10');
  const todosIgnorados = nivel.ordem === escada.length - 1;

  return (
    <section className="dados-insuficientes" aria-labelledby="dados-insuficientes-titulo">
      <Hachura tamanho="painel">
        <span className="dados-insuficientes__icone" aria-hidden="true">
          <CircleDashed size={28} />
        </span>
        <h2 ref={refTitulo} id="dados-insuficientes-titulo" tabIndex={-1} className="dados-insuficientes__titulo">
          Dados insuficientes
        </h2>
        <p className="dados-insuficientes__texto">
          Nenhum medicamento tem casos suficientes para este perfil: o mínimo é {plural(nMinimo, 'tratamento', 'tratamentos')}
          {todosIgnorados ? ', e não chegou lá nem deixando de exigir todos os critérios possíveis' : ''}. Ausência de dado não é evidência
          de que algum medicamento seja pior.
        </p>
        <p className="dados-insuficientes__detalhe">
          {plural(nPerfis, 'paciente parecido', 'pacientes parecidos')} · o medicamento com mais casos teve{' '}
          {plural(degrau?.melhor_n_avaliavel ?? 0, 'tratamento', 'tratamentos')}
          {cid && cid.grupo_amplia === false && (
            <>
              {' '}
              · o grupo {grupoDaSubstituicao(cid.valor_usado)} contém só {(cid.codigos_grupo ?? []).join(', ')}
            </>
          )}
        </p>
        <div className="dados-insuficientes__acoes">
          <Button variante="secundario" onClick={onVerEscada}>
            Ver como foi a busca
          </Button>
          <Button variante="secundario" onClick={onRevisar}>
            Revisar perfil
          </Button>
        </div>
      </Hachura>
    </section>
  );
}
