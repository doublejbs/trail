import { useEffect, useRef, useState } from 'react';

interface Props {
  elapsedTime: string;
  distanceKm: string;
  onClose: () => void;
}

const randomBetween = (a: number, b: number) => {
  return a + Math.random() * (b - a);
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: 'rect' | 'circle';
}

const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#FF5722', '#00BCD4'];

export const FinishCelebration = ({ elapsedTime, distanceKm, onClose }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Particle[] = [];

    // 초기 폭발
    for (let i = 0; i < 120; i++) {
      const angle = randomBetween(0, Math.PI * 2);
      const speed = randomBetween(4, 14);
      particles.push({
        x: canvas.width / 2,
        y: canvas.height * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: randomBetween(4, 10),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: randomBetween(0, Math.PI * 2),
        rotationSpeed: randomBetween(-0.15, 0.15),
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }

    let animId: number;
    const gravity = 0.18;
    const friction = 0.985;

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vy += gravity;
        p.vx *= friction;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.004;

        if (p.opacity <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        }

        ctx!.restore();
      }

      if (particles.length > 0) {
        animId = requestAnimationFrame(animate);
      }
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center">
      {/* 배경 */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-500"
        style={{ opacity: show ? 0.85 : 0 }}
      />

      {/* 팡파레 캔버스 */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* 콘텐츠 */}
      <div
        className="relative z-10 flex flex-col items-center gap-6 px-8 transition-all duration-700"
        style={{
          opacity: show ? 1 : 0,
          transform: show ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(20px)',
        }}
      >
        <div className="text-[56px] leading-none">
          🎉
        </div>
        <h1 className="text-[28px] font-extrabold text-white tracking-tight">
          완주 성공!
        </h1>

        <div className="flex gap-6 mt-2">
          <div className="text-center">
            <p className="text-[24px] font-bold text-white tabular-nums">{elapsedTime}</p>
            <p className="text-[12px] text-white/50 font-medium mt-0.5">소요 시간</p>
          </div>
          <div className="w-px bg-white/15" />
          <div className="text-center">
            <p className="text-[24px] font-bold text-white tabular-nums">{distanceKm}</p>
            <p className="text-[12px] text-white/50 font-medium mt-0.5">이동 거리</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 px-10 py-3.5 rounded-full bg-white text-black text-[15px] font-bold active:bg-white/90 transition-colors shadow-lg"
        >
          확인
        </button>
      </div>
    </div>
  );
};
