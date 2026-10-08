import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { useAppConfig } from '../features/customer/queries';
import { haptic } from '../lib/haptics';

/** Floating "Ask RapidFix AI" button above the tab bar (only when the assistant is switched on). */
export function AssistantButton() {
  const config = useAppConfig();
  if (!config.data?.assistant) return null;
  return (
    <Link
      to="/assistant"
      onClick={() => haptic('light')}
      aria-label="Chat with RapidFix Assistant"
      className="fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-fixora-blue to-sky-500 py-3 pr-4 pl-3.5 font-semibold text-white shadow-[0_8px_24px_rgb(37_99_235/0.35)] transition active:scale-95 lg:bottom-8 min-[480px]:right-[calc(50%-240px+1rem)] lg:right-8"
    >
      <Sparkles className="size-5" aria-hidden />
      <span className="text-sm">Ask AI</span>
    </Link>
  );
}
