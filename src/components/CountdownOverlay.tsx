import { useEffect, useState } from 'react';

interface CountdownOverlayProps {
  onComplete: () => void;
}

export function CountdownOverlay({ onComplete }: CountdownOverlayProps) {
  const [count, setCount] = useState(3);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (count === 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => {
      setCount((c) => c - 1);
      setAnimKey((k) => k + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  if (count === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      <span
        key={animKey}
        className="text-white font-extrabold select-none"
        style={{
          fontSize: '120px',
          lineHeight: 1,
          animation: 'countdown-pop 0.9s ease-out forwards',
        }}
      >
        {count}
      </span>

      <style>{`
        @keyframes countdown-pop {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          20% {
            opacity: 1;
            transform: scale(1.1);
          }
          35% {
            transform: scale(1);
          }
          75% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.8);
          }
        }
      `}</style>
    </div>
  );
}
