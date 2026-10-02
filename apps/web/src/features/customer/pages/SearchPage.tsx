import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { MobileShell } from '../CustomerTabsLayout';
import { ServiceArt } from '../../../components/ServiceArt';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { durationRange } from '../../../lib/format';
import { searchSavedServices } from '../../../lib/offlineCache';

const SUGGESTIONS = ['AC', 'Plumber', 'Electrician', 'Carpenter', 'Washing machine', 'Cleaning'];

/** Public service search (no login needed). */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [text, setText] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(text.trim());

  // Debounce typing so slow networks aren't flooded with requests.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setParams(text.trim() ? { q: text.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const qc = useQueryClient();
  const results = useQuery({
    queryKey: ['services', 'search', q],
    // No internet: search the catalogue saved on this device instead.
    queryFn: () => (navigator.onLine ? catalogApi.services({ q, limit: 30 }).catch(() => searchSavedServices(qc, q)) : searchSavedServices(qc, q)),
    networkMode: 'always',
    retry: false,
    enabled: q.length > 0,
    placeholderData: (prev) => prev,
  });

  return (
    <MobileShell>
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-white px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3">
        <button onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))} aria-label="Go back" className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
          <ChevronLeft className="size-6" />
        </button>
        <div className="flex h-12 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3">
          <Search className="size-5 text-slate-500" aria-hidden />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What service do you need?"
            aria-label="What service do you need?"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          {text && (
            <button onClick={() => setText('')} aria-label="Clear search" className="rounded-full p-1 text-slate-500">
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      <main className="px-4 pb-10">
        {!q && (
          <>
            <p className="mt-2 text-sm font-semibold text-slate-700">Popular searches</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setText(s)} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-fixora-blue hover:text-fixora-blue">
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
        {q && results.isPending && (
          <div className="mt-2 flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        )}
        {q && results.isError && !results.data && <ErrorState error={results.error} onRetry={() => void results.refetch()} />}
        {q && results.isSuccess && results.data.length === 0 && (
          <EmptyState
            art={<Search className="size-10 text-slate-300" />}
            title={`No services found for “${q}”`}
            body="Try a simpler word like “AC”, “plumber” or “cleaning”."
            action={
              <Link to="/book" className="font-semibold text-fixora-blue">
                Browse all services
              </Link>
            }
          />
        )}
        <ul className="flex flex-col gap-3">
          {q &&
            results.data?.map((s) => (
              <li key={s.id}>
                <Link to={`/book/s/${s.slug}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 shadow-card">
                  <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt={s.name} className="size-16 shrink-0 rounded-xl" artClassName="w-3/5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="truncate text-xs text-slate-500">{s.category.name}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      From <span className="font-semibold text-fixora-blue">{formatINR(s.basePrice)}</span> · {durationRange(s.durationMinMinutes, s.durationMaxMinutes)}
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
      </main>
    </MobileShell>
  );
}
