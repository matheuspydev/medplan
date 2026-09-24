/**
 * Testes de guarda das regras clínicas que não dependem de um componente específico.
 */
import { describe, expect, it } from 'vitest';
import engineSrc from '../../medplan/engine.py?raw';
import { AVISO_VIES_INDICACAO } from './features/metodologia/ConteudoMetodologia';

// Todo o código-fonte de UI, como texto (import.meta.glob é resolvido pelo Vite/Vitest).
const fontes = import.meta.glob<string>(['/src/**/*.tsx', '/src/**/*.ts'], { query: '?raw', import: 'default', eager: true });

/** Número seguido de "%" montado em template/JSX, toFixed ou Intl com style percent. */
const PERCENTUAL_FORMATADO = /\}\s*%|toFixed\(|style:\s*['"]percent/;

describe('guarda: "%" formatado só em <Proporcao>', () => {
  const alvos = Object.entries(fontes).filter(
    ([caminho]) => !caminho.endsWith('/components/Proporcao.tsx') && !/\.test\.tsx?$/.test(caminho),
  );

  it('encontrou os arquivos para varrer', () => {
    expect(alvos.length).toBeGreaterThan(20);
  });

  it('nenhum outro arquivo imprime número seguido de "%"', () => {
    const violacoes = alvos.flatMap(([caminho, texto]) =>
      texto
        .split('\n')
        .map((linha, i) => ({ linha, i }))
        .filter(({ linha }) => PERCENTUAL_FORMATADO.test(linha))
        .map(({ linha, i }) => `${caminho}:${i + 1}: ${linha.trim()}`),
    );
    expect(violacoes).toEqual([]);
  });

  it('a própria regra pega os padrões proibidos', () => {
    expect(PERCENTUAL_FORMATADO.test('{`${pct}%`}')).toBe(true);
    expect(PERCENTUAL_FORMATADO.test('<td>{taxa} %</td>')).toBe(true);
    expect(PERCENTUAL_FORMATADO.test('(x * 100).toFixed(0)')).toBe(true);
    expect(PERCENTUAL_FORMATADO.test("new Intl.NumberFormat('pt-BR', { style: 'percent' })")).toBe(true);
  });
});

describe('guarda: aviso de viés de indicação é literal do motor', () => {
  it('ConteudoMetodologia.AVISO_VIES_INDICACAO == engine.AVISO_VIES_INDICACAO', () => {
    const bloco = engineSrc.match(/AVISO_VIES_INDICACAO\s*=\s*\(([\s\S]*?)\)/);
    expect(bloco).not.toBeNull();
    const literal = [...bloco![1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join('');
    expect(AVISO_VIES_INDICACAO).toBe(literal);
  });
});
