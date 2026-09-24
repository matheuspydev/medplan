/**
 * Marca do MedPlan: ícone quadrado arredondado em azul, com três intervalos estilizados.
 * Decorativa (aria-hidden); o nome "MedPlan" vem em texto ao lado.
 */
import { useId } from 'react';

export function Logo({ tamanho = 24, className }: { tamanho?: number; className?: string }) {
  const id = useId();
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3D9BFF" />
          <stop offset="1" stopColor="#0062E0" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill={`url(#${id})`} />
      <g stroke="#fff" strokeLinecap="round" strokeWidth="1.8">
        <path d="M6.5 8h7" opacity="0.95" />
        <path d="M8.5 12h9" opacity="0.8" />
        <path d="M5.5 16h8" opacity="0.65" />
      </g>
      <g fill="#fff">
        <circle cx="10.5" cy="8" r="1.9" />
        <circle cx="13" cy="12" r="1.9" />
        <circle cx="9.5" cy="16" r="1.9" />
      </g>
    </svg>
  );
}
