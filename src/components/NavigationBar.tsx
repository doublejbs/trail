import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

interface NavigationBarProps {
  title: string;
  onBack: () => void;
  overlay?: boolean;
  rightAction?: ReactNode;
}

export function NavigationBar({ title, onBack, overlay = false, rightAction }: NavigationBarProps) {
  return (
    <div
      className={[
        'flex items-center px-3 gap-2',
        overlay
          ? 'absolute top-0 left-0 right-0 z-20 bg-white/85 backdrop-blur-md'
          : 'bg-white',
        'border-b border-black/[0.06]',
      ].join(' ')}
      style={{ minHeight: '48px' }}
    >
      <button
        onClick={onBack}
        aria-label="뒤로"
        className="flex items-center gap-0 text-sm font-semibold text-black/70 min-h-0 min-w-0 active:text-black/40 transition-colors"
      >
        <ChevronLeft size={22} strokeWidth={2} />
      </button>
      <span className="flex-1 text-center text-[15px] font-semibold text-black/90">{title}</span>
      <div className="w-10 flex justify-end shrink-0">
        {rightAction}
      </div>
    </div>
  );
}
