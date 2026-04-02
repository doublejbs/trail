import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RestartConfirmSheet({ open, onConfirm, onCancel }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          backdropFilter: open ? 'blur(2px)' : 'none',
          WebkitBackdropFilter: open ? 'blur(2px)' : 'none',
        }}
        onClick={onCancel}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 z-[201] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          bottom: 0,
          transform: open ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        <div
          className="bg-white rounded-t-3xl px-5 pt-3 pb-2"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          {/* Handle */}
          <div className="flex justify-center mb-5">
            <div className="w-9 h-1 rounded-full bg-black/[0.12]" />
          </div>

          {/* Icon */}
          <div className="mb-4 flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-black/[0.04] flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 11c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1s1 .45 1 1v4c0 .55-.45 1-1 1zm1 4h-2v-2h2v2z"
                  fill="currentColor"
                  className="text-black/70"
                />
              </svg>
            </div>
          </div>

          {/* Text */}
          <div className="text-center mb-6 px-2">
            <p className="text-[18px] font-extrabold text-black tracking-tight mb-1.5">
              기록을 삭제할까요?
            </p>
            <p className="text-[14px] text-black/40 font-medium leading-snug">
              현재까지의 기록이 모두 삭제되고<br />처음부터 다시 시작됩니다.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2.5 mb-2">
            <button
              onClick={onConfirm}
              className="w-full py-3.5 rounded-2xl text-[15px] font-bold bg-black text-white active:scale-[0.98] transition-transform"
            >
              재시작
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3.5 rounded-2xl text-[15px] font-semibold bg-black/[0.06] text-black/60 active:scale-[0.98] transition-transform"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
