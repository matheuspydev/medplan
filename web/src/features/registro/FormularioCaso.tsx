/**
 * Formulário do Registro de caso: estado do rascunho (só em memória), validação, envio e o rail de resumo.
 *
 * - Enter nunca envia (não há <form>; botões são type="button"). Ctrl+S salva.
 * - Formato no blur; obrigatórios só depois de tentar salvar. Erros 422 do servidor vão para o campo.
 * - Rascunho só em memória: sobrevive à troca de aba dentro do app (variável do módulo), some ao
 *   recarregar (com aviso de beforeunload). Nada em localStorage.
 */
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErroApi, registrarCaso } from '../../api/client';
import type { Catalogo } from '../../api/referencias';
import type { CasoCriado, StatusTratamento } from '../../api/types';
import { Button } from '../../components/Button';
import { PainelMedicao } from '../../components/PainelMedicao';
import { useAtalhos } from '../../lib/atalhos';
import { hojeIso } from '../../lib/format';
import { BlocoTratamento, idAdicionarReacao, idCabecalhoTratamento, type PatchReacao, type PatchTratamento } from './BlocoTratamento';
import type { ApiCampos } from './campos';
import { LinhaDoTempo } from './LinhaDoTempo';
import {
  chavePerfil,
  chaveReacao,
  chavesEmOrdem,
  chaveDoCampoServidor,
  chaveTratamento,
  descreverChave,
  ehCensura,
  idDom,
  MAX_TRATAMENTOS,
  novaReacao,
  novoRascunho,
  novoTratamento,
  type CampoPerfil,
  type Rascunho,
  type RascunhoPerfil,
  type RascunhoTratamento,
} from './modelo';
import { montarPayload } from './payload';
import { ResumoRegistro, type FalhaEnvio, type PendenciaVisivel } from './ResumoRegistro';
import { SecaoPerfil } from './SecaoPerfil';
import { CAMPOS_OBRIGATORIOS_PERFIL, validarRascunho } from './validacao';

interface EstadoRascunho {
  rascunho: Rascunho;
  /** ids dos blocos abertos */
  abertos: number[];
  sujo: boolean;
}

/** Rascunho em memória entre montagens da tela (troca de aba). Zerado ao registrar ou recomeçar. */
let rascunhoEmMemoria: EstadoRascunho | null = null;

function estadoInicial(): EstadoRascunho {
  const rascunho = novoRascunho();
  return { rascunho, abertos: rascunho.tratamentos.map((t) => t.id), sujo: false };
}

interface Props {
  catalogo: Catalogo;
  /** Chamado após 201, com o rascunho exatamente como foi enviado. */
  onRegistrado: (criado: CasoCriado, enviado: Rascunho) => void;
}

export function FormularioCaso({ catalogo, onRegistrado }: Props) {
  const [estado, setEstado] = useState<EstadoRascunho>(() => rascunhoEmMemoria ?? estadoInicial());
  const { rascunho, abertos, sujo } = estado;

  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [invalidas, setInvalidas] = useState<ReadonlySet<string>>(new Set());
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [errosServidor, setErrosServidor] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<FalhaEnvio | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [removido, setRemovido] = useState<{ tratamento: RascunhoTratamento; indice: number } | null>(null);
  const [dataFimRemovida, setDataFimRemovida] = useState<Record<number, { status: StatusTratamento | null; data_fim: string }>>({});
  const [focoPendente, setFocoPendente] = useState<string | null>(null);

  useEffect(() => {
    rascunhoEmMemoria = estado;
  }, [estado]);

  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sujo]);

  useEffect(() => {
    if (!focoPendente) return;
    setFocoPendente(null);
    const el = document.getElementById(focoPendente);
    if (!el) return;
    const alvo = el.matches('input, select, button, [tabindex]')
      ? el
      : (el.querySelector<HTMLElement>('input:checked:not(:disabled)') ?? el.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select'));
    alvo?.focus({ preventScroll: true });
    alvo?.scrollIntoView?.({ block: 'center' });
  }, [focoPendente]);

  // ---- validação ---------------------------------------------------------------
  const hoje = hojeIso();
  const validacao = useMemo(() => validarRascunho(rascunho, { hoje, entradasInvalidas: invalidas }), [rascunho, hoje, invalidas]);
  const errosPorChave = useMemo(() => new Map(validacao.erros.map((e) => [e.chave, e])), [validacao]);
  const alertasPorChave = useMemo(() => new Map(validacao.alertas.map((a) => [a.chave, a.mensagem])), [validacao]);

  function erroVisivel(chave: string): string | null {
    const local = errosPorChave.get(chave);
    if (local && (tentouSalvar || (local.tipo === 'formato' && tocados.has(chave)))) return local.mensagem;
    return errosServidor[chave] ?? null;
  }

  const pendencias: PendenciaVisivel[] = chavesEmOrdem(rascunho).flatMap((chave) => {
    const mensagem = erroVisivel(chave);
    if (!mensagem) return [];
    const obrigatorio = errosPorChave.get(chave)?.tipo === 'obrigatorio' && !errosServidor[chave];
    return [{ chave, texto: `${descreverChave(chave, rascunho)}${obrigatorio ? ': obrigatório' : ''}` }];
  });

  const pendenciasPorTratamento = (tid: number) => validacao.erros.filter((e) => e.chave.startsWith(`t${tid}.`)).length;

  const campos: ApiCampos = {
    catalogo,
    erro: erroVisivel,
    alerta: (chave) => alertasPorChave.get(chave) ?? null,
    tocar: (chave) => setTocados((s) => (s.has(chave) ? s : new Set(s).add(chave))),
    marcarEntrada: (chave, invalida) =>
      setInvalidas((s) => {
        if (s.has(chave) === invalida) return s;
        const novo = new Set(s);
        if (invalida) novo.add(chave);
        else novo.delete(chave);
        return novo;
      }),
    pendenciasDoTratamento: pendenciasPorTratamento,
  };

  // ---- atualizações ---------------------------------------------------------------
  function aplicar(transformar: (r: Rascunho) => Rascunho, chaves: string[], abertosNovos?: (a: number[]) => number[]) {
    setEstado((e) => ({ rascunho: transformar(e.rascunho), abertos: abertosNovos ? abertosNovos(e.abertos) : e.abertos, sujo: true }));
    if (chaves.some((c) => c in errosServidor)) {
      setErrosServidor((atual) => Object.fromEntries(Object.entries(atual).filter(([c]) => !chaves.includes(c))));
    }
  }

  const mapearTratamento = (tid: number, fn: (t: RascunhoTratamento) => RascunhoTratamento) => (r: Rascunho) => ({
    ...r,
    tratamentos: r.tratamentos.map((t) => (t.id === tid ? fn(t) : t)),
  });

  function atualizarPerfil<K extends CampoPerfil>(campo: K, valor: RascunhoPerfil[K]) {
    aplicar((r) => ({ ...r, perfil: { ...r.perfil, [campo]: valor } }), [chavePerfil(campo)]);
  }

  function atualizarTratamento(tid: number, patch: PatchTratamento) {
    aplicar(
      mapearTratamento(tid, (t) => ({ ...t, ...patch })),
      Object.keys(patch).map((c) => chaveTratamento(tid, c as keyof PatchTratamento)),
    );
  }

  function mudarStatus(t: RascunhoTratamento, status: StatusTratamento) {
    const limpaDataFim = ehCensura(status) && t.data_fim !== null;
    setDataFimRemovida((d) => {
      const { [t.id]: _anterior, ...resto } = d;
      return limpaDataFim ? { ...resto, [t.id]: { status: t.status, data_fim: t.data_fim! } } : resto;
    });
    atualizarTratamento(t.id, ehCensura(status) ? { status, data_fim: null } : { status });
    campos.tocar(chaveTratamento(t.id, 'status'));
  }

  function desfazerDataFim(tid: number) {
    const anterior = dataFimRemovida[tid];
    if (!anterior) return;
    atualizarTratamento(tid, { status: anterior.status, data_fim: anterior.data_fim });
    setDataFimRemovida(({ [tid]: _removida, ...resto }) => resto);
    setFocoPendente(idDom(chaveTratamento(tid, 'data_fim')));
  }

  function adicionarTratamento() {
    const novo = novoTratamento();
    aplicar((r) => ({ ...r, tratamentos: [...r.tratamentos, novo] }), [], (a) => [...a, novo.id]);
    setFocoPendente(idDom(chaveTratamento(novo.id, 'medicamento_id')));
  }

  function confirmarRemocao(tid: number) {
    const indice = rascunho.tratamentos.findIndex((t) => t.id === tid);
    const vizinho = rascunho.tratamentos[indice - 1] ?? rascunho.tratamentos[indice + 1];
    setRemovido({ tratamento: rascunho.tratamentos[indice], indice });
    setConfirmando(null);
    aplicar((r) => ({ ...r, tratamentos: r.tratamentos.filter((t) => t.id !== tid) }), []);
    if (vizinho) setFocoPendente(idCabecalhoTratamento(vizinho.id));
  }

  function desfazerRemocao() {
    if (!removido) return;
    const { tratamento, indice } = removido;
    aplicar(
      (r) => {
        const lista = [...r.tratamentos];
        lista.splice(Math.min(indice, lista.length), 0, tratamento);
        return { ...r, tratamentos: lista };
      },
      [],
      (a) => [...a, tratamento.id],
    );
    setRemovido(null);
    setFocoPendente(idCabecalhoTratamento(tratamento.id));
  }

  function alternar(tid: number) {
    setEstado((e) => ({ ...e, abertos: e.abertos.includes(tid) ? e.abertos.filter((x) => x !== tid) : [...e.abertos, tid] }));
  }

  function adicionarReacao(tid: number) {
    const nova = novaReacao();
    aplicar(mapearTratamento(tid, (t) => ({ ...t, reacoes: [...t.reacoes, nova] })), [chaveTratamento(tid, 'reacoes')]);
    setFocoPendente(idDom(chaveReacao(tid, nova.id, 'reacao_adversa_id')));
  }

  function atualizarReacao(tid: number, rid: number, patch: PatchReacao) {
    aplicar(
      mapearTratamento(tid, (t) => ({ ...t, reacoes: t.reacoes.map((x) => (x.id === rid ? { ...x, ...patch } : x)) })),
      Object.keys(patch).map((c) => chaveReacao(tid, rid, c as keyof PatchReacao)),
    );
  }

  function removerReacao(tid: number, rid: number) {
    aplicar(mapearTratamento(tid, (t) => ({ ...t, reacoes: t.reacoes.filter((x) => x.id !== rid) })), []);
    setFocoPendente(idAdicionarReacao(tid));
  }

  /** Link de pendência: abre o bloco do campo e leva o foco até ele. */
  function irPara(chave: string) {
    const tid = /^t(\d+)\./.exec(chave)?.[1];
    if (tid && !abertos.includes(Number(tid))) alternar(Number(tid));
    setFocoPendente(idDom(chave));
  }

  // ---- envio ---------------------------------------------------------------------
  async function salvar() {
    if (salvando) return;
    setTentouSalvar(true);
    setFalha(null);
    setErrosServidor({});
    if (validacao.erros.length) {
      setFocoPendente('reg-pendencias');
      return;
    }
    const enviado = rascunho;
    setSalvando(true);
    try {
      const criado = await registrarCaso(montarPayload(enviado));
      rascunhoEmMemoria = null;
      onRegistrado(criado, enviado);
    } catch (e) {
      const erros = e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha inesperada ao enviar o registro.' }];
      const porCampo: Record<string, string> = {};
      const gerais: string[] = [];
      for (const item of erros) {
        const chave = item.campo ? chaveDoCampoServidor(item.campo, enviado) : null;
        if (chave) porCampo[chave] ??= item.mensagem;
        else gerais.push(item.mensagem);
      }
      setErrosServidor(porCampo);
      setFalha({ mensagens: gerais, camposMarcados: Object.keys(porCampo).length > 0 });
      setSalvando(false);
      setFocoPendente('reg-pendencias');
    }
  }

  useAtalhos([{ tecla: 's', ctrl: true, acao: () => void salvar() }]);

  const perfilPreenchidos = CAMPOS_OBRIGATORIOS_PERFIL.filter((c) => errosPorChave.get(chavePerfil(c))?.tipo !== 'obrigatorio').length;
  const podeDesfazerRemocao = removido !== null && rascunho.tratamentos.length < MAX_TRATAMENTOS;

  return (
    <div className="registro__grade">
      <div className="registro__formulario">
        <SecaoPerfil perfil={rascunho.perfil} campos={campos} onChange={atualizarPerfil} />

        <PainelMedicao titulo="Tratamentos" densidade="formulario" id="reg-secao-tratamentos">
          {rascunho.tratamentos.some((t) => t.data_inicio !== null) && (
            <div className="linha-tempo__quadro">
              <LinhaDoTempo tratamentos={rascunho.tratamentos} />
            </div>
          )}

          <div className="registro__tratamentos">
            {rascunho.tratamentos.map((t, i) => (
              <BlocoTratamento
                key={t.id}
                tratamento={t}
                indice={i}
                aberto={abertos.includes(t.id)}
                podeRemover={rascunho.tratamentos.length > 1}
                confirmandoRemocao={confirmando === t.id}
                podeDesfazerDataFim={t.id in dataFimRemovida}
                campos={campos}
                onAlternar={() => alternar(t.id)}
                onAtualizar={(patch) => atualizarTratamento(t.id, patch)}
                onMudarStatus={(status) => mudarStatus(t, status)}
                onDesfazerDataFim={() => desfazerDataFim(t.id)}
                onPedirRemocao={() => setConfirmando(t.id)}
                onCancelarRemocao={() => setConfirmando(null)}
                onConfirmarRemocao={() => confirmarRemocao(t.id)}
                onAdicionarReacao={() => adicionarReacao(t.id)}
                onAtualizarReacao={(rid, patch) => atualizarReacao(t.id, rid, patch)}
                onRemoverReacao={(rid) => removerReacao(t.id, rid)}
              />
            ))}
          </div>

          {removido && (
            <p className="linha-desfazer">
              T{removido.indice + 1} removido ·{' '}
              <Button variante="link" onClick={desfazerRemocao} disabled={!podeDesfazerRemocao}>
                Desfazer
              </Button>
              {!podeDesfazerRemocao && <span className="caption"> (limite de {MAX_TRATAMENTOS} tratamentos atingido)</span>}
            </p>
          )}

          <Button variante="secundario" icone={<Plus size={14} />} onClick={adicionarTratamento} disabled={rascunho.tratamentos.length >= MAX_TRATAMENTOS}>
            Adicionar tratamento
          </Button>
          {rascunho.tratamentos.length >= MAX_TRATAMENTOS && <p className="caption">Limite de {MAX_TRATAMENTOS} tratamentos por caso.</p>}
        </PainelMedicao>
      </div>

      <ResumoRegistro
        perfilPreenchidos={perfilPreenchidos}
        perfilTotal={CAMPOS_OBRIGATORIOS_PERFIL.length}
        tratamentos={rascunho.tratamentos.map((t, i) => {
          const nome = t.medicamento_id !== null ? catalogo.medicamento(t.medicamento_id)?.principio_ativo : undefined;
          return { tid: t.id, rotulo: `T${i + 1} · ${nome ?? '—'}`, pendencias: pendenciasPorTratamento(t.id) };
        })}
        pendencias={pendencias}
        falha={falha}
        salvando={salvando}
        onIrPara={irPara}
        onSalvar={() => void salvar()}
      />
    </div>
  );
}
