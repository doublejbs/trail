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
        'flex items-center px-4',
        overlay
          ? 'absolute top-0 left-0 right-0 z-20 bg-white/80 backdrop-blur-sm border-b border-separator'
          : 'border-b border-separator bg-white',
      ].join(' ')}
      style={{ minHeight: '44px' }}
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-hig-headline min-h-0 min-w-0"
      >
        <ChevronLeft size={20} />
        뒤로
      </button>
      <span className="flex-1 text-center text-hig-headline font-semibold">{title}</span>
      <div className="w-[60px] flex justify-end">
        {rightAction}
      </div>
    </div>
  );
}
