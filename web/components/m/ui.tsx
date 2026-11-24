'use client';

/**
 * Building blocks of the phone version (/m), same rules as the app: paper and ink,
 * orange only for the main action and the mic, targets ≥ 56-64px, text ≥ 16px.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  ChevronLeft,
  CircleUser,
  FileText,
  Hammer,
  Mic,
  Square,
  Tags,
} from 'lucide-react';

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

const BACK_PILL =
  'flex min-h-[48px] min-w-0 max-w-[180px] items-center gap-0.5 rounded-full bg-white py-2 pl-2 pr-4 text-lg font-semibold text-mv-ink shadow-[0_2px_10px_rgba(15,23,42,0.08)] active:opacity-60';

/**
 * Header like the app's: paper background, centered title, a white "‹ Lavori" pill on
 * the left (or the brand mark on the home screen).
 */
export function PageTitle({
  children,
  back,
  onBack,
  backLabel = 'Indietro',
  brand = false,
}: {
  children: ReactNode;
  back?: string;
  /** Back inside the same page (e.g. from a list item to the list). */
  onBack?: () => void;
  backLabel?: string;
  brand?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 grid min-h-[64px] grid-cols-[1fr_auto_1fr] items-center gap-2 bg-mv-paper px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex min-w-0 justify-start">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={`Indietro: ${backLabel}`}
            className={BACK_PILL}
          >
            <ChevronLeft className="h-7 w-7 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{backLabel}</span>
          </button>
        ) : back ? (
          <Link href={back} aria-label={`Indietro: ${backLabel}`} className={BACK_PILL}>
            <ChevronLeft className="h-7 w-7 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{backLabel}</span>
          </Link>
        ) : brand ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="Mastrovoce" className="h-8 w-8 rounded-[8px]" />
          </span>
        ) : null}
      </div>
      <h1 className="max-w-[55vw] truncate text-center text-xl font-bold">{children}</h1>
      <div />
    </header>
  );
}

/** Orange text action, like the app's "Tutti i clienti" or "Nuovo lavoro". */
export function TextAction({
  href,
  onClick,
  children,
  className = '',
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const style = `inline-flex min-h-[48px] items-center gap-1.5 text-lg font-semibold text-primary underline underline-offset-4 ${className}`;
  return href ? (
    <Link href={href} className={style}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={style}>
      {children}
    </button>
  );
}

/** White card with thin dividers, like the app's lists. */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-mv-line overflow-hidden rounded-[20px] border border-mv-line bg-mv-sheet">
      {children}
    </ul>
  );
}

/** Section title with an optional action on the right. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3">
      <h2 className="text-[22px] font-bold leading-7">{title}</h2>
      {action}
    </div>
  );
}

/** Choice chip: selected is ink with a check, the others outlined. */
export function Chip({
  selected,
  onClick,
  children,
  rounded = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  rounded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-[56px] min-w-[64px] shrink-0 items-center justify-center gap-1.5 border-2 px-4 text-[17px] font-bold ${
        rounded ? 'rounded-full' : 'rounded-xl'
      } ${
        selected
          ? 'border-mv-ink bg-mv-ink text-white'
          : 'border-mv-input bg-mv-sheet text-mv-ink active:bg-mv-soft'
      }`}
    >
      {selected ? <span aria-hidden>✓</span> : null}
      {children}
    </button>
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
  'block w-full min-h-[56px] rounded-xl border-2 border-mv-input bg-mv-sheet px-4 text-lg text-mv-ink placeholder:text-mv-placeholder focus:border-primary focus:outline-none';

/** The big microphone. Recording changes shape and shows the time, not only the color. */
export function MicButton({
  state,
  seconds,
  onPress,
  size = 'big',
  level = 0,
}: {
  state: 'idle' | 'recording' | 'processing';
  seconds: number;
  onPress: () => void;
  size?: 'big' | 'small';
  /** Microphone input 0-1 while recording: shows the phone is hearing. */
  level?: number;
}) {
  const recording = state === 'recording';
  const busy = state === 'processing';
  const dim = size === 'big' ? 'h-[220px] w-[220px]' : 'h-[84px] w-[84px]';
  const icon = size === 'big' ? 'h-24 w-24' : 'h-10 w-10';
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
        className={`${dim} flex items-center justify-center text-white shadow-[0_4px_8px_rgba(15,23,42,0.18)] transition-all ${
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
      {recording ? (
        <div
          className={`${size === 'big' ? 'h-3 w-48' : 'h-2 w-20'} overflow-hidden rounded-full bg-mv-line`}
          role="meter"
          aria-label="Livello del microfono"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level * 100)}
        >
          <div
            className="h-full rounded-full bg-danger transition-[width] duration-100"
            style={{ width: `${Math.max(4, Math.round(level * 100))}%` }}
          />
        </div>
      ) : null}
      {size === 'big' ? (
        <p
          className={`text-xl font-semibold ${recording ? 'text-danger' : 'text-mv-ink'}`}
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
  { href: '/m/listini', label: 'Listini', Icon: Tags },
  { href: '/m/profilo', label: 'Profilo', Icon: CircleUser },
];

/** Same bar as the app: four tabs, the active one orange with a small bar on top. */
export function TabBar() {
  const pathname = usePathname();
  // Like the app, a job and its quote use the whole screen: no tab bar there.
  if (pathname.startsWith('/m/lavoro')) return null;
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-mv-line bg-mv-paper pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === '/m'
            ? pathname === '/m' || pathname.startsWith('/m/clienti')
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 pt-1 text-base ${
              active ? 'font-bold text-primary' : 'font-semibold text-mv-muted'
            }`}
          >
            {active ? (
              <span className="absolute top-0 h-[3px] w-8 rounded-full bg-primary" />
            ) : null}
            <Icon className="h-[26px] w-[26px]" strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

type PillKind = 'accepted' | 'waiting' | 'toSend' | 'refused' | 'locked';
const PILL: Record<PillKind, string> = {
  accepted: 'bg-green-100 text-green-800',
  waiting: 'bg-amber-100 text-amber-800',
  toSend: 'bg-mv-soft text-mv-ink',
  refused: 'bg-red-50 text-danger',
  locked: 'bg-mv-soft text-mv-ink',
};

/** State in words with an icon, like the app's pills. */
export function StatusPill({
  kind,
  children,
  icon,
}: {
  kind: PillKind;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex min-h-[36px] items-center gap-1.5 self-start rounded-full px-3 text-base font-bold ${PILL[kind]}`}
    >
      {icon}
      {children}
    </span>
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
