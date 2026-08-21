import { cn } from '@/lib/utils'
import type * as React from 'react'

/* ------------------------------------------------------------------ button */

const btnBase =
  'label inline-flex items-center justify-center gap-2 border border-foreground px-4 h-10 transition-all duration-100 select-none disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const btnVariants = {
  solid:
    'bg-foreground text-background shadow-[3px_3px_0_0_var(--hairline)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]',
  accent:
    'bg-accent text-accent-foreground border-accent shadow-[3px_3px_0_0_var(--foreground)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]',
  ghost: 'bg-transparent text-foreground hover:bg-foreground hover:text-background',
  quiet: 'border-hairline bg-card text-foreground hover:border-foreground',
} as const

export function Btn({
  className,
  variant = 'solid',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof btnVariants
  size?: 'sm' | 'md'
}) {
  return (
    <button
      {...props}
      className={cn(btnBase, btnVariants[variant], size === 'sm' && 'h-8 px-3 text-[10px]', className)}
    />
  )
}

/* ------------------------------------------------------------------- panel */

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode
  aside?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('border border-foreground bg-card', className)}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b border-foreground bg-foreground px-3 py-2 text-background">
          <h2 className="label">{title}</h2>
          <div className="label opacity-70">{aside}</div>
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/* -------------------------------------------------------------------- misc */

export function Tag({
  children,
  tone = 'ink',
  className,
}: {
  children: React.ReactNode
  tone?: 'ink' | 'accent' | 'signal' | 'muted'
  className?: string
}) {
  const tones = {
    ink: 'border-foreground text-foreground',
    accent: 'border-accent text-accent',
    signal: 'border-signal text-signal',
    muted: 'border-hairline text-muted-foreground',
  }
  return (
    <span className={cn('label inline-flex items-center border px-1.5 py-0.5 leading-none', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  unit,
  className,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="label text-muted-foreground">{label}</span>
      <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="font-mono text-[11px] leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'h-10 w-full border border-foreground bg-background px-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-0'

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs tabular-nums', className)}>{children}</span>
}

export function Rule({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-hairline" />
      {label && <span className="label text-muted-foreground">{label}</span>}
      <span className="h-px flex-1 bg-hairline" />
    </div>
  )
}

export function short(v: string, head = 6, tail = 4) {
  if (!v) return ''
  return v.length <= head + tail + 2 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`
}

export function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toFixed(d)
}
