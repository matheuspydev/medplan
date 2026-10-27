/**
 * Marca do MedPlan: um ponto sobre uma faixa — a estimativa dentro do intervalo de confiança,
 * o mesmo desenho do gráfico de intervalo. Cores do tema (acento teal).
 * Decorativa (aria-hidden); o nome "MedPlan" vem em texto ao lado.
 */
export function Logo({ tamanho = 28, className }: { tamanho?: number; className?: string }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="8" fill="var(--color-action)" />
      <path d="M7 14h14" stroke="var(--color-on-action)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <rect x="9.5" y="11.5" width="10" height="5" rx="2.5" fill="var(--color-on-action)" opacity="0.45" />
      <circle cx="15.5" cy="14" r="3" fill="var(--color-on-action)" />
    </svg>
  );
}
