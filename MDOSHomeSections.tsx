'use client';

/**
 * MDOSHomeSections.tsx
 * ---------------------------------------------------------------------------
 * Home page (/) sections for MDOS — Section 1 (feature grid + toggle reveal),
 * Section 2 (testimonial / image showcase), Section 3 (productivity collage).
 *
 * Theme reference: hand-drawn marker headline face, warm off-white canvas,
 * plum/maroon ink accent, amber highlight marker, teal underline/toggle,
 * soft coral strike-through — matching the supplied Before/After click,
 * Below-Section-1, and Section-3 reference screens.
 *
 * DRY notes
 * ---------------------------------------------------------------------------
 * - CARD_DATA is the single source of truth for both the plain grid (toggle
 *   off) and the "Maps To" annotations (toggle on) — no duplicated content.
 * - <Card />, <Pill />, <Annotation />, <FloatingShot /> are the only
 *   presentational atoms; every section composes from them instead of
 *   redefining markup.
 * - Color/font tokens live in `theme` so nothing is hard-coded twice.
 *
 * Performance notes
 * ---------------------------------------------------------------------------
 * - Headline/annotation face loaded via next/font/google with display:'swap'
 *   and subset trimming — no render-blocking font request, no CLS.
 * - Only the toggle interaction needs client JS; card + annotation lists are
 *   memoized so re-render on toggle only touches the overlay, not the grid.
 * - Icons are imported individually (named imports) so bundlers tree-shake
 *   unused lucide glyphs instead of pulling the whole icon set.
 * - The Section 2 visual is a next/image with a fixed aspect-ratio box
 *   (no layout shift) and lazy loading (it's below the fold).
 * - Decorative arrows/underlines are inline SVG (no extra image requests,
 *   fully themeable via currentColor / CSS vars).
 */

import Image from 'next/image';
import { Kalam, Inter } from 'next/font/google';
import { useMemo, useState, memo } from 'react';
import {
  ReceiptText,
  CreditCard,
  Warehouse,
  Banknote,
  DatabaseBackup,
  BookOpenText,
  Store,
  FileInput,
  ShieldAlert,
  FileCheck2,
  Percent,
  ScrollText,
  FileSpreadsheet,
  HandCoins,
  ContactRound,
  Package,
  ClockAlert,
  Landmark,
  Receipt,
  ArrowRight,
  Play,
  Bell,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

/* ---------------------------------------------------------------------- *
 * Fonts
 * ---------------------------------------------------------------------- */

const headline = Kalam({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-headline',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

/* ---------------------------------------------------------------------- *
 * Theme tokens
 * ---------------------------------------------------------------------- */

const theme = {
  canvas: '#F3F3F5',
  canvasSoft: '#F7F7F8',
  ink: '#161821',
  inkSoft: '#5B5F6B',
  plum: '#6B2A4C',
  plumDark: '#4E1E38',
  amber: '#F5B942',
  teal: '#0F9E96',
  coral: '#F2A0A0',
  mint: '#D9F5EC',
  border: '#E7E7EA',
} as const;

/* ---------------------------------------------------------------------- *
 * Card data — single source of truth for grid + annotations
 * ---------------------------------------------------------------------- */

type CardDatum = {
  id: string;
  title: string;
  mapsTo: string;
  Icon: LucideIcon | typeof SiWhatsapp;
  tint: string; // icon tile background
  ink: string; // icon color
};

const CARD_DATA: CardDatum[] = [
  { id: 'sales', title: 'Sales', mapsTo: 'Invoices', Icon: ReceiptText, tint: '#FDECEC', ink: '#C2483F' },
  { id: 'credit', title: 'Credit', mapsTo: 'Credit Control', Icon: CreditCard, tint: '#EAF1FD', ink: '#3B6FD1' },
  { id: 'warehouse', title: 'Warehouse', mapsTo: 'Inventory Tracking', Icon: Warehouse, tint: '#FDF3E7', ink: '#C98A2E' },
  { id: 'cash', title: 'Cash', mapsTo: 'Deposits', Icon: Banknote, tint: '#E9F8EF', ink: '#2E9A5C' },
  { id: 'reliability', title: 'Reliability', mapsTo: 'Backup', Icon: DatabaseBackup, tint: '#EFEAFB', ink: '#6B4FBE' },
  { id: 'accounts', title: 'Accounts', mapsTo: 'Ledger', Icon: BookOpenText, tint: '#FDECEC', ink: '#C2483F' },
  { id: 'outlets', title: 'Outlets', mapsTo: 'Codes', Icon: Store, tint: '#E9F8EF', ink: '#2E9A5C' },
  { id: 'exports', title: 'Exports', mapsTo: 'Friendly Formats', Icon: FileInput, tint: '#EAF1FD', ink: '#3B6FD1' },
  { id: 'loopholes', title: 'Loopholes', mapsTo: 'Alerts', Icon: ShieldAlert, tint: '#FDF3E7', ink: '#C98A2E' },
  { id: 'fbr', title: 'FBR', mapsTo: 'Compliant Reports', Icon: FileCheck2, tint: '#EFEAFB', ink: '#6B4FBE' },
  { id: 'discount', title: 'Discount', mapsTo: 'Finance Reports', Icon: Percent, tint: '#FDECEC', ink: '#C2483F' },
  { id: 'stock', title: 'Stock', mapsTo: 'Running Ledger', Icon: ScrollText, tint: '#E9F8EF', ink: '#2E9A5C' },
  { id: 'confirmations', title: 'Confirmations', mapsTo: 'WhatsApp SMS', Icon: SiWhatsapp, tint: '#E7F7EE', ink: '#25A85A' },
  { id: 'statements', title: 'Statements', mapsTo: 'Shop Statements', Icon: FileSpreadsheet, tint: '#EAF1FD', ink: '#3B6FD1' },
  { id: 'payroll', title: 'Payroll', mapsTo: 'Payroll SOPs', Icon: HandCoins, tint: '#FDF3E7', ink: '#C98A2E' },
  { id: 'employee', title: 'Employee', mapsTo: 'Employee Directory', Icon: ContactRound, tint: '#EFEAFB', ink: '#6B4FBE' },
  { id: 'products', title: 'Products', mapsTo: 'Product Catalogue', Icon: Package, tint: '#FDECEC', ink: '#C2483F' },
  { id: 'overdue', title: 'Overdue', mapsTo: 'Alerts', Icon: ClockAlert, tint: '#E9F8EF', ink: '#2E9A5C' },
  { id: 'transactions', title: 'Transactions', mapsTo: 'Bank Accounts', Icon: Landmark, tint: '#EAF1FD', ink: '#3B6FD1' },
  { id: 'expenses', title: 'Expenses', mapsTo: 'Sheet', Icon: Receipt, tint: '#FDF3E7', ink: '#C98A2E' },
];

/* ---------------------------------------------------------------------- *
 * Small presentational atoms
 * ---------------------------------------------------------------------- */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs sm:text-sm font-medium shadow-sm ring-1"
      style={{ color: theme.ink, ['--tw-ring-color' as string]: theme.border }}
    >
      {children}
    </span>
  );
}

const Card = memo(function Card({ data }: { data: CardDatum }) {
  const { title, Icon, tint, ink } = data;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl shadow-sm ring-1 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
        style={{ backgroundColor: tint, ['--tw-ring-color' as string]: theme.border }}
      >
        <Icon size={26} color={ink} strokeWidth={2} />
      </div>
      <span className="text-[13px] sm:text-sm font-medium" style={{ color: theme.ink }}>
        {title}
      </span>
    </div>
  );
});

/* A small curved connector + hand-written label used in the "toggle on" state. */
function Annotation({
  label,
  side,
}: {
  label: string;
  side: 'top' | 'bottom';
}) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 ${
        side === 'top' ? '-top-9 sm:-top-10' : '-bottom-9 sm:-bottom-10'
      } animate-[fadeIn_.35s_ease-out]`}
    >
      {side === 'bottom' && (
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
          <path d="M9 1v10M9 11l-4-4M9 11l4-4" stroke={theme.plum} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span
        className="whitespace-nowrap text-sm sm:text-base leading-none"
        style={{ color: theme.plum, fontFamily: 'var(--font-headline)' }}
      >
        {label}
      </span>
      {side === 'top' && (
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
          <path d="M9 13V3M9 3l-4 4M9 3l4 4" stroke={theme.plum} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Section 1 — Feature grid with toggle-revealed "maps to" annotations
 * ---------------------------------------------------------------------- */

function Section1() {
  const [showMapping, setShowMapping] = useState(false);

  // Alternate annotation side by row so labels never collide vertically.
  const rows = useMemo(() => {
    const perRow = 6;
    const chunked: CardDatum[][] = [];
    for (let i = 0; i < CARD_DATA.length; i += perRow) {
      chunked.push(CARD_DATA.slice(i, i + perRow));
    }
    return chunked;
  }, []);

  return (
    <section
      className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-8 sm:pt-20 lg:px-16"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Headline */}
      <div className="mx-auto max-w-4xl text-center">
        <h1
          className="text-3xl leading-tight sm:text-4xl lg:text-5xl"
          style={{ color: theme.ink, fontFamily: 'var(--font-headline)' }}
        >
          All your distribution on{' '}
          <span className="relative whitespace-nowrap">
            <span
              className="absolute inset-x-0 bottom-1 -z-10 h-[0.5em] rounded"
              style={{ backgroundColor: theme.amber, opacity: 0.55 }}
            />
            one system
          </span>
          .
        </h1>
        <p
          className="mt-3 text-xl sm:text-2xl"
          style={{ color: theme.ink, fontFamily: 'var(--font-headline)' }}
        >
          Simple, accurate, and built for{' '}
          <span className="underline decoration-2 underline-offset-4" style={{ textDecorationColor: theme.teal }}>
            distributors
          </span>
          !
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          <button
            type="button"
            className="rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
            style={{ backgroundColor: theme.plum }}
          >
            Request a demo
          </button>
          <button
            type="button"
            className="rounded-lg px-6 py-3 text-sm font-semibold ring-1 transition-colors hover:bg-black/[0.02]"
            style={{ color: theme.ink, ['--tw-ring-color' as string]: theme.border }}
          >
            Talk to us
          </button>
        </div>
      </div>

      {/* Canvas containing event pill + grid */}
      <div
        className="relative mx-auto mt-14 max-w-6xl rounded-[40px] px-4 pb-16 pt-10 sm:px-10 sm:pt-14"
        style={{ backgroundColor: theme.canvas }}
      >
        <div className="flex justify-center">
          <Pill>
            <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: theme.teal }}>
              <Bell size={11} color="#fff" />
            </span>
            MDOS Live Q&amp;A — Multan, Pakistan
            <span className="hidden sm:inline" style={{ color: theme.inkSoft }}>
              Aug 18, 2026
            </span>
            <a href="#" className="font-semibold" style={{ color: theme.plum }}>
              Register →
            </a>
          </Pill>
        </div>

        {/* Grid + annotation overlay */}
        <div className="mt-12 space-y-14 sm:mt-16 sm:space-y-16">
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="grid grid-cols-3 gap-x-4 gap-y-10 sm:grid-cols-4 sm:gap-x-6 md:grid-cols-6 md:gap-x-8"
            >
              {row.map((card) => (
                <div key={card.id} className="relative">
                  {showMapping && (
                    <Annotation label={card.mapsTo} side={rowIdx % 2 === 0 ? 'top' : 'bottom'} />
                  )}
                  <Card data={card} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Toggle + view-all row */}
        <div className="mt-14 flex flex-col items-center justify-between gap-6 sm:flex-row sm:mt-16">
          <button
            type="button"
            onClick={() => setShowMapping((v) => !v)}
            aria-pressed={showMapping}
            className="flex items-center gap-3 text-sm font-medium"
            style={{ color: theme.ink }}
          >
            <span
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ backgroundColor: showMapping ? theme.teal : '#D8D8DC' }}
            >
              <span
                className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                  showMapping ? 'translate-x-6' : 'translate-x-1'
                }`}
                style={{ height: 18, width: 18 }}
              />
            </span>
            See what each feature replaces
          </button>

          <a href="#features" className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: theme.plum }}>
            View all features <ArrowRight size={16} />
          </a>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, 4px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 * Section 2 — "Level up your quality of work" (image instead of video)
 * ---------------------------------------------------------------------- */

function Section2() {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-8 lg:px-16" style={{ backgroundColor: theme.canvasSoft }}>
      {/* Floating testimonial bubble */}
      <div className="mx-auto mb-10 flex max-w-3xl justify-center sm:justify-end sm:pr-6">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-md ring-1" style={{ ['--tw-ring-color' as string]: theme.border }}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: theme.plum }}>
            <MessageCircle size={16} />
          </div>
          <p className="max-w-[220px] text-xs italic sm:text-sm" style={{ color: theme.ink }}>
            &ldquo;If you simplify everything, you can do anything.&rdquo;
            <span className="mt-0.5 block not-italic" style={{ color: theme.inkSoft }}>
              — a distributor, after switching to MDOS
            </span>
          </p>
        </div>
      </div>

      {/* Headline */}
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-3xl leading-tight sm:text-4xl lg:text-5xl"
          style={{ color: theme.ink, fontFamily: 'var(--font-headline)' }}
        >
          <span className="relative whitespace-nowrap">
            <span className="absolute inset-x-0 top-1/2 h-[2px]" style={{ backgroundColor: theme.coral }} />
            Level up
          </span>{' '}
          your quality of{' '}
          <span className="underline decoration-2 underline-offset-4" style={{ textDecorationColor: theme.teal }}>
            work
          </span>
        </h2>
      </div>

      {/* Image showcase (replaces video) */}
      <div className="relative mx-auto mt-10 max-w-4xl">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-3xl shadow-xl ring-1"
          style={{ backgroundColor: theme.canvas, ['--tw-ring-color' as string]: theme.border }}
        >
          <Image
            src="/images/mdos-dashboard-preview.png"
            alt="MDOS dashboard preview showing sales, credit, and delivery tracking"
            fill
            sizes="(max-width: 768px) 100vw, 896px"
            loading="lazy"
            className="object-cover"
          />

          {/* Decorative chat bubble, matches reference composition */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
            <span
              className="rounded-lg px-4 py-2 text-sm font-medium shadow-md"
              style={{ backgroundColor: theme.mint, color: '#146B4F' }}
            >
              The possibilities are limitless!
            </span>
            <span className="h-9 w-9 shrink-0 rounded-full bg-white shadow-md ring-2 ring-white" />
          </div>
        </div>

        {/* Decorative progress bar under the image, matching reference */}
        <div className="mt-4 flex items-center gap-4 px-2">
          <button
            type="button"
            aria-label="Play preview"
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: theme.plum }}
          >
            <Play size={16} fill={theme.plum} />
          </button>
          <div className="relative h-1 flex-1 rounded-full" style={{ backgroundColor: theme.border }}>
            <div className="absolute inset-y-0 left-0 w-1/2 rounded-full" style={{ backgroundColor: theme.plum }} />
            <span
              className="absolute -top-1.5 h-4 w-4 rounded-full border-2 border-white shadow"
              style={{ left: '50%', backgroundColor: theme.plum }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 * Section 3 — "Optimized for productivity" floating-widget collage
 *
 * Uses the four real product screenshots supplied by the user, placed at
 * the same relative positions/overlaps as the reference composition:
 *   - activity list        (portrait,  top-left,     frontmost)
 *   - kanban+floorplan board (landscape, center,      base layer)
 *   - command palette (gif) (landscape, bottom-left,  frontmost)
 *   - Ask AI panel          (portrait,  top-right,    frontmost)
 *
 * Positions are expressed as % of a fixed-aspect bounding box (derived
 * from the reference image's own coordinates: a 950x585 box spanning the
 * four cards' combined extent), so the whole collage scales losslessly
 * instead of relying on fixed pixel offsets.
 * ---------------------------------------------------------------------- */

type FloatAsset = {
  id: string;
  src: string;
  alt: string;
  // Percent-based placement within the bounding box, matching the
  // reference composition's relative coordinates.
  left: string;
  top: string;
  width: string;
  height: string;
  z: number;
  // GIFs must skip Next's image optimizer — the optimizer re-encodes to a
  // static frame by default, which would silently kill the animation.
  unoptimized?: boolean;
};

const SECTION3_ASSETS: FloatAsset[] = [
  {
    id: 'activity',
    src: '/images/section3/activity-list.webp',
    alt: 'Activity overview list showing invoices, deliveries, and credit alerts due today',
    left: '0%',
    top: '0%',
    width: '24%',
    height: '49%',
    z: 20,
  },
  {
    id: 'kanban',
    src: '/images/section3/kanban-board.webp',
    alt: 'Kanban board showing tasks in progress and to review',
    left: '19%',
    top: '15%',
    width: '64%',
    height: '70%',
    z: 10,
  },
  {
    id: 'command-palette',
    src: '/images/section3/command-palette.gif',
    alt: 'Command palette animation showing quick actions like New, Projects, On track, and Search with keyboard shortcuts',
    left: '0%',
    top: '64%',
    width: '49%',
    height: '36%',
    z: 20,
    unoptimized: true,
  },
  {
    id: 'ask-ai',
    src: '/images/section3/ask-ai.webp',
    alt: 'Ask AI panel answering a question about best-selling product and margin',
    left: '67%',
    top: '25%',
    width: '33%',
    height: '75%',
    z: 20,
  },
];

function FloatingShot({ asset, priority = false }: { asset: FloatAsset; priority?: boolean }) {
  return (
    <div
      className="absolute overflow-hidden rounded-2xl shadow-xl ring-1"
      style={{
        left: asset.left,
        top: asset.top,
        width: asset.width,
        height: asset.height,
        zIndex: asset.z,
        ['--tw-ring-color' as string]: theme.border,
      }}
    >
      <Image
        src={asset.src}
        alt={asset.alt}
        fill
        sizes="(max-width: 1024px) 90vw, 640px"
        loading={priority ? undefined : 'lazy'}
        priority={priority}
        unoptimized={asset.unoptimized}
        className="object-cover object-top"
      />
    </div>
  );
}

function Section3() {
  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-8 lg:px-16" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl leading-tight sm:text-4xl lg:text-5xl" style={{ color: theme.ink, fontFamily: 'var(--font-headline)' }}>
          Optimized for productivity
        </h2>
      </div>

      {/* Floating collage — desktop/tablet: absolute, percentage-positioned */}
      <div className="relative mx-auto mt-16 hidden aspect-[950/585] max-w-5xl md:block">
        {SECTION3_ASSETS.map((asset) => (
          <FloatingShot key={asset.id} asset={asset} />
        ))}
      </div>

      {/* Mobile fallback — same four assets, stacked, no absolute math */}
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden">
        {SECTION3_ASSETS.map((asset) => (
          <div
            key={asset.id}
            className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-md ring-1"
            style={{ ['--tw-ring-color' as string]: theme.border }}
          >
            <Image
              src={asset.src}
              alt={asset.alt}
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              loading="lazy"
              unoptimized={asset.unoptimized}
              className="object-cover object-top"
            />
          </div>
        ))}
      </div>

      <p className="mx-auto mt-16 max-w-2xl text-center text-base sm:text-lg" style={{ color: theme.inkSoft }}>
        Experience true speed, reduced data entry, and a fast UI. Every screen in MDOS
        is built to load and respond in a blink — no waiting between the shop floor and the ledger.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 * Export — composed home sections
 * ---------------------------------------------------------------------- */

export default function MDOSHomeSections() {
  return (
    <main className={`${headline.variable} ${body.variable} font-[family-name:var(--font-body)]`}>
      <Section1 />
      <Section2 />
      <Section3 />
    </main>
  );
}

export { Section1, Section2, Section3, CARD_DATA, theme };
