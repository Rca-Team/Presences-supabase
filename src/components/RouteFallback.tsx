import { useEffect, useState } from 'react';

/**
 * Premium Suspense fallback — invisible for the first 180ms (avoids
 * flashes on cached chunks), then fades in a slim gradient progress bar.
 * No skeleton blocks, no layout shift.
 */
const RouteFallback = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 180);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-[50vh] w-full relative"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className={`pointer-events-none fixed top-0 left-0 right-0 h-[2px] z-[70] overflow-hidden transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className="h-full w-1/3 rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.9), transparent)',
            animation: 'route-progress 1.1s cubic-bezier(0.4,0,0.2,1) infinite',
            boxShadow: '0 0 12px hsl(var(--primary) / 0.55)',
          }}
        />
      </div>
      <style>{`
        @keyframes route-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
};

export default RouteFallback;
