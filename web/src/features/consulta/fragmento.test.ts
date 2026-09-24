import { describe, expect, it } from 'vitest';
import { codificarFragmento, decodificarFragmento } from './fragmento';
import { restaurarFormulario, validarFormulario } from './formulario';
import { catalogoTeste } from './teste-fixtures';

describe('estado da consulta no fragmento', () => {
  it('codifica no formato da spec', () => {
    expect(codificarFragmento({ dx: 'F31.3', sexo: 'feminino', faixa: '26_35', com: ['F41.1', 'I10'], h: 84, nmin: 20 })).toBe(
      '#dx=F31.3&sexo=feminino&faixa=26_35&com=F41.1,I10&h=84&nmin=20',
    );
  });

  it('omite o que está vazio e devolve "" sem nada', () => {
    expect(codificarFragmento({ dx: null, sexo: null, faixa: null, com: [], h: null, nmin: null })).toBe('');
    expect(codificarFragmento({ dx: 'F90.0', com: [], h: 84, nmin: 20 })).toBe('#dx=F90.0&h=84&nmin=20');
  });

  it('ida e volta', () => {
    const estado = { dx: 'F31.3', sexo: 'nao_informado' as const, faixa: '66_mais', com: ['F41.1', 'I10'], h: 90, nmin: 35 };
    expect(decodificarFragmento(codificarFragmento(estado))).toEqual(estado);
  });

  it('decodifica com tolerância: valores malformados e chaves desconhecidas são ignorados', () => {
    expect(decodificarFragmento('#dx=F31.3&sexo=F&faixa=&com=F41.1,,F41.1&h=12a&nmin=%ZZ&nome=x')).toEqual({
      dx: 'F31.3',
      sexo: null,
      faixa: null,
      com: ['F41.1'],
      h: null,
      nmin: null,
    });
    expect(decodificarFragmento('')).toEqual({ dx: null, sexo: null, faixa: null, com: [], h: null, nmin: null });
  });

  it('restaura contra o catálogo: descarta código desconhecido, comorbidade igual ao principal e n mínimo fora da faixa', () => {
    const catalogo = catalogoTeste();
    const f = restaurarFormulario('#dx=F31.3&sexo=feminino&faixa=99_99&com=F31.3,Z99.9,I10&nmin=500', catalogo);
    expect(f).toEqual({ dx: 'F31.3', sexo: 'feminino', faixa: null, com: ['I10'], h: 84, nmin: 20 });
    expect(Object.keys(validarFormulario(f, catalogo.referencias.limites))).toEqual(['faixa']);
  });

  it('valida horizonte fora de 28–180', () => {
    const catalogo = catalogoTeste();
    const f = restaurarFormulario('#dx=F31.3&sexo=feminino&faixa=26_35&h=200', catalogo);
    expect(validarFormulario(f, catalogo.referencias.limites).h).toBe('Informe o horizonte em dias inteiros, de 28 a 180.');
  });
});
