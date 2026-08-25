import React from 'react';
import { motion } from 'framer-motion';
import { Scan, QrCode, Repeat } from 'lucide-react';

export type AttendanceMethod = 'face' | 'qr' | 'loop';

interface AttendanceMethodToggleProps {
  method: AttendanceMethod;
  onChange: (method: AttendanceMethod) => void;
}

const options: { value: AttendanceMethod; label: string; icon: any; gradient?: string }[] = [
  { value: 'face', label: 'Face ID', icon: Scan },
  { value: 'qr', label: 'QR Code', icon: QrCode, gradient: 'linear-gradient(135deg, hsl(var(--ios-purple)), hsl(var(--ios-pink)))' },
  { value: 'loop', label: 'Loop', icon: Repeat, gradient: 'linear-gradient(135deg, hsl(var(--ios-green)), hsl(var(--ios-teal, var(--ios-blue))))' },
];

const AttendanceMethodToggle: React.FC<AttendanceMethodToggleProps> = ({ method, onChange }) => {
  return (
    <div className="flex items-center justify-center">
      <div className="flex p-1 bg-muted/60 backdrop-blur-sm rounded-2xl border border-border/50">
        {options.map(opt => {
          const Icon = opt.icon;
          const active = method === opt.value;
          return (
            <motion.button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              whileTap={{ scale: 0.98 }}
            >
              {active && (
                <motion.div
                  layoutId="activeMethod"
                  className="absolute inset-0 rounded-xl shadow-md"
                  style={opt.gradient ? { background: opt.gradient } : { background: 'hsl(var(--primary))' }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {opt.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default AttendanceMethodToggle;
