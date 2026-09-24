/**
 * Conteúdo da Metodologia, usado no drawer (Alt+M, links "›") e na página /metodologia.
 *
 * FONTE DE CADA AFIRMAÇÃO (conferir ao mudar o motor):
 * - escada, rótulos dos níveis e conjunto exato de comorbidades: medplan/matching.py (NIVEIS, construir_consulta)
 * - regra de parada e ordem: medplan/engine.py (recomendar)
 * - censura por episódio e intervalo de Wilson: medplan/stats.py (avaliar_horizonte, ic_wilson)
 * - exemplo de ordem: docstring de medplan/engine.py; números calculados com stats.ic_wilson
 *   e arredondados como o backend (int(format(x, ".0%")[:-1])):
 *     21/21   -> 100 (IC 85–100), limites crus 0.845356 – 1.0
 *     264/300 -> 88  (IC 84–91),  limites crus 0.838341 – 0.912050
 * - aviso de viés: cópia literal de engine.AVISO_VIES_INDICACAO (teste compara com o arquivo)
 * - viés plantado no gerador: docstring de medplan/synth.py
 * Nenhum fato clínico aqui: só o método estatístico e os limites do protótipo.
 */
import { useEffect, type ReactNode } from 'react';
import creditos from '../../assets/creditos.json';
import corredorClaro from '../../assets/imagens/metodologia-corredor-claro.webp';
import corredorEscuro from '../../assets/imagens/metodologia-corredor-escuro.webp';
import paquimetroClaro from '../../assets/imagens/metodologia-paquimetro-claro.webp';
import paquimetroEscuro from '../../assets/imagens/metodologia-paquimetro-escuro.webp';
import { useTema } from '../../app/tema';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { AvisoViesIndicacao } from '../../components/AvisoViesIndicacao';
import { FaixaIC } from '../../components/FaixaIC';
import { GlifoCriterio } from '../../components/GlifoCriterio';
import { Proporcao } from '../../components/Proporcao';
import { formatarHorizonte } from '../../lib/format';
import { ANCORAS_METODOLOGIA, irParaAncora, type AncoraMetodologia } from './contexto';
import './metodologia.css';

/** Cópia literal de medplan/engine.py AVISO_VIES_INDICACAO. */
export const AVISO_VIES_INDICACAO =
  'Estes dados são observacionais, não de ensaio clínico. Se um medicamento é ' +
  'prescrito preferencialmente para casos mais graves ou refratários, ele vai ' +
  'aparecer como pior tolerado — isso reflete o padrão de prescrição desta base, ' +
  'não uma propriedade do fármaco.';

/** Valores padrão do motor: stats.HORIZONTE_PADRAO_DIAS e engine.N_MINIMO_PADRAO. */
const HORIZONTE_PADRAO = 84;
const N_MINIMO_PADRAO = 20;

const NOMES_SECAO: Record<AncoraMetodologia, string> = {
  coorte: 'Coorte',
  censura: 'Censura',
  wilson: 'Wilson',
  ordem: 'Ordem',
  vies: 'Viés',
  sintetico: 'Protótipo sintético',
  creditos: 'Créditos',
};

const CRITERIOS = ['comorbidades clínicas', 'comorbidades psiquiátricas', 'faixa etária', 'sexo', 'código CID-10'];

const NIVEIS: { rotulo: string; efeito: string }[] = [
  { rotulo: 'Perfil completo', efeito: 'Mesmo código CID-10, mesma faixa etária, mesmo sexo e exatamente o mesmo conjunto de comorbidades.' },
  {
    rotulo: 'Comorbidades clínicas ignoradas',
    efeito: 'As comorbidades clínicas deixam de ser comparadas; as psiquiátricas (capítulo F) continuam exigindo o mesmo conjunto.',
  },
  { rotulo: 'Comorbidades ignoradas', efeito: 'Nenhuma comorbidade é comparada.' },
  {
    rotulo: 'Faixa etária ampliada para as adjacentes',
    efeito: 'Entram também a faixa etária imediatamente anterior e a imediatamente seguinte, pela ordem do catálogo.',
  },
  { rotulo: 'Sexo ignorado', efeito: 'Perfis de qualquer sexo.' },
  {
    rotulo: 'Grupo diagnóstico em vez do código exato',
    efeito: 'Qualquer código do mesmo grupo CID-10 do catálogo. Quando o grupo tem um único código, o diagnóstico não se amplia.',
  },
];

type Credito = (typeof creditos)[number];

function creditoDe(arquivo: string): Credito | undefined {
  return creditos.find((c) => c.arquivos.includes(arquivo));
}

function FotoMetodologia({ claro, escuro, arquivo }: { claro: string; escuro: string; arquivo: string }) {
  const { tema, efetivo } = useTema();
  const credito = creditoDe(arquivo);
  return (
    <figure className="foto-metodologia">
      <div className="foto-metodologia__moldura">
        <picture>
          {tema === 'sistema' && <source srcSet={escuro} media="(prefers-color-scheme: dark)" />}
          <img src={tema === 'sistema' || efetivo === 'claro' ? claro : escuro} alt="" decoding="async" />
        </picture>
      </div>
      {credito && (
        <figcaption className="foto-metodologia__credito">
          Foto: {credito.autor} · {credito.servico} · {credito.licenca}
        </figcaption>
      )}
    </figure>
  );
}

function Secao({
  ancora,
  numero,
  titulo,
  nivelTitulo,
  children,
}: {
  ancora: AncoraMetodologia;
  numero: number;
  titulo: string;
  nivelTitulo: 2 | 3;
  children: ReactNode;
}) {
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h3';
  return (
    <section id={ancora} className="metodologia__secao" aria-labelledby={`${ancora}-titulo`}>
      <Titulo id={`${ancora}-titulo`} className="metodologia__titulo" tabIndex={-1} data-titulo-secao>
        <span className="num">{numero}</span>
        <span>{titulo}</span>
      </Titulo>
      {children}
    </section>
  );
}

function DiagramaCensura() {
  // Esquema (não dados): eixo de 0 a 300 unidades, horizonte em 240.
  const H = 240;
  const linhas: { desenho: ReactNode; texto: ReactNode }[] = [
    {
      desenho: <line x1={0} x2={296} y1={10} y2={10} strokeWidth={2} stroke="currentColor" />,
      texto: (
        <>
          <strong>Retido.</strong> Os dias observados chegaram ao horizonte, qualquer que seja o status final. Chegar ao horizonte é o que se mede.
        </>
      ),
    },
    {
      desenho: (
        <>
          <line x1={0} x2={150} y1={10} y2={10} strokeWidth={2} stroke="currentColor" />
          <rect x={146} y={6} width={8} height={8} fill="currentColor" />
        </>
      ),
      texto: (
        <>
          <strong>Retido.</strong> Concluído com resposta adequada antes do horizonte: foi decisão clínica, não falha do medicamento.
        </>
      ),
    },
    {
      desenho: (
        <>
          <line x1={0} x2={100} y1={10} y2={10} strokeWidth={2} stroke="currentColor" />
          <path d="M96 6 104 14M104 6 96 14" strokeWidth={2} stroke="currentColor" />
        </>
      ),
      texto: (
        <>
          <strong>Evento.</strong> Descontinuado antes do horizonte (reação adversa, ineficácia, não adesão ou outro motivo), contado pelo motivo.
        </>
      ),
    },
    {
      desenho: (
        <>
          <line x1={0} x2={66} y1={10} y2={10} strokeWidth={2} stroke="currentColor" />
          <circle cx={70} cy={10} r={4} fill="none" strokeWidth={1.5} stroke="currentColor" />
          <line x1={75} x2={H} y1={10} y2={10} strokeWidth={1} stroke="currentColor" strokeDasharray="3 2" />
        </>
      ),
      texto: (
        <>
          <strong>Censurado.</strong> Ainda em uso ou perdido de seguimento antes do horizonte: fica fora do denominador, porque não se sabe o que
          teria acontecido.
        </>
      ),
    },
  ];

  return (
    <ul className="metodologia__censura" aria-label="Esquema da regra de censura, não dados">
      <li aria-hidden="true">
        <span className="metodologia__eixo-censura">
          <span>dia 0</span>
          <span>horizonte</span>
        </span>
        <span />
      </li>
      {linhas.map((l, i) => (
        <li key={i}>
          <svg viewBox="0 0 300 20" aria-hidden="true" focusable="false">
            <line x1={0} x2={0} y1={2} y2={18} stroke="currentColor" strokeWidth={1} />
            <line x1={H} x2={H} y1={0} y2={20} stroke="var(--color-data-threshold)" strokeWidth={1} strokeDasharray="3 2" />
            {l.desenho}
          </svg>
          <span>{l.texto}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ConteudoMetodologiaProps {
  contexto: 'drawer' | 'pagina';
}

export function ConteudoMetodologia({ contexto }: ConteudoMetodologiaProps) {
  const nivelTitulo = contexto === 'pagina' ? 2 : 3;

  // Página aberta com /metodologia#wilson: rola até a seção uma vez.
  useEffect(() => {
    if (contexto !== 'pagina') return;
    const ancora = window.location.hash.slice(1) as AncoraMetodologia;
    if (ANCORAS_METODOLOGIA.includes(ancora)) irParaAncora(ancora);
  }, [contexto]);

  return (
    <div className={`metodologia metodologia--${contexto}`}>
      <div className="metodologia__topo">
        <FotoMetodologia claro={paquimetroClaro} escuro={paquimetroEscuro} arquivo="imagens/metodologia-paquimetro-claro.webp" />
        <nav aria-label="Seções da metodologia">
          <ol className="metodologia__indice">
            {ANCORAS_METODOLOGIA.map((a, i) => (
              <li key={a}>
                <button type="button" onClick={() => irParaAncora(a)}>
                  <span className="num">{i + 1}</span>
                  {NOMES_SECAO[a]}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <Secao ancora="coorte" numero={1} titulo="Como a coorte é montada" nivelTitulo={nivelTitulo}>
        <p>
          O motor procura, na base deste hospital, perfis com o mesmo diagnóstico principal, faixa etária, sexo e comorbidades do perfil
          informado. Começa pelo critério mais estrito e afrouxa um degrau por vez; cada nível mantém os afrouxamentos do anterior.
        </p>
        <p>
          Ele para no primeiro nível em que pelo menos um medicamento atinge o n mínimo (n avaliável igual ou maior que o limiar; padrão{' '}
          {N_MINIMO_PADRAO}). Toda a leitura usa só a coorte desse nível. Se nenhum nível chega lá, o resultado é dados insuficientes no
          nível 5: nenhum percentual é exibido, e os medicamentos encontrados aparecem à parte, só com contagens.
        </p>
        <p className="caption">Esquema, não dados. Rótulos dos níveis como o motor os nomeia.</p>
        <div className="metodologia__rolagem">
          <table className="metodologia__tabela">
            <caption className="sr-only">Escada de relaxamento: critérios mantidos e ignorados por nível</caption>
            <thead>
              <tr>
                <th scope="col" className="micro">
                  Nível
                </th>
                <th scope="col" className="micro">
                  Critérios
                </th>
                <th scope="col" className="micro">
                  O que muda
                </th>
              </tr>
            </thead>
            <tbody>
              {NIVEIS.map((n, ordem) => (
                <tr key={ordem}>
                  <th scope="row">
                    <span className="num code">{ordem}</span> {n.rotulo}
                  </th>
                  <td>
                    <span className="metodologia__glifos">
                      {CRITERIOS.map((c, i) => (
                        <GlifoCriterio key={c} criterio={c} estado={i < ordem ? 'ignorado' : 'mantido'} />
                      ))}
                    </span>
                  </td>
                  <td>{n.efeito}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caption">Ordem em que os critérios caem: comorbidades clínicas, comorbidades psiquiátricas, faixa etária, sexo, código CID-10.</p>
        <p>
          <strong>Conjunto exato, não &ldquo;contém&rdquo;.</strong> No nível 0, um perfil só entra se tiver exatamente as comorbidades
          informadas, nem uma a mais, nem uma a menos. Um paciente sem comorbidade casa só com perfis também sem comorbidade; do contrário o
          nível 0 não restringiria nada. No nível 1, a mesma regra vale só para as comorbidades psiquiátricas.
        </p>
        <p>
          Todas as comparações ficam dentro do mesmo hospital. A escada mostrada na Consulta traz, para cada nível, quantos perfis entram,
          quantos medicamentos aparecem e o maior n avaliável: é o custo de cada afrouxamento. Os critérios ignorados aparecem sempre na
          leitura, com o valor informado e o valor usado.
        </p>
      </Secao>

      <Secao ancora="censura" numero={2} titulo="Censura no horizonte" nivelTitulo={nivelTitulo}>
        <p>
          A medida é a permanência em tratamento até o horizonte escolhido (padrão {formatarHorizonte(HORIZONTE_PADRAO)}). Para cada
          tratamento, dias observados = data de fim (ou, sem ela, data da última observação) menos data de início. Cada tratamento cai em
          uma de quatro situações:
        </p>
        <DiagramaCensura />
        <p>
          n avaliável = retidos + eventos. Permanência = retidos / n avaliável. Os censurados são publicados à parte, para mostrar quanto do
          dado ficou de fora: contar como sucesso quem começou há pouco e segue em uso inflaria a taxa.
        </p>
        <p>
          Cada motivo de descontinuação usa o mesmo n avaliável como denominador, com seu próprio IC95%. Nas reações adversas, o
          denominador é o total de tratamentos com desfecho registrado na coorte, inclusive os censurados, porque qualquer um deles poderia
          ter registrado uma reação; a leitura lista até 6 reações, das mais frequentes.
        </p>
      </Secao>

      <Secao ancora="wilson" numero={3} titulo="Intervalo de Wilson" nivelTitulo={nivelTitulo}>
        <p>
          Toda proporção vem com o intervalo de confiança de Wilson (IC95%). Com n pequeno, que aqui é a regra, a aproximação normal produz
          intervalos que escapam da faixa de 0 a 1 e têm cobertura errada; Wilson se comporta bem a partir de n baixo.
        </p>
        <pre className="metodologia__formula" aria-label="Fórmula do intervalo de Wilson">
          {'p = sucessos / n        z = 1,96\n' +
            'centro = (p + z²/(2n)) / (1 + z²/n)\n' +
            'margem = z · raiz( p(1 - p)/n + z²/(4n²) ) / (1 + z²/n)\n' +
            'IC = [máx(0, centro - margem), mín(1, centro + margem)]'}
        </pre>
        <p>
          Os percentuais inteiros exibidos são arredondados no servidor, com a mesma regra do motor em Python; a tela nunca arredonda. Abaixo
          do n mínimo, a tela escreve dados insuficientes e não mostra percentual.
        </p>
      </Secao>

      <Secao ancora="ordem" numero={4} titulo="Por que ordenar pelo limite inferior" nivelTitulo={nivelTitulo}>
        <p>
          Os medicamentos que atingem o n mínimo são ordenados pelo limite inferior do IC95%, do maior para o menor, e não pela taxa
          pontual. Os que não atingem ficam à parte, sem percentual, do maior para o menor n avaliável.
        </p>
        <p className="caption">Exemplo estatístico do comentário do motor (engine.py), sem significado clínico:</p>
        <div className="metodologia__exemplo">
          <div className="metodologia__exemplo-linha">
            <span className="metodologia__exemplo-nome">Hipotético A</span>
            <Proporcao pct={100} n={21} icInfPct={85} icSupPct={100} nMinimo={N_MINIMO_PADRAO} tamanho="linha" />
            <FaixaIC taxa={1} icInferior={0.845356} icSuperior={1} n={21} nMaxTabela={300} />
          </div>
          <div className="metodologia__exemplo-linha">
            <span className="metodologia__exemplo-nome">Hipotético B</span>
            <Proporcao pct={88} n={300} icInfPct={84} icSupPct={91} nMinimo={N_MINIMO_PADRAO} tamanho="linha" />
            <FaixaIC taxa={0.88} icInferior={0.838341} icSuperior={0.91205} n={300} nMaxTabela={300} />
          </div>
        </div>
        <p>
          Pela taxa pontual, A ficaria bem à frente. Pelo limite inferior, os dois ficam praticamente empatados: a diferença é menor que um
          ponto percentual (A ainda fica acima por uma fração). O intervalo de A é largo porque 21 casos dizem pouco; o de B, com 300 casos,
          é estreito, e B é a estimativa mais estável. Ordenar pela taxa pontual transformaria ruído amostral em ordem de lista.
        </p>
        <p>
          Quando os limites inferiores empatam depois do arredondamento, a ordem segue o valor não arredondado. A ordem descreve o padrão
          desta base; não é recomendação de tratamento.
        </p>
      </Secao>

      <Secao ancora="vies" numero={5} titulo="Viés de indicação" nivelTitulo={nivelTitulo}>
        <AvisoViesIndicacao texto={AVISO_VIES_INDICACAO} comLink={false} />
        <p>
          No protótipo, esse viés foi plantado de propósito: o gerador sintético dá a cada perfil uma gravidade latente, que não é gravada no
          banco, e ela influencia tanto qual medicamento é prescrito quanto a chance de descontinuar. Medicamentos preferidos em casos graves
          parecem pior tolerados, e o motor não tem como ajustar por algo que não foi registrado.
        </p>
        <p>Por isso a leitura reflete o padrão de prescrição da base, não eficácia causal, e a lista mostra uma ordem, não um ranking de melhores.</p>
      </Secao>

      <Secao ancora="sintetico" numero={6} titulo="O que este protótipo é e não é" nivelTitulo={nivelTitulo}>
        <FotoMetodologia claro={corredorClaro} escuro={corredorEscuro} arquivo="imagens/metodologia-corredor-claro.webp" />
        <p>
          <strong>É</strong> um protótipo da fase 0, para a médica responsável conferir a lógica de coorte, censura, intervalo e ordem, e se a
          tela deixa claros os limites da ferramenta.
        </p>
        <ul>
          <li>
            Todos os números vêm de um gerador aleatório (a mesma semente gera a mesma base) com probabilidades arbitrárias, escolhidas para
            exercitar o fluxo.
          </li>
          <li>Casos incluídos em Registro de caso entram nesta mesma base de demonstração e passam a contar nas consultas.</li>
        </ul>
        <p>
          <strong>Não é:</strong>
        </p>
        <ul>
          <li>não descreve pacientes reais nem a tolerabilidade real de nenhum medicamento;</li>
          <li>não mede a frequência real de reações adversas; termos e SOC são rótulos de trabalho (código MedDRA pendente);</li>
          <li>não mostra eficácia causal: os dados são observacionais;</li>
          <li>não prescreve e não substitui a decisão do médico responsável;</li>
          <li>
            não pode receber dado real de paciente: o protótipo não tem autenticação nem as proteções da versão canônica (isolamento por
            hospital no banco e registro de auditoria sem edição).
          </li>
        </ul>
      </Secao>

      <Secao ancora="creditos" numero={7} titulo="Créditos" nivelTitulo={nivelTitulo}>
        <ul className="creditos">
          {creditos.map((c) => (
            <li key={c.pagina_origem}>
              {c.descricao} ({c.uso}). Foto de {c.autor}, <a href={c.pagina_origem} target="_blank" rel="noopener noreferrer">{c.servico}</a>,{' '}
              <a href={c.url_licenca} target="_blank" rel="noopener noreferrer">
                {c.licenca}
              </a>
              . Modificação: {c.modificacao}.
            </li>
          ))}
          <li>Inter, de Rasmus Andersson (The Inter Project Authors), SIL Open Font License 1.1, via Fontsource.</li>
          <li>Ícones Lucide, licença ISC.</li>
        </ul>
      </Secao>

      <AvisoNaoPrescreve />
    </div>
  );
}
