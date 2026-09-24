/**
 * Estado da consulta no FRAGMENTO da URL (nunca em query string: o fragmento não chega a
 * logs de servidor ou proxy).
 *
 *   #dx=F31.3&sexo=feminino&faixa=26_35&com=F41.1,I10&h=84&nmin=20
 *
 * Funções puras. A validação contra o catálogo (código existe, faixa existe, limites) fica na tela.
 * Exportado também para o Registro montar o link "Consultar este perfil":
 *   navegar('/consulta', codificarFragmento({ dx, sexo, faixa, com }))
 */
import type { Sexo } from '../../api/types';

export interface EstadoFragmento {
  dx: string | null;
  sexo: Sexo | null;
  faixa: string | null;
  com: string[];
  h: number | null;
  nmin: number | null;
}

const SEXOS: readonly Sexo[] = ['feminino', 'masculino', 'intersexo', 'nao_informado'];

/** Monta "#chave=valor&..." na ordem dx, sexo, faixa, com, h, nmin; omite o que está vazio. "" se nada. */
export function codificarFragmento(estado: Partial<EstadoFragmento>): string {
  const partes: string[] = [];
  const texto = (chave: string, valor: string | null | undefined) => {
    if (valor) partes.push(`${chave}=${encodeURIComponent(valor)}`);
  };
  texto('dx', estado.dx);
  texto('sexo', estado.sexo);
  texto('faixa', estado.faixa);
  if (estado.com && estado.com.length) partes.push(`com=${estado.com.map(encodeURIComponent).join(',')}`);
  if (estado.h !== null && estado.h !== undefined) partes.push(`h=${estado.h}`);
  if (estado.nmin !== null && estado.nmin !== undefined) partes.push(`nmin=${estado.nmin}`);
  return partes.length ? `#${partes.join('&')}` : '';
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor).trim();
  } catch {
    return '';
  }
}

function inteiro(valor: string): number | null {
  return /^\d{1,4}$/.test(valor) ? Number(valor) : null;
}

/** Lê o fragmento com tolerância: chave desconhecida ou valor malformado é ignorado. */
export function decodificarFragmento(hash: string): EstadoFragmento {
  const estado: EstadoFragmento = { dx: null, sexo: null, faixa: null, com: [], h: null, nmin: null };
  const corpo = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const par of corpo.split('&')) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    const chave = par.slice(0, i);
    const bruto = par.slice(i + 1);
    switch (chave) {
      case 'dx':
        estado.dx = decodificar(bruto) || null;
        break;
      case 'sexo': {
        const s = decodificar(bruto);
        estado.sexo = (SEXOS as readonly string[]).includes(s) ? (s as Sexo) : null;
        break;
      }
      case 'faixa':
        estado.faixa = decodificar(bruto) || null;
        break;
      case 'com':
        estado.com = [...new Set(bruto.split(',').map(decodificar).filter(Boolean))];
        break;
      case 'h':
        estado.h = inteiro(bruto);
        break;
      case 'nmin':
        estado.nmin = inteiro(bruto);
        break;
    }
  }
  return estado;
}
