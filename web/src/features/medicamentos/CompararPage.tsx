/**
 * Comparar medicamentos: 2 ou 3 lado a lado, com as mesmas métricas alinhadas, no mesmo recorte de
 * filtros e no mesmo horizonte. Cada medicamento é um seletor com menu; "Adicionar" sugere um que
 * ainda não está na comparação (de preferência da mesma classe do primeiro).
 * As curvas se distinguem por traço, não por cor.
 */
import { ChevronDown, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { obterFichaMedicamento, obterVisaoGeral } from '../../api/client';
import { useCatalogo } from '../../api/referencias';
import type { FichaMedicamento, Medicamento, MotivoDescontinuacao, ProporcaoPainel } from '../../api/types';
import { useFiltros } from '../../app/filtros';
import { LinkRota } from '../../app/rotas';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { Button } from '../../components/Button';
import { AmostraTraco, CurvaPermanencia } from '../../components/CurvaPermanencia';
import { EstadoApi } from '../../components/EstadoApi';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { PainelMedicao } from '../../components/PainelMedicao';
import { formatarHorizonte, formatarInteiro, inicialMaiuscula } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './medicamentos.css';

/** Uma cor por medicamento, linhas contínuas: grafite, teal, azul. */
const SERIES = [{ cor: 'var(--color-serie-1)' }, { cor: 'var(--color-serie-2)' }, { cor: 'var(--color-serie-3)' }];

export default function CompararPage() {
  const catalogo = useCatalogo();
  const { filtros } = useFiltros();
  const chaveFiltros = JSON.stringify(filtros);
  const volume = useApi((signal) => obterVisaoGeral({ filtros }, signal), chaveFiltros);
  const [escolhidos, setEscolhidos] = useState<number[] | null>(null);

  // Começa pelos dois medicamentos com mais tratamentos no recorte.
  const sel = escolhidos ?? (volume.dados ? volume.dados.medicamentos.slice(0, 2).map((m) => m.medicamento_id) : []);
  const carregarFicha = (id: number | undefined) => (id === undefined ? null : (signal: AbortSignal) => obterFichaMedicamento({ medicamento_id: id, filtros }, signal));
  const ficha1 = useApi(carregarFicha(sel[0]), `${sel[0]}|${chaveFiltros}`);
  const ficha2 = useApi(carregarFicha(sel[1]), `${sel[1]}|${chaveFiltros}`);
  const ficha3 = useApi(carregarFicha(sel[2]), `${sel[2]}|${chaveFiltros}`);
  const fichas = [ficha1, ficha2, ficha3];
  const medicamentos = catalogo?.referencias.medicamentos ?? [];

  function trocar(i: number, id: number) {
    const novo = [...sel];
    novo[i] = id;
    setEscolhidos(novo);
  }
  function adicionar() {
    const livres = medicamentos.filter((m) => !sel.includes(m.id));
    const classe = medicamentos.find((m) => m.id === sel[0])?.classe_terapeutica;
    const sugestao = livres.find((m) => m.classe_terapeutica === classe) ?? livres[0];
    if (sugestao) setEscolhidos([...sel, sugestao.id]);
  }

  const prontas = fichas.slice(0, sel.length).map((f) => f.dados);
  const todas = prontas.length > 0 && prontas.every((f): f is FichaMedicamento => f !== null) ? prontas : null;
  const carregando = [volume, ...fichas].some((e) => e.carregando);
  const falha = [volume, ...fichas].find((e) => e.erro)?.erro ?? null;

  return (
    <div className="pagina">
      <LinkRota para="/medicamentos">← Medicamentos</LinkRota>
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Comparar medicamentos</h1>
          <p className="cabecalho-pagina__texto">As mesmas métricas lado a lado, no mesmo recorte de filtros e no mesmo horizonte.</p>
        </div>
        <AvisoNaoPrescreve />
      </header>

      <div className="painel-medicao comparar__seletores">
        <span className="comparar__rotulo">Comparando</span>
        {sel.map((id, i) => (
          <SeletorMedicamento
            key={i}
            medicamentos={medicamentos}
            atual={id}
            ocupados={sel.filter((_, j) => j !== i)}
            serie={SERIES[i]}
            onEscolher={(novo) => trocar(i, novo)}
            onRemover={sel.length > 2 ? () => setEscolhidos(sel.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        {sel.length > 0 && sel.length < 3 && (
          <Button variante="secundario" className="botao--pequeno" icone={<Plus size={14} />} onClick={adicionar} aria-label="Adicionar um terceiro medicamento">
            Adicionar
          </Button>
        )}
        <span className="texto-apoio comparar__nota">Curvas diferenciadas por traço, não por cor.</span>
      </div>

      <EstadoApi estado={{ dados: todas, carregando, erro: falha, recarregar: () => [volume, ...fichas].forEach((e) => e.recarregar()) }} rotulo="Carregando a comparação…">
        {(lista) => <Comparacao fichas={lista} />}
      </EstadoApi>

      <aside className="aviso-limitacao" role="note">
        <strong>Comparação observacional.</strong> Os grupos não foram sorteados: quem recebeu cada medicamento pode diferir em gravidade, idade e
        histórico, e isso pesa nas diferenças acima.
      </aside>
    </div>
  );
}

function SeletorMedicamento({
  medicamentos,
  atual,
  ocupados,
  serie,
  onEscolher,
  onRemover,
}: {
  medicamentos: Medicamento[];
  atual: number;
  ocupados: number[];
  serie: (typeof SERIES)[number];
  onEscolher: (id: number) => void;
  onRemover?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const med = medicamentos.find((m) => m.id === atual);
  const nome = med ? inicialMaiuscula(med.principio_ativo) : '';

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  return (
    <div className="seletor-medicamento" ref={raiz} onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}>
      <button type="button" className="seletor-medicamento__botao" aria-haspopup="listbox" aria-expanded={aberto} aria-label={`Trocar ${nome}`} onClick={() => setAberto((a) => !a)}>
        <AmostraTraco {...serie} />
        <span className="seletor-medicamento__textos">
          <span className="seletor-medicamento__nome">{nome}</span>
          <span className="seletor-medicamento__classe">{med?.classe_terapeutica}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="seletor-medicamento__chevron" />
      </button>
      {onRemover && (
        <button type="button" className="seletor-medicamento__remover" aria-label={`Remover ${nome} da comparação`} onClick={onRemover}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
      {aberto && (
        <div className="seletor-medicamento__menu" role="listbox" aria-label="Escolher medicamento">
          {[...medicamentos]
            .sort((a, b) => a.principio_ativo.localeCompare(b.principio_ativo, 'pt-BR'))
            .map((m) => {
              const usado = ocupados.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={m.id === atual}
                  disabled={usado}
                  className="seletor-medicamento__opcao"
                  onClick={() => {
                    onEscolher(m.id);
                    setAberto(false);
                  }}
                >
                  <span>{inicialMaiuscula(m.principio_ativo)}</span>
                  <span className="texto-secundario">{m.id === atual ? 'selecionado' : usado ? 'já na comparação' : m.classe_terapeutica}</span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

function Comparacao({ fichas }: { fichas: FichaMedicamento[] }) {
  const nMinimo = fichas[0].n_minimo;
  const horizonte = fichas[0].horizonte_dias;
  const nMax = Math.max(...fichas.map((f) => f.contabilidade.n_avaliavel));
  const colunas = { gridTemplateColumns: `13.75rem repeat(${fichas.length}, minmax(0, 1fr))` };
  const motivo = (f: FichaMedicamento, m: MotivoDescontinuacao) => f.descontinuacao_por_motivo.find((d) => d.motivo === m)!;

  const linhas: { rotulo: string; sub: string; celula: (f: FichaMedicamento) => ProporcaoPainel | string }[] = [
    {
      rotulo: 'Tratamentos no recorte',
      sub: 'avaliáveis · censurados',
      celula: (f) =>
        `${formatarInteiro(f.contabilidade.n_tratamentos)} (${formatarInteiro(f.contabilidade.n_avaliavel)} avaliáveis · ${formatarInteiro(f.contabilidade.n_censurado)} censurados)`,
    },
    { rotulo: `Permanência em ${formatarHorizonte(horizonte)}`, sub: 'sobre os avaliáveis', celula: (f) => f.permanencia },
    { rotulo: 'Descontinuação por reação adversa', sub: 'sobre os avaliáveis', celula: (f) => motivo(f, 'desc_reacao_adversa') },
    { rotulo: 'Descontinuação por ineficácia', sub: 'sobre os avaliáveis', celula: (f) => motivo(f, 'desc_ineficacia') },
    { rotulo: 'Descontinuação por não adesão', sub: 'sobre os avaliáveis', celula: (f) => motivo(f, 'desc_nao_adesao') },
    { rotulo: 'Reação mais frequente', sub: 'termo', celula: (f) => f.reacoes[0]?.termo ?? 'nenhuma registrada' },
    { rotulo: '', sub: 'tratamentos com essa reação', celula: (f) => f.reacoes[0] ?? 'sem reação registrada' },
  ];

  return (
    <>
      <PainelMedicao titulo="Métricas lado a lado">
        <div className="comparar__tabela" role="table" aria-label="Métricas lado a lado">
          <div className="comparar__linha comparar__linha--cabecalho" style={colunas} role="row">
            <span role="columnheader" />
            {fichas.map((f) => (
              <span key={f.medicamento.id} role="columnheader">
                <strong>{inicialMaiuscula(f.medicamento.principio_ativo)}</strong>
                <br />
                <span className="texto-secundario">
                  {f.medicamento.classe_terapeutica} · <span className="mono">{f.medicamento.codigo_atc}</span>
                </span>
              </span>
            ))}
          </div>
          {linhas.map((l, i) => (
            <div key={i} className="comparar__linha" style={colunas} role="row">
              <span role="rowheader">
                {l.rotulo}
                <br />
                <span className="texto-secundario">{l.sub}</span>
              </span>
              {fichas.map((f) => {
                const valor = l.celula(f);
                return (
                  <span key={f.medicamento.id} role="cell">
                    {typeof valor === 'string' ? valor : <LeituraProporcao p={valor} nMinimo={nMinimo} nMax={nMax} />}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </PainelMedicao>

      <div className="grade-cartoes">
        <PainelMedicao titulo="Permanência na mesma escala" subtitulo="ponto = estimativa · barra = IC95%">
          {fichas.map((f, i) => (
            <div key={f.medicamento.id} className="linha-leitura">
              <span>
                <AmostraTraco {...SERIES[i]} /> {inicialMaiuscula(f.medicamento.principio_ativo)}
              </span>
              <LeituraProporcao p={f.permanencia} nMinimo={nMinimo} nMax={nMax} grafico="tabela" />
            </div>
          ))}
          <p className="texto-apoio">Intervalos que se sobrepõem indicam que a base não distingue os medicamentos com segurança.</p>
        </PainelMedicao>
        <PainelMedicao titulo="Permanência ao longo do tempo" subtitulo="Kaplan-Meier, valor de cada semana">
          {fichas.every((f) => f.curva) ? (
            <>
              <CurvaPermanencia
                series={fichas.map((f, i) => ({ nome: inicialMaiuscula(f.medicamento.principio_ativo), pontos: f.curva!.pontos, ...SERIES[i] }))}
                ateDias={fichas[0].curva!.ate_dias}
                horizonteDias={horizonte}
                rotulo={`Curvas de permanência de ${fichas.map((f) => inicialMaiuscula(f.medicamento.principio_ativo)).join(', ')}. Os valores com n e IC estão na tabela acima.`}
              />
            </>
          ) : (
            <p className="texto-apoio">Curvas não exibidas: algum medicamento tem menos de {formatarInteiro(nMinimo)} tratamentos no recorte.</p>
          )}
        </PainelMedicao>
      </div>
    </>
  );
}
