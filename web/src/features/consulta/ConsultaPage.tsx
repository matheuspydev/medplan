/**
 * Consulta + Resultado (/consulta).
 *
 * - Cartão "Perfil do paciente" no topo, sempre editável, e o resultado em largura total abaixo.
 * - Estado no FRAGMENTO da URL (#dx=...&sexo=...&faixa=...&com=...&h=...&nmin=...), restaurado ao carregar;
 *   se o fragmento traz um perfil completo e válido, a leitura é refeita (sobrevive a recarregar e atende
 *   "Consultar este perfil" vindo do Registro).
 * - Leitura DESATUALIZADA = o perfil difere do perfil lido: cartões do resultado esmaecidos, aria-hidden, inert.
 *   Disclaimer, nota de viés e faixa sintética ficam a 100%.
 * - Falha da API REMOVE o resultado anterior. Nada vai para o console; mensagens não ecoam o perfil.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { criarAnalise, ErroApi } from '../../api/client';
import { ComReferencias, type Catalogo } from '../../api/referencias';
import type { AnaliseResposta, ErroCampo } from '../../api/types';
import { AvisoNaoPrescreve } from '../../components/AvisoNaoPrescreve';
import { AvisoViesIndicacao } from '../../components/AvisoViesIndicacao';
import { Button } from '../../components/Button';
import { LoadingLine } from '../../components/LoadingLine';
import { PainelFalha } from '../../components/PainelFalha';
import { useAtalhos } from '../../lib/atalhos';
import { plural } from '../../lib/format';
import { AVISO_VIES_INDICACAO } from '../metodologia/ConteudoMetodologia';
import { CabecalhoLeitura } from './CabecalhoLeitura';
import { CriteriosIgnorados } from './CriteriosIgnorados';
import { EscadaCoorte } from './EscadaCoorte';
import { codificarFragmento } from './fragmento';
import {
  formularioVazio,
  ID_FOCO,
  ORDEM_CAMPOS,
  paraEntrada,
  restaurarFormulario,
  validarFormulario,
  type Formulario,
} from './formulario';
import { PerfilPaciente } from './PerfilPaciente';
import { PreviaRelaxamento } from './PreviaRelaxamento';
import { DadosInsuficientes, SemDadosSuficientes } from './SemDados';
import { TabelaPermanencia } from './TabelaPermanencia';
import './consulta.css';

export default function ConsultaPage() {
  return (
    <div className="consulta-raiz">
      <h1 className="sr-only">Consulta</h1>
      <ComReferencias>{(catalogo) => <Consulta catalogo={catalogo} />}</ComReferencias>
    </div>
  );
}

interface Leitura {
  resposta: AnaliseResposta;
  /** Fragmento do formulário que produziu esta leitura (compara com o perfil para saber se está desatualizada). */
  chave: string;
}

/** "Coorte calculada no nível 5 de 5: 265 perfis, 3 medicamentos com dados suficientes, 5 critérios ignorados." */
export function textoAnuncio(r: AnaliseResposta): string {
  const medicamentos = r.recomendados.length;
  const ignorados = r.nivel.criterios_relaxados.length;
  return (
    `Coorte calculada no nível ${r.nivel.ordem} de ${r.escada.length - 1}: ${plural(r.n_perfis, 'perfil', 'perfis')}, ` +
    `${medicamentos === 0 ? 'nenhum medicamento com dados suficientes' : plural(medicamentos, 'medicamento com dados suficientes', 'medicamentos com dados suficientes')}, ` +
    `${ignorados === 0 ? 'nenhum critério ignorado' : plural(ignorados, 'critério ignorado', 'critérios ignorados')}.`
  );
}

function valido(f: Formulario, catalogo: Catalogo): boolean {
  return Object.keys(validarFormulario(f, catalogo.referencias.limites)).length === 0;
}

function Consulta({ catalogo }: { catalogo: Catalogo }) {
  const { limites } = catalogo.referencias;

  const [form, setForm] = useState<Formulario>(() => restaurarFormulario(window.location.hash, catalogo));
  const [tentou, setTentou] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falha, setFalha] = useState<ErroCampo[] | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [eco, setEco] = useState(false);

  const controle = useRef<AbortController | null>(null);
  const focarTituloAoTerminar = useRef(false);
  const refPerfil = useRef<HTMLElement>(null);
  const refCabecalho = useRef<HTMLElement>(null);
  const refTitulo = useRef<HTMLHeadingElement>(null);
  const refBanda = useRef<HTMLDivElement>(null);
  const refEscada = useRef<HTMLElement>(null);
  const refCriterios = useRef<HTMLHeadingElement>(null);

  const erros = tentou ? validarFormulario(form, limites) : {};
  const chaveAtual = codificarFragmento(form);
  const desatualizada = leitura !== null && leitura.chave !== chaveAtual;
  const esmaecido = leitura !== null && (desatualizada || carregando);

  function executar(f: Formulario, focarTitulo: boolean) {
    controle.current?.abort();
    const atual = new AbortController();
    controle.current = atual;
    setCarregando(true);
    setFalha(null);

    criarAnalise(paraEntrada(f), atual.signal)
      .then((resposta) => {
        if (atual.signal.aborted) return;
        focarTituloAoTerminar.current = focarTitulo;
        setLeitura({ resposta, chave: codificarFragmento(f) });
        setCarregando(false);
        setAnuncio(textoAnuncio(resposta));
      })
      .catch((e: unknown) => {
        if (atual.signal.aborted) return;
        setLeitura(null);
        setFalha(e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha inesperada ao calcular a coorte.' }]);
        setCarregando(false);
        setAnuncio('');
      });
  }

  function focarCampo(id: string) {
    document.getElementById(id)?.focus();
  }

  function analisar() {
    setTentou(true);
    const errosAgora = validarFormulario(form, limites);
    const primeiro = ORDEM_CAMPOS.find((c) => errosAgora[c]);
    if (primeiro) {
      focarCampo(ID_FOCO[primeiro]);
      return;
    }
    executar(form, true);
  }

  function editarPerfil() {
    refPerfil.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    refPerfil.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }

  function alterar(parcial: Partial<Formulario>) {
    setForm((atual) => ({ ...atual, ...parcial }));
  }

  // Carga inicial e mudança manual do fragmento: restaura e, com perfil completo, refaz a leitura.
  useEffect(() => {
    if (window.location.hash) {
      const inicial = restaurarFormulario(window.location.hash, catalogo);
      if (valido(inicial, catalogo)) executar(inicial, false);
    }
    function aoMudarFragmento() {
      const f = restaurarFormulario(window.location.hash, catalogo);
      setForm(f);
      setTentou(false);
      if (valido(f, catalogo)) executar(f, false);
    }
    window.addEventListener('hashchange', aoMudarFragmento);
    return () => {
      window.removeEventListener('hashchange', aoMudarFragmento);
      controle.current?.abort();
    };
  }, []); // só na montagem: `executar` usa apenas setters e refs

  // Perfil -> fragmento (replaceState: não cria entrada de histórico nem dispara hashchange).
  useEffect(() => {
    if (chaveAtual === window.location.hash) return;
    if (!window.location.hash && formularioVazio(form, limites)) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${chaveAtual}`);
  }, [chaveAtual, form, limites]);

  // Depois de uma análise pedida pela pessoa, o foco vai para o título da leitura.
  useEffect(() => {
    if (leitura && focarTituloAoTerminar.current) {
      focarTituloAoTerminar.current = false;
      refTitulo.current?.focus();
    }
  }, [leitura]);

  // Eco de uma linha no cabeçalho quando a nota de viés sai da tela por rolagem.
  const temLeitura = leitura !== null;
  useEffect(() => {
    if (!temLeitura) {
      setEco(false);
      return;
    }
    function medir() {
      const banda = refBanda.current?.getBoundingClientRect();
      const cabecalho = refCabecalho.current?.getBoundingClientRect();
      if (!banda || !cabecalho || cabecalho.height === 0) return;
      setEco(banda.bottom <= cabecalho.bottom);
    }
    medir();
    window.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [temLeitura]);

  useAtalhos([
    { tecla: 'Enter', ctrl: true, acao: analisar },
    { tecla: '/', acao: () => focarCampo(ID_FOCO.dx) },
  ]);

  // Ctrl+Enter de dentro de qualquer campo (os combobox consomem Enter antes do atalho global).
  function aoTeclarCaptura(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      analisar();
    }
  }

  const resposta = leitura?.resposta ?? null;

  return (
    <div className="consulta" onKeyDownCapture={aoTeclarCaptura}>
      {!resposta && !falha && (
        <section className="hero" aria-labelledby="hero-titulo">
          <p className="hero__sobre">Consulta de coorte</p>
          <h2 id="hero-titulo" className="hero__titulo">
            Como pacientes parecidos toleraram cada medicamento.
          </h2>
          <p className="hero__texto">Todo resultado vem com n e intervalo de confiança, e com os limites dos dados à vista.</p>
          <AvisoNaoPrescreve />
        </section>
      )}

      <PerfilPaciente
        ref={refPerfil}
        catalogo={catalogo}
        form={form}
        alterar={alterar}
        erros={erros}
        leituraVigente={resposta && !esmaecido ? resposta : null}
        onAnalisar={analisar}
      />

      <div className="consulta__resultado" aria-busy={carregando || undefined}>
        <LoadingLine ativo={carregando} rotulo="Calculando coorte…" className="consulta__carregando" />

        {falha ? (
          <div className="consulta__pilha">
            <AvisoNaoPrescreve />
            <PainelFalha
              titulo="Não foi possível calcular a coorte. Nenhum resultado foi exibido."
              acao={
                <Button variante="secundario" onClick={analisar}>
                  Tentar novamente
                </Button>
              }
            >
              {falha.map((erro, i) => (
                <p key={i}>{erro.mensagem}</p>
              ))}
            </PainelFalha>
          </div>
        ) : resposta ? (
          <div className="leitura" key={resposta.proveniencia.calculado_em}>
            <CabecalhoLeitura
              resposta={resposta}
              nMinimoPadrao={limites.n_minimo_padrao}
              desatualizada={desatualizada}
              eco={eco}
              onRecalcular={analisar}
              onEditarPerfil={editarPerfil}
              onIrCriterios={() => {
                const alvo = refCriterios.current;
                alvo?.scrollIntoView?.({ block: 'center' });
                alvo?.focus({ preventScroll: true });
              }}
              refCabecalho={refCabecalho}
              refTitulo={refTitulo}
            />
            <div ref={refBanda}>
              <AvisoViesIndicacao texto={resposta.avisos.find((a) => a.tipo === 'vies_indicacao')?.texto ?? AVISO_VIES_INDICACAO} />
            </div>

            <div
              className={esmaecido ? 'leitura__paineis leitura__paineis--esmaecidos' : 'leitura__paineis'}
              aria-hidden={esmaecido || undefined}
              inert={esmaecido || undefined}
            >
              <CriteriosIgnorados resposta={resposta} refTitulo={refCriterios} />

              {resposta.dados_insuficientes ? (
                <DadosInsuficientes
                  resposta={resposta}
                  onVerEscada={() => {
                    const titulo = refEscada.current?.querySelector<HTMLElement>('h2');
                    titulo?.scrollIntoView?.({ block: 'center' });
                    titulo?.focus({ preventScroll: true });
                  }}
                  onRevisar={() => focarCampo(ID_FOCO.dx)}
                />
              ) : (
                <TabelaPermanencia resposta={resposta} />
              )}

              {resposta.sem_dados_suficientes.length > 0 && <SemDadosSuficientes resposta={resposta} />}

              <EscadaCoorte resposta={resposta} refPainel={refEscada} />
            </div>
          </div>
        ) : (
          <PreviaRelaxamento form={form} catalogo={catalogo} />
        )}

        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </div>
    </div>
  );
}
