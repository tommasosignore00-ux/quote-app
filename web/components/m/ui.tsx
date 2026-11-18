'use client';

/**
 * Building blocks of the phone version (/m), same rules as the app: paper and ink,
 * orange only for the main action and the mic, targets ≥ 56-64px, text ≥ 16px.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { FileText, Hammer, Mic, Square, User } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white active:bg-primary-dark',
  secondary: 'border-2 border-mv-ink bg-mv-sheet text-mv-ink active:bg-mv-soft',
  danger: 'border-2 border-danger bg-mv-sheet text-danger active:bg-red-50',
};

export function Button({
  variant = 'primary',
  big = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`${big ? 'min-h-[64px] text-xl' : 'min-h-[56px] text-lg'} inline-flex items-center justify-center gap-2 rounded-xl px-5 font-bold transition disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function PageTitle({ children, back }: { children: ReactNode; back?: string }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[60px] items-center gap-2 border-b border-mv-line bg-mv-paper px-2">
      {back ? (
        <Link
          href={back}
          aria-label="Indietro"
          className="flex h-12 w-12 items-center justify-center rounded-full text-3xl text-mv-ink"
        >
          ‹
        </Link>
      ) : (
        <span className="w-3" />
      )}
      <h1 className="truncate text-xl font-bold">{children}</h1>
    </header>
  );
}

/** Bottom sheet: covers the lower part of the screen, closes with the backdrop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-mv-paper px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-mv-line" />
        <h2 className="mb-4 text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-base font-semibold">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'block w-full min-h-[56px] rounded-xl border-2 border-mv-line bg-mv-sheet px-4 text-lg text-mv-ink focus:border-primary focus:outline-none';

/** The big microphone. Recording changes shape and shows the time, not only the color. */
export function MicButton({
  state,
  seconds,
  onPress,
  size = 'big',
}: {
  state: 'idle' | 'recording' | 'processing';
  seconds: number;
  onPress: () => void;
  size?: 'big' | 'small';
}) {
  const recording = state === 'recording';
  const busy = state === 'processing';
  const dim = size === 'big' ? 'h-[200px] w-[200px]' : 'h-[84px] w-[84px]';
  const icon = size === 'big' ? 'h-20 w-20' : 'h-9 w-9';
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const label = busy
    ? 'Sto capendo…'
    : recording
      ? `● Registro ${time} · tocca per finire`
      : "Tocca e di' cosa aggiungere";
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onPress}
        disabled={busy}
        aria-label={busy ? 'Sto capendo' : recording ? 'Ferma la registrazione' : 'Parla'}
        className={`${dim} flex items-center justify-center text-white shadow-lg transition-all ${
          recording
            ? 'rounded-[28%] bg-danger ring-8 ring-red-200 motion-safe:animate-pulse'
            : 'rounded-full bg-primary active:bg-primary-dark'
        } disabled:opacity-70`}
      >
        {busy ? (
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
        ) : recording ? (
          <Square className={icon} fill="currentColor" />
        ) : (
          <Mic className={icon} />
        )}
      </button>
      {size === 'big' ? (
        <p
          className={`text-xl font-bold ${recording ? 'text-danger' : 'text-mv-ink'}`}
          aria-live="polite"
        >
          {label}
        </p>
      ) : recording || busy ? (
        <p
          className="rounded-full bg-mv-ink px-3 py-1 text-base font-semibold text-white"
          aria-live="polite"
        >
          {busy ? 'Sto capendo…' : `Registro ${time}`}
        </p>
      ) : null}
    </div>
  );
}

const TABS = [
  { href: '/m', label: 'Lavori', Icon: Hammer },
  { href: '/m/preventivi', label: 'Preventivi', Icon: FileText },
  { href: '/m/profilo', label: 'Profilo', Icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-mv-line bg-mv-paper pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === '/m'
            ? pathname === '/m' || pathname.startsWith('/m/lavoro')
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-base font-semibold ${
              active ? 'text-primary' : 'text-mv-muted'
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border-2 p-4 text-lg ${
        tone === 'error'
          ? 'border-danger bg-red-50 text-danger'
          : 'border-mv-line bg-mv-sheet text-mv-ink'
      }`}
    >
      {children}
    </div>
  );
}
