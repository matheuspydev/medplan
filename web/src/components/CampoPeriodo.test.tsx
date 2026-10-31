import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { anosDoPeriodo, CampoPeriodo, descreverPeriodo } from './CampoPeriodo';

describe('CampoPeriodo', () => {
  it('mês vira do primeiro ao último dia (fevereiro bissexto incluso)', () => {
    const onChange = vi.fn();
    render(<CampoPeriodo valor={{}} onChange={onChange} anos={[2024, 2023]} />);
    fireEvent.change(screen.getByLabelText('Recortar período por'), { target: { value: 'mes' } });
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '02' } });
    expect(onChange).toHaveBeenLastCalledWith({ data_de: '2024-02-01', data_ate: '2024-02-29' });
  });

  it('ano vira 1º de janeiro a 31 de dezembro', () => {
    const onChange = vi.fn();
    render(<CampoPeriodo valor={{}} onChange={onChange} anos={[2026, 2025]} />);
    fireEvent.change(screen.getByLabelText('Recortar período por'), { target: { value: 'ano' } });
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenLastCalledWith({ data_de: '2025-01-01', data_ate: '2025-12-31' });
  });

  it('intervalo invertido não é aplicado e avisa', () => {
    const onChange = vi.fn();
    render(<CampoPeriodo valor={{}} onChange={onChange} anos={[2026]} />);
    fireEvent.change(screen.getByLabelText('Recortar período por'), { target: { value: 'intervalo' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-03-10' } });
    expect(onChange).toHaveBeenLastCalledWith({ data_de: '2026-03-10' });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-03-01' } });
    expect(onChange).toHaveBeenCalledTimes(2); // trocar o modo limpa (1), "de" (2); o "até" invertido não
    expect(screen.getByText('A data final é anterior à inicial.')).toBeTruthy();
  });

  it('descreve o período na ficha', () => {
    expect(descreverPeriodo({ data_de: '2026-01-01', data_ate: '2026-12-31' })).toBe('2026');
    expect(descreverPeriodo({ data_de: '2026-09-01', data_ate: '2026-09-30' })).toBe('09/2026');
    expect(descreverPeriodo({ data_de: '2026-02-01', data_ate: '2026-03-15' })).toBe('01/02/2026 a 15/03/2026');
    expect(descreverPeriodo({ data_ate: '2026-03-15' })).toBe('até 15/03/2026');
  });

  it('anos com atendimento, do mais recente ao mais antigo', () => {
    expect(anosDoPeriodo({ primeiro: '2022-07-16', ultimo: '2024-08-24' })).toEqual([2024, 2023, 2022]);
  });
});
