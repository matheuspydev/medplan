import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FaixaIC } from './FaixaIC';
import { Proporcao } from './Proporcao';

describe('<Proporcao>', () => {
  it('fixa o formato do CLAUDE.md: "82% (n=134, IC95% 75–88%)"', () => {
    const { container } = render(<Proporcao pct={82} n={134} icInfPct={75} icSupPct={88} nMinimo={20} tamanho="linha" />);
    expect(container.textContent).toBe('82% (n=134, IC95% 75–88%)');
    expect(container.textContent).not.toContain('IC 95');
    expect(container.textContent).not.toContain('75%'); // limite inferior sem "%" (formato "75–88%")
  });

  it('expõe o aria-label da spec', () => {
    render(<Proporcao pct={70} n={37} icInfPct={54} icSupPct={83} nMinimo={20} tamanho="destaque" />);
    expect(
      screen.getByRole('img', { name: '70 por cento; n igual a 37; intervalo de confiança de 95 por cento de 54 a 83 por cento' }),
    ).toBeTruthy();
  });

  it('usa ponto de milhar pt-BR no n', () => {
    const { container } = render(<Proporcao pct={88} n={1234} icInfPct={86} icSupPct={90} nMinimo={20} tamanho="linha" />);
    expect(container.textContent).toBe('88% (n=1.234, IC95% 86–90%)');
  });

  it('só destaca o limite inferior quando pedido', () => {
    const { container, rerender } = render(<Proporcao pct={70} n={37} icInfPct={54} icSupPct={83} nMinimo={20} tamanho="linha" />);
    expect(container.querySelector('.proporcao__inf--sinal')).toBeNull();
    rerender(<Proporcao pct={70} n={37} icInfPct={54} icSupPct={83} nMinimo={20} tamanho="linha" destacarLimiteInferior />);
    expect(container.querySelector('.proporcao__inf--sinal')?.textContent).toBe('54');
  });

  it('abaixo do n mínimo: "dados insuficientes (n=12)" sem percentual no DOM nem no aria-label', () => {
    const { container } = render(<Proporcao pct={82} n={12} icInfPct={75} icSupPct={88} nMinimo={20} tamanho="linha" />);
    const alvo = screen.getByRole('img');
    const label = alvo.getAttribute('aria-label') ?? '';

    expect(container.textContent).toBe('dados insuficientes (n=12)');
    for (const texto of [container.innerHTML, label]) {
      expect(texto).not.toContain('%');
      expect(texto).not.toContain('por cento');
      expect(texto).not.toMatch(/82|75|88/);
    }
    expect(label).toBe('dados insuficientes; n igual a 12');
  });

  it('sem pct ou sem IC também é "dados insuficientes", mesmo com n suficiente', () => {
    const { container } = render(<Proporcao pct={null} n={40} icInfPct={null} icSupPct={null} nMinimo={20} tamanho="linha" />);
    expect(container.textContent).toBe('dados insuficientes (n=40)');
    expect(container.innerHTML).not.toContain('%');
  });

  it('n igual ao mínimo já exibe a proporção', () => {
    const { container } = render(<Proporcao pct={65} n={20} icInfPct={43} icSupPct={82} nMinimo={20} tamanho="linha" />);
    expect(container.textContent).toBe('65% (n=20, IC95% 43–82%)');
  });
});

describe('<FaixaIC>', () => {
  it('é decorativo e não imprime texto', () => {
    const { container } = render(<FaixaIC taxa={0.7} icInferior={0.54} icSuperior={0.83} n={37} nMaxTabela={37} destacarLimiteInferior />);
    const raiz = container.firstElementChild!;
    expect(raiz.getAttribute('aria-hidden')).toBe('true');
    expect(raiz.textContent).toBe('');
    expect(container.querySelector('.faixa-ic--destaque .faixa-ic__limite')).not.toBeNull();
  });
});
