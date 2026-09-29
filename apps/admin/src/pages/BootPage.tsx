import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@fixora/web-core';
import { api } from '../services/api';

interface Health {
  status: string;
  db: string;
  dbLatencyMs: number;
}

/** Phase 1 foundation check — replaced by the real Admin panel screens in the next phases. */
export function BootPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => unwrap<Health>(api.get('/health')),
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fixora-navy p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <p className="font-display text-4xl font-extrabold tracking-tight">
          FIX<span className="text-fixora-cyan">ORA</span>
        </p>
        <p className="mt-1 text-xs font-semibold tracking-[0.3em] text-white/60">GET IT FIXED.</p>
        <p className="mt-8 text-sm text-white/80">Admin panel</p>
        <p role="status" className="mt-3 rounded-card bg-white/10 px-4 py-3 text-sm">
          {health.isPending && 'Connecting to FIXORA API…'}
          {health.isError && <span className="text-red-300">{health.error.message}</span>}
          {health.isSuccess && (
            <span className="text-emerald-300">
              API {health.data.status} · database {health.data.db} ({health.data.dbLatencyMs} ms)
            </span>
          )}
        </p>
        <p className="mt-10 text-[11px] text-white/40">by Nirmaan Digital</p>
      </div>
    </main>
  );
}
