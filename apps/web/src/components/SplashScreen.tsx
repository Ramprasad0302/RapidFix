import { Logo } from '@fixora/ui';

/** Brand splash shown while the saved session is restored (usually a fraction of a second). */
export function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white">
      <Logo variant="full" size="lg" />
      <div className="mt-10 h-1 w-24 overflow-hidden rounded-full bg-fixora-blue-soft" aria-label="Loading" role="progressbar">
        <div className="h-full w-1/2 animate-[splash_1s_ease-in-out_infinite] rounded-full bg-fixora-blue" />
      </div>
      <p className="absolute bottom-8 text-xs text-slate-400">by <a href="https://nirmaandigital.com" target="_blank" rel="noopener" className="hover:text-fixora-blue">Nirmaan Digital</a></p>
    </div>
  );
}
