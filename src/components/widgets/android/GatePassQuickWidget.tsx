import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, PlusCircle, ShieldCheck, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';
import { fetchClassGatePasses, GatePass } from '@/services/gatePassService';

interface GatePassQuickWidgetProps {
  widget: AndroidWidgetItem;
  classNameStr?: string;
  onOpenIssuePass?: () => void;
  onOpenScanPass?: () => void;
}

export const GatePassQuickWidget: React.FC<GatePassQuickWidgetProps> = ({
  widget,
  classNameStr = '10-A',
  onOpenIssuePass,
  onOpenScanPass,
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-purple'];
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchClassGatePasses(classNameStr);
        if (active) setPasses(data || []);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [classNameStr]);

  const activeCount = passes.filter((p) => p.status === 'approved' || p.status === 'pending').length;
  const exitedCount = passes.filter((p) => p.status === 'used').length;

  return (
    <div className="flex flex-col justify-between h-full gap-2.5">
      {/* Top Section */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground block">
            {activeCount} <span className="text-xs text-muted-foreground font-normal">Active</span>
          </span>
          <span className="text-xs font-semibold text-muted-foreground block">
            {exitedCount} Exited Campus Today
          </span>
        </div>

        <div className="h-12 w-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
          <QrCode className="h-6 w-6" />
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onOpenIssuePass}
          className="flex items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition-all"
        >
          <PlusCircle className="h-4 w-4" /> Issue Pass
        </button>

        <button
          type="button"
          onClick={onOpenScanPass}
          className="flex items-center justify-center gap-1.5 p-2.5 rounded-2xl bg-card hover:bg-muted/70 active:scale-95 border border-border text-foreground font-bold text-xs shadow-xs transition-all"
        >
          <QrCode className="h-4 w-4 text-purple-500" /> Verify QR
        </button>
      </div>
    </div>
  );
};
