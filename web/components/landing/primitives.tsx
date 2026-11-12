import Image from 'next/image';
import Link from 'next/link';
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { MediaSlot } from './media';

/** "Esempio" band: on every reconstructed screen or document. */
export function EsempioTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-sm border border-white bg-mv-ink px-2 py-0.5 text-base font-semibold leading-6 text-white ${className}`}
    >
      Esempio
    </span>
  );
}

function ratioStyle(slot: Pick<MediaSlot, 'ratio' | 'mobileRatio'>): CSSProperties {
  return {
    ['--mv-r' as string]: slot.ratio,
    ['--mv-rm' as string]: slot.mobileRatio ?? slot.ratio,
  };
}
const RATIO_CLASS = 'aspect-[var(--mv-rm)] sm:aspect-[var(--mv-r)]';

/**
 * Photo slot. Without `slot.src` it is a dashed frame with the caption of the photo
 * that will arrive (and optional decorative children drawn inside); with `src` it
 * shows the real photo in the same reserved ratio.
 */
export function PhotoSlot({
  slot,
  sizes = '(min-width: 1024px) 560px, 100vw',
  children,
  dark = false,
  className = '',
}: {
  slot: MediaSlot;
  sizes?: string;
  children?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  if (slot.src) {
    return (
      <figure className={className}>
        <div
          className={`relative w-full overflow-hidden rounded-md ${RATIO_CLASS}`}
          style={ratioStyle(slot)}
        >
          <Image
            src={slot.src}
            alt={slot.alt}
            fill
            sizes={sizes}
            className="object-cover"
          />
        </div>
      </figure>
    );
  }
  return (
    <figure className={className}>
      <div
        className={`relative w-full overflow-hidden rounded-md border-2 border-dashed ${
          dark ? 'border-stone-500 bg-white/[0.03]' : 'border-mv-line bg-mv-soft'
        } ${RATIO_CLASS}`}
        style={ratioStyle(slot)}
      >
        {children}
        <CameraIcon
          className={`absolute right-3 top-3 h-7 w-7 ${dark ? 'text-stone-400' : 'text-mv-muted'}`}
        />
      </div>
      {slot.caption ? (
        <figcaption
          className={`mt-3 text-base ${dark ? 'text-stone-300' : 'text-mv-muted'}`}
        >
          {slot.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Screenshot / document slot. Without `slot.src` it renders the reconstructed example
 * (children, which carry their own "Esempio" band); with `src` it shows the real file.
 */
export function ScreenSlot({
  slot,
  sizes = '(min-width: 1024px) 360px, 90vw',
  children,
  className = '',
}: {
  slot: MediaSlot;
  sizes?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!slot.src) return <div className={className}>{children}</div>;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border border-mv-line bg-mv-sheet ${RATIO_CLASS} ${className}`}
      style={ratioStyle(slot)}
    >
      <Image
        src={slot.src}
        alt={slot.alt}
        fill
        sizes={sizes}
        className="object-contain"
      />
    </div>
  );
}

/** Simple phone frame around a reconstructed app screen. */
export function Phone({
  children,
  label = "Schermata d'esempio dell'app",
  className = '',
  light = false,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  /** The client's phone: light case instead of the dark one. */
  light?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto w-full max-w-[300px] rounded-[2rem] border-[10px] ${
        light ? 'border-stone-200' : 'border-mv-ink'
      } bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_8px_24px_rgba(15,23,42,0.08)] ${className}`}
    >
      <div
        aria-hidden="true"
        className={`mx-auto mt-2 h-1.5 w-16 rounded-full ${light ? 'bg-stone-300' : 'bg-stone-300'}`}
      />
      <span className="sr-only">{label}</span>
      <EsempioTag className="absolute -top-3 right-3 z-10" />
      <div className="px-4 pb-6 pt-4 text-mv-ink">{children}</div>
    </div>
  );
}

type CtaVariant = 'primary' | 'secondary' | 'text';
const CTA_CLASSES: Record<CtaVariant, string> = {
  primary:
    'inline-flex min-h-[56px] items-center justify-center rounded-md bg-primary px-6 text-lg font-semibold text-white hover:bg-primary-dark active:bg-primary-dark',
  secondary:
    'inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-mv-ink px-4 text-base font-semibold text-mv-ink hover:bg-mv-soft',
  text: 'inline-flex min-h-[48px] items-center text-base font-semibold text-mv-ink underline decoration-primary decoration-2 underline-offset-4 hover:text-primary-dark',
};

export function CtaLink({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: CtaVariant;
  className?: string;
}) {
  const cls = `${CTA_CLASSES[variant]} ${className}`;
  if (href.startsWith('#') || href.startsWith('mailto:')) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Separator drawn like the ticks of a folding rule (from the Mastrovoce symbol). */
export function TickRule({ className = '' }: { className?: string }) {
  const id = `mv-ticks-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`block h-3 w-full text-mv-line ${className}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width="40" height="12" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="1.5" height="12" fill="currentColor" />
          <rect x="10" y="0" width="1" height="5" fill="currentColor" />
          <rect x="20" y="0" width="1" height="8" fill="currentColor" />
          <rect x="30" y="0" width="1" height="5" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100%" height="1.5" fill="currentColor" />
      <rect x="0" y="0" width="100%" height="12" fill={`url(#${id})`} />
    </svg>
  );
}

/** Mastrovoce symbol (brand/mastrovoce-simbolo.svg), decorative: the name is written next to it. */
export function BrandSymbol({ className = '' }: { className?: string }) {
  const leg =
    'M232 218H298Q309 218 312 229L460 777Q463 795 450 795H372Q366 795 364 789L307 553L266 781Q263 795 250 795H136Q120 795 123 778L143 671H200Q206 671 206 665V652Q206 646 200 646H147L163 560H224Q230 560 230 554V541Q230 535 224 535H167L184 449H245Q251 449 251 443V430Q251 424 245 424H188L222 227Q224 218 232 218Z';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="100 200 824 615"
      className={className}
    >
      <g fill="currentColor">
        <path d={leg} />
        <path transform="translate(1024 0) scale(-1 1)" d={leg} />
        <path d="M356 257H394Q400 257 403 262L512 455L621 262Q624 257 630 257H668Q676 257 674 264L623 456L521 643Q512 655 503 643L401 456L350 264Q348 257 356 257Z" />
      </g>
    </svg>
  );
}

export function MicIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <path d="M12 18v4" />
      </g>
    </svg>
  );
}

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </g>
    </svg>
  );
}

function CameraIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13.5" r="3.5" />
      </g>
    </svg>
  );
}
