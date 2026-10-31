/**
 * <CampoPeriodo> — recorte pela data do atendimento: por mês, por ano ou de um dia a outro.
 * Devolve sempre `data_de`/`data_ate` em ISO, inclusive nas pontas; mês e ano viram o
 * primeiro e o último dia. No intervalo, uma ponta vazia deixa o período aberto.
 */
import { useId, useState } from 'react';
import { formatarData } from '../lib/format';
import { DateField } from './DateField';
import './CampoPeriodo.css';

export interface Periodo {
  data_de?: string;
  data_ate?: string;
}

type Modo = '' | 'mes' | 'ano' | 'intervalo';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Último dia do mês (1 a 12) em ISO. */
function ultimoDia(ano: number, mes: number): string {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(new Date(ano, mes, 0).getDate())}`;
}

function modoDoPeriodo({ data_de, data_ate }: Periodo): Modo {
  if (!data_de && !data_ate) return '';
  if (data_de && data_ate && data_de.endsWith('-01')) {
    const [ano, mes] = data_de.split('-');
    if (mes === '01' && data_ate === `${ano}-12-31`) return 'ano';
    if (data_ate === ultimoDia(Number(ano), Number(mes))) return 'mes';
  }
  return 'intervalo';
}

/** Texto curto do período: "2026", "09/2026", "01/02/2026 a 15/03/2026", "desde 01/02/2026". */
export function descreverPeriodo(p: Periodo): string {
  const modo = modoDoPeriodo(p);
  if (modo === 'ano') return p.data_de!.slice(0, 4);
  if (modo === 'mes') return `${p.data_de!.slice(5, 7)}/${p.data_de!.slice(0, 4)}`;
  if (p.data_de && p.data_ate) return `${formatarData(p.data_de)} a ${formatarData(p.data_ate)}`;
  return p.data_de ? `desde ${formatarData(p.data_de)}` : `até ${formatarData(p.data_ate!)}`;
}

/** Anos com atendimento, do mais recente ao mais antigo (sem base: só o ano corrente). */
export function anosDoPeriodo(periodo: { primeiro: string | null; ultimo: string | null }): number[] {
  const ultimo = periodo.ultimo ? Number(periodo.ultimo.slice(0, 4)) : new Date().getFullYear();
  const primeiro = periodo.primeiro ? Number(periodo.primeiro.slice(0, 4)) : ultimo;
  return Array.from({ length: ultimo - primeiro + 1 }, (_, i) => ultimo - i);
}

export function CampoPeriodo({ valor, onChange, anos }: { valor: Periodo; onChange: (p: Periodo) => void; anos: number[] }) {
  const id = useId();
  const [modo, setModo] = useState<Modo>(() => modoDoPeriodo(valor));
  // mês e intervalo guardam a escolha parcial até formar um período válido (iniciais só na montagem)
  const inicial = modoDoPeriodo(valor);
  const [mes, setMes] = useState(() => (inicial === 'mes' ? valor.data_de!.slice(5, 7) : ''));
  const [anoMes, setAnoMes] = useState(() => (inicial === 'mes' ? valor.data_de!.slice(0, 4) : String(anos[0])));
  const [de, setDe] = useState<string | null>(() => (inicial === 'intervalo' ? (valor.data_de ?? null) : null));
  const [ate, setAte] = useState<string | null>(() => (inicial === 'intervalo' ? (valor.data_ate ?? null) : null));
  const invertido = de !== null && ate !== null && de > ate;

  function trocarModo(novo: Modo) {
    setModo(novo);
    setMes('');
    setAnoMes(String(anos[0]));
    setDe(null);
    setAte(null);
    onChange({});
  }
  function escolherMes(m: string, a: string) {
    setMes(m);
    setAnoMes(a);
    onChange(m && a ? { data_de: `${a}-${m}-01`, data_ate: ultimoDia(Number(a), Number(m)) } : {});
  }
  function escolherIntervalo(novoDe: string | null, novoAte: string | null) {
    setDe(novoDe);
    setAte(novoAte);
    if (novoDe && novoAte && novoDe > novoAte) return;
    const periodo: Periodo = {};
    if (novoDe) periodo.data_de = novoDe;
    if (novoAte) periodo.data_ate = novoAte;
    onChange(periodo);
  }

  return (
    <div className="campo-periodo" role="group" aria-label="Período do atendimento">
      <select className="controle-texto" aria-label="Recortar período por" value={modo} onChange={(e) => trocarModo(e.target.value as Modo)}>
        <option value="">Qualquer data</option>
        <option value="mes">Mês</option>
        <option value="ano">Ano</option>
        <option value="intervalo">De… até…</option>
      </select>
      {modo === 'mes' && (
        <>
          <select className="controle-texto" aria-label="Mês" value={mes} onChange={(e) => escolherMes(e.target.value, anoMes)}>
            <option value="">Mês…</option>
            {MESES.map((nome, i) => (
              <option key={nome} value={doisDigitos(i + 1)}>
                {nome}
              </option>
            ))}
          </select>
          <select className="controle-texto" aria-label="Ano do mês" value={anoMes} onChange={(e) => escolherMes(mes, e.target.value)}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </>
      )}
      {modo === 'ano' && (
        <select
          className="controle-texto"
          aria-label="Ano"
          value={valor.data_de?.slice(0, 4) ?? ''}
          onChange={(e) => onChange(e.target.value ? { data_de: `${e.target.value}-01-01`, data_ate: `${e.target.value}-12-31` } : {})}
        >
          <option value="">Ano…</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      )}
      {modo === 'intervalo' && (
        <>
          <DateField id={`${id}-de`} aria-label="De" valor={de} onChange={(iso) => escolherIntervalo(iso, ate)} />
          <span className="campo-periodo__ate">até</span>
          <DateField
            id={`${id}-ate`}
            aria-label="Até"
            valor={ate}
            min={de ?? undefined}
            onChange={(iso) => escolherIntervalo(de, iso)}
            aria-invalid={invertido || undefined}
          />
          {invertido && <span className="campo-periodo__erro">A data final é anterior à inicial.</span>}
        </>
      )}
    </div>
  );
}
