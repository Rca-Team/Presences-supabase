import React from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, Activity, ShieldCheck } from 'lucide-react';

/**
 * NeuralOrbPanel — the glowing "neural core" hero visual with floating
 * status chips (Presences AI "Lumina" design language, dark mode).
 */
const chips = [
  { icon: Fingerprint, title: 'Identity verified', sub: 'Live face match · 99.2%', pos: 'left-0 top-2' },
  { icon: Activity, title: 'Live attendance', sub: 'Realtime present · late', pos: 'right-0 top-1/2 -translate-y-1/2' },
  { icon: ShieldCheck, title: 'No anomalies', sub: 'Security · nominal', pos: 'left-0 bottom-2' },
];

const NeuralOrbPanel: React.FC = () => (
  <div className="relative overflow-hidden rounded-3xl border border-primary/12 bg-card/50 p-4 sm:p-6 backdrop-blur-xl shadow-[0_28px_80px_-36px_hsl(230_50%_3%/0.85)]">
    <div className="flex items-center justify-between">
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
        Neural core
      </p>
      <span className="flex h-2 w-2 rounded-full bg-primary/80 animate-ping sm:hidden" />
    </div>

    <div className="relative mt-2 sm:mt-4">
      <div className="relative mx-auto flex h-40 w-40 items-center justify-center sm:h-56 sm:w-56">
        {/* concentric rings */}
        {[1, 1.16, 1.32].map((s, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute rounded-full border border-primary/20"
            style={{ height: `${68 * s}%`, width: `${68 * s}%` }}
            animate={{ opacity: [0.2, 0.55, 0.2], scale: [0.99, 1.02, 0.99] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
          />
        ))}

        {/* the orb */}
        <motion.div
          className="relative h-[62%] w-[62%] rounded-full"
          style={{
            background:
              'radial-gradient(circle at 34% 28%, hsl(0 0% 100% / 0.95), hsl(var(--primary) / 0.9) 38%, hsl(214 84% 44%) 72%, hsl(228 60% 18%) 100%)',
            boxShadow: '0 0 45px hsl(var(--primary) / 0.45), 0 0 110px hsl(205 82% 52% / 0.28)',
          }}
          animate={{ scale: [1, 1.035, 1] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Floating chips for tablets & desktop */}
      <div className="hidden sm:block">
        {chips.map((c, i) => (
          <motion.div
            key={c.title}
            className={`absolute ${c.pos} flex items-center gap-2 rounded-2xl border border-primary/15 bg-background/70 px-3 py-2 backdrop-blur-md`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: [0, -5, 0] }}
            transition={{ opacity: { duration: 0.4, delay: 0.15 * i }, y: { duration: 5 + i, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/15">
              <c.icon className="h-3.5 w-3.5 text-primary" />
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] font-semibold text-foreground">{c.title}</span>
              <span className="block text-[10px] text-muted-foreground">{c.sub}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </div>

    {/* Mobile-friendly chip stack on small screens (no overlap with orb) */}
    <div className="mt-3 flex flex-col gap-1.5 sm:hidden">
      {chips.map((c) => (
        <div
          key={c.title}
          className="flex items-center gap-2 rounded-xl border border-primary/15 bg-background/60 px-2.5 py-1.5 backdrop-blur-md"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <c.icon className="h-3 w-3 text-primary" />
          </span>
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground truncate">{c.title}</span>
            <span className="text-[9.5px] text-muted-foreground truncate">{c.sub}</span>
          </div>
        </div>
      ))}
    </div>

    <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-1.5 sm:gap-2">
      {[
        { v: '99.7%', l: 'Accuracy' },
        { v: '120ms', l: 'Recognition' },
        { v: '24/7', l: 'Monitoring' },
      ].map((s) => (
        <div key={s.l} className="rounded-xl sm:rounded-2xl border border-primary/10 bg-background/40 px-1.5 py-1.5 sm:px-2 sm:py-2 text-center">
          <p className="text-xs sm:text-sm font-bold text-primary">{s.v}</p>
          <p className="text-[8.5px] sm:text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{s.l}</p>
        </div>
      ))}
    </div>
  </div>
);

export default NeuralOrbPanel;
