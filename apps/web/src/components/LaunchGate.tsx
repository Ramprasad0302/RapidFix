import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { trustApi } from '../lib/endpoints';
import { holdPopups } from '../lib/popupHold';

/**
 * Launch event mode. When the Super Admin switches it on (Admin → Dashboard → Launch event),
 * every visitor of the website and the apps sees this opening screen instead of the site. The
 * chief guest presses "Open now": a reveal animation plays and RapidFix opens on that device.
 * When it's switched off again, the site opens normally for everyone (checked every few seconds).
 *
 * Always reachable, so launch mode can be switched off and legal pages stay public: admin pages,
 * the login page, terms, privacy and account deletion.
 */
const OPENED_KEY = 'rapidfix.launchOpened';
const EXEMPT = [/^\/admin/, /^\/login/, /^\/delete-account/, /^\/terms/, /^\/privacy/];

function readOpened() {
  try {
    return localStorage.getItem(OPENED_KEY);
  } catch {
    return null;
  }
}

export function LaunchGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const config = useQuery({ queryKey: ['app-config'], queryFn: trustApi.appConfig, staleTime: 10_000, refetchOnWindowFocus: true, refetchInterval: (q) => (q.state.data?.launch?.enabled ? 10_000 : 60_000) });
  const launch = config.data?.launch;
  const [opened, setOpened] = useState(readOpened);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'done'>('idle');
  // The site loads only near the end of the reveal: its own pop-ups (location, notifications) open
  // above everything else, so they mustn't appear over the launch screen.
  const [siteReady, setSiteReady] = useState(false);

  const exempt = EXEMPT.some((r) => r.test(pathname));
  const active = !!launch?.enabled && opened !== launch.id && phase !== 'done' && !exempt;
  // First visit with nothing saved yet: wait briefly for the setting, so the site doesn't flash
  // before the launch screen (never longer than 2.5 s, e.g. offline).
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  const hold = !config.data && config.isFetching && !waited && !exempt;

  // No scrolling the site behind the curtain.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  const open = () => {
    if (phase !== 'idle' || !launch) return;
    setPhase('opening');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // The site mounts behind the fading curtain; its own pop-ups wait until the reveal is over.
    holdPopups(reduce ? 800 : 3800);
    window.setTimeout(() => setSiteReady(true), reduce ? 0 : 1200);
    window.setTimeout(
      () => {
        try {
          localStorage.setItem(OPENED_KEY, launch.id);
        } catch {
          /* private mode — opens for this visit only */
        }
        setOpened(launch.id);
        setPhase('done');
      },
      reduce ? 300 : 2300,
    );
  };

  return (
    <>
      {!hold && (!active || siteReady) && children}
      {active && <LaunchScreen headline={launch!.headline} subline={launch!.subline} opening={phase === 'opening'} onOpen={open} />}
    </>
  );
}

const CONFETTI = ['#00c2ff', '#2563eb', '#ffffff', '#facc15', '#38bdf8', '#a5b4fc'];

function LaunchScreen({ headline, subline, opening, onOpen }: { headline: string; subline: string; opening: boolean; onOpen(): void }) {
  // Fixed positions so the starfield and confetti don't jump between renders.
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: (i * 37.3) % 100, y: (i * 61.7) % 100, d: (i % 7) * 0.45, s: 1 + (i % 3) })), []);
  const confetti = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => {
        const a = (i / 44) * Math.PI * 2;
        const r = 38 + (i % 5) * 9;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, c: CONFETTI[i % CONFETTI.length]!, rot: (i * 47) % 360, d: (i % 6) * 0.03, w: i % 3 === 0 ? 6 : 10 };
      }),
    [],
  );
  const words = headline.split(' ');

  return (
    <div className={`lx-root ${opening ? 'lx-opening' : ''}`} role="dialog" aria-modal="true" aria-label={headline}>
      <style>{CSS}</style>
      <div className="lx-bg" aria-hidden>
        <span className="lx-aurora lx-a1" />
        <span className="lx-aurora lx-a2" />
        <span className="lx-aurora lx-a3" />
        <span className="lx-grid" />
        {stars.map((s, i) => (
          <span key={i} className="lx-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}s` }} />
        ))}
      </div>

      <div className="lx-stage">
        <div className="lx-emblem" aria-hidden>
          <span className="lx-ring lx-ring-1" />
          <span className="lx-ring lx-ring-2" />
          <span className="lx-halo" />
          <img src="/brand/mascot.webp" alt="" className="lx-mascot" />
        </div>

        <div className="lx-wordmark">
          <img src="/brand/wordmark-light.webp" alt="RapidFix — Get It Fixed." />
          <span className="lx-shine" aria-hidden />
        </div>

        <p className="lx-chip">
          <span className="lx-dot" aria-hidden /> Grand Launch
        </p>
        <h1 className="lx-title">
          {words.map((w, i) => (
            <span key={i} className="lx-word" style={{ animationDelay: `${1.5 + i * 0.09}s` }}>
              {w}&nbsp;
            </span>
          ))}
        </h1>
        <p className="lx-sub">{subline}</p>

        <div className="lx-cta">
          <span className="lx-pulse" aria-hidden />
          <span className="lx-pulse lx-pulse-2" aria-hidden />
          <button type="button" className="lx-btn" onClick={onOpen} disabled={opening}>
            <span className="lx-btn-shimmer" aria-hidden />
            <span className="lx-btn-label">{opening ? 'Opening…' : 'Open now'}</span>
            <svg className="lx-btn-arrow" viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {opening && (
        <div className="lx-burst" aria-hidden>
          <span className="lx-flash" />
          {confetti.map((c, i) => (
            <span
              key={i}
              className="lx-confetti"
              style={{ background: c.c, width: c.w, ['--tx' as string]: `${c.x}vmin`, ['--ty' as string]: `${c.y}vmin`, ['--rot' as string]: `${c.rot}deg`, animationDelay: `${c.d}s` }}
            />
          ))}
        </div>
      )}
      <p className="lx-foot">RapidFix · Get It Fixed.</p>
    </div>
  );
}

const CSS = `
.lx-root{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;
  background:radial-gradient(120% 90% at 50% 0%,#1c3a63 0%,#0b1f3a 45%,#050f1f 100%);font-family:var(--font-display,'Plus Jakarta Sans',Inter,system-ui,sans-serif);
  animation:lx-in .9s ease-out both}
.lx-bg{position:absolute;inset:0;pointer-events:none}
.lx-aurora{position:absolute;border-radius:9999px;filter:blur(70px);opacity:.55;mix-blend-mode:screen}
.lx-a1{width:55vmax;height:55vmax;left:-15vmax;top:-20vmax;background:#2563eb;animation:lx-drift1 14s ease-in-out infinite alternate}
.lx-a2{width:45vmax;height:45vmax;right:-15vmax;top:10vmax;background:#00c2ff;opacity:.35;animation:lx-drift2 17s ease-in-out infinite alternate}
.lx-a3{width:40vmax;height:40vmax;left:20vmax;bottom:-25vmax;background:#1d4ed8;opacity:.45;animation:lx-drift1 19s ease-in-out infinite alternate-reverse}
.lx-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:56px 56px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%)}
.lx-star{position:absolute;border-radius:9999px;background:#fff;opacity:.15;animation:lx-twinkle 3.2s ease-in-out infinite}
.lx-stage{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px;max-width:760px;width:100%}
.lx-emblem{position:relative;width:min(44vw,210px);aspect-ratio:1;display:grid;place-items:center;margin-bottom:8px}
.lx-ring{position:absolute;inset:0;border-radius:9999px}
.lx-ring-1{background:conic-gradient(from 0deg,transparent 0 55%,#00c2ff 70%,#fff 75%,transparent 80% 100%);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));
  animation:lx-spin 3.6s linear infinite,lx-fade 1s .2s both}
.lx-ring-2{inset:12%;border:1px solid rgba(0,194,255,.25);animation:lx-spin 9s linear infinite reverse,lx-fade 1s .4s both}
.lx-halo{position:absolute;inset:14%;border-radius:9999px;background:radial-gradient(circle,rgba(37,99,235,.65),rgba(0,194,255,.15) 60%,transparent 70%);filter:blur(10px);animation:lx-breathe 3.4s ease-in-out infinite}
.lx-mascot{position:relative;width:78%;height:78%;object-fit:contain;filter:drop-shadow(0 12px 30px rgba(0,194,255,.35));animation:lx-rise 1.2s .25s cubic-bezier(.2,.8,.2,1) both}
.lx-wordmark{position:relative;width:min(78vw,380px);margin:4px 0 18px;overflow:hidden;animation:lx-reveal 1.1s .85s cubic-bezier(.65,0,.35,1) both}
.lx-wordmark img{display:block;width:100%;height:auto}
.lx-shine{position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);transform:translateX(-120%);animation:lx-shine 2.8s 2s ease-in-out infinite}
.lx-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:9999px;border:1px solid rgba(0,194,255,.35);background:rgba(0,194,255,.08);
  font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#bfefff;animation:lx-up .8s 1.25s both}
.lx-dot{width:8px;height:8px;border-radius:9999px;background:#00c2ff;box-shadow:0 0 0 0 rgba(0,194,255,.7);animation:lx-ping 1.8s infinite}
.lx-title{margin:16px 0 10px;font-size:clamp(30px,6vw,58px);line-height:1.08;font-weight:800;letter-spacing:-.02em}
.lx-word{display:inline-block;background:linear-gradient(180deg,#fff 30%,#bfe7ff);-webkit-background-clip:text;background-clip:text;color:transparent;animation:lx-up .8s cubic-bezier(.2,.8,.2,1) both}
.lx-sub{max-width:560px;margin:0 auto;color:rgba(226,240,255,.78);font-size:clamp(15px,2.2vw,18px);line-height:1.6;font-family:var(--font-sans,Inter,system-ui,sans-serif);animation:lx-up .8s 2s both}
.lx-cta{position:relative;margin-top:34px;display:grid;place-items:center;animation:lx-pop .9s 2.35s cubic-bezier(.2,1.4,.4,1) both}
.lx-pulse{position:absolute;inset:-6px;border-radius:9999px;border:2px solid rgba(0,194,255,.55);animation:lx-halo 2.4s 3s ease-out infinite}
.lx-pulse-2{animation-delay:4.2s}
.lx-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:12px;padding:18px 40px;border:0;border-radius:9999px;cursor:pointer;
  font:700 clamp(18px,2.4vw,22px)/1 var(--font-display,'Plus Jakarta Sans',Inter,sans-serif);color:#fff;letter-spacing:.01em;
  background:linear-gradient(135deg,#00c2ff 0%,#2563eb 55%,#1d4ed8 100%);box-shadow:0 18px 50px -12px rgba(37,99,235,.9),inset 0 1px 0 rgba(255,255,255,.35);
  transition:transform .25s ease,box-shadow .25s ease}
.lx-btn:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 24px 60px -12px rgba(0,194,255,.9),inset 0 1px 0 rgba(255,255,255,.4)}
.lx-btn:active{transform:scale(.97)}
.lx-btn:focus-visible{outline:3px solid #fff;outline-offset:4px}
.lx-btn-shimmer{position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);transform:translateX(-120%);animation:lx-shine 2.6s 3s ease-in-out infinite}
.lx-btn-label,.lx-btn-arrow{position:relative}
.lx-btn-arrow{width:24px;height:24px;transition:transform .25s}
.lx-btn:hover .lx-btn-arrow{transform:translateX(4px)}
.lx-foot{position:absolute;bottom:max(18px,env(safe-area-inset-bottom));left:0;right:0;text-align:center;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.35);animation:lx-fade 1s 2.6s both}
/* Opening */
.lx-burst{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.lx-flash{position:absolute;width:24px;height:24px;border-radius:9999px;background:radial-gradient(circle,#fff,#7dd3fc 40%,#2563eb 70%,transparent 72%);animation:lx-flash 1.6s .35s cubic-bezier(.7,0,.3,1) both}
.lx-confetti{position:absolute;height:10px;border-radius:2px;opacity:0;animation:lx-confetti 1.5s cubic-bezier(.15,.7,.3,1) both}
.lx-opening .lx-stage{animation:lx-zoomout .9s .1s cubic-bezier(.7,0,.3,1) both}
.lx-opening .lx-btn{transform:scale(.94)}
.lx-opening{animation:lx-out .6s 1.75s ease-in both}
@keyframes lx-in{from{opacity:0}to{opacity:1}}
@keyframes lx-out{to{opacity:0;visibility:hidden}}
@keyframes lx-fade{from{opacity:0}to{opacity:1}}
@keyframes lx-drift1{to{transform:translate(8vmax,6vmax) scale(1.15)}}
@keyframes lx-drift2{to{transform:translate(-10vmax,8vmax) scale(.9)}}
@keyframes lx-twinkle{50%{opacity:.85}}
@keyframes lx-spin{to{transform:rotate(360deg)}}
@keyframes lx-breathe{50%{transform:scale(1.12);opacity:.75}}
@keyframes lx-rise{from{opacity:0;transform:translateY(24px) scale(.82);filter:blur(10px)}to{opacity:1;transform:none;filter:drop-shadow(0 12px 30px rgba(0,194,255,.35))}}
@keyframes lx-reveal{from{clip-path:inset(0 100% 0 0);opacity:.2}to{clip-path:inset(0 0 0 0);opacity:1}}
@keyframes lx-shine{0%{transform:translateX(-120%)}55%,100%{transform:translateX(120%)}}
@keyframes lx-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes lx-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes lx-ping{70%{box-shadow:0 0 0 10px rgba(0,194,255,0)}100%{box-shadow:0 0 0 0 rgba(0,194,255,0)}}
@keyframes lx-halo{from{transform:scale(1);opacity:.9}to{transform:scale(1.55,1.9);opacity:0}}
@keyframes lx-flash{0%{transform:scale(0);opacity:1}100%{transform:scale(140);opacity:1}}
@keyframes lx-confetti{0%{opacity:1;transform:translate(0,0) rotate(0) scale(.6)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(var(--rot)) scale(1)}}
@keyframes lx-zoomout{to{transform:scale(1.18);opacity:0;filter:blur(6px)}}
@media (prefers-reduced-motion:reduce){.lx-root *,.lx-root{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important}}
`;
