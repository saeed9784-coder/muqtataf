'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { t } from '@/lib/strings';
import { BookmarkIcon, ClockIcon, FeedIcon, FlameIcon, HashIcon, LayersIcon, SearchIcon } from './icons';
import { SourceAvatar } from './SourceAvatar';

const NAV = [
  { href: '/', label: t.nav.popular, Icon: FlameIcon },
  { href: '/latest/', label: t.nav.latest, Icon: ClockIcon },
  { href: '/my-feed/', label: t.nav.myFeed, Icon: FeedIcon },
  { href: '/bookmarks/', label: t.nav.bookmarks, Icon: BookmarkIcon },
  { href: '/sources/', label: t.nav.sources, Icon: LayersIcon },
  { href: '/tags/', label: t.nav.tags, Icon: HashIcon },
] as const;

function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (query) router.push(`/search/?q=${encodeURIComponent(query)}`);
  };
  return (
    <form role="search" onSubmit={onSubmit} className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.search.placeholder}
        aria-label={t.search.placeholder}
        className="w-full rounded-xl border border-border bg-surface py-2 ps-10 pe-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
    </form>
  );
}

function UserButton() {
  const { user, isReady, signIn, signOut } = useAuth();
  if (!isReady) return <span className="size-9" aria-hidden="true" />;
  if (!user) {
    return (
      <button type="button" onClick={() => void signIn()} className="shrink-0 rounded-xl bg-text px-4 py-2 text-sm font-bold text-bg hover:opacity-90">
        {t.auth.signIn}
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <SourceAvatar name={user.name} image={user.image} size="md" />
      <button type="button" onClick={() => void signOut()} className="hidden text-sm text-muted hover:text-text sm:block">
        {t.auth.signOut}
      </button>
    </div>
  );
}

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-bg/90 px-4 backdrop-blur">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">م</span>
          <span className="hidden sm:inline">{BRAND.name}</span>
        </Link>
        <div className="flex flex-1 justify-center">
          <SearchBox />
        </div>
        <UserButton />
      </header>

      <div className="flex">
        <nav aria-label="القائمة الرئيسية" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 flex-col gap-1 border-e border-border p-3 md:flex">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface hover:text-text aria-[current=page]:bg-surface aria-[current=page]:text-text"
            >
              <Icon />
              {label}
            </Link>
          ))}
          <p className="mt-auto px-3 text-xs text-muted">{BRAND.tagline}</p>
        </nav>

        <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav aria-label="التنقل" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-bg/95 backdrop-blur md:hidden">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? 'page' : undefined}
            className="flex flex-col items-center gap-1 py-2 text-[11px] text-muted aria-[current=page]:text-text"
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
