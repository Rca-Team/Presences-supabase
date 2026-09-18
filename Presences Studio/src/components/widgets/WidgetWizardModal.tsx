import React, { useState } from 'react';
import { 
  Sliders, 
  X, 
  Check, 
  Sparkles, 
  Palette, 
  Layers, 
  Monitor, 
  Tablet, 
  Smartphone, 
  Users, 
  Clock, 
  StickyNote, 
  Mic, 
  Shuffle, 
  Timer, 
  Quote, 
  Calculator, 
  RotateCcw,
  PlusCircle,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { TPATheme } from './LiveTPAWidget';

export interface WidgetConfig {
  showTPA: boolean;
  showPeriodTimer: boolean;
  showQuickNotes: boolean;
  showDecibelMeter: boolean;
  showStudentPicker: boolean;
  showStopwatch: boolean;
  showDailyQuote: boolean;
  tpaTheme: TPATheme;
  deviceMode: 'smartboard' | 'tablet' | 'mobile';
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  showTPA: true,
  showPeriodTimer: true,
  showQuickNotes: false,
  showDecibelMeter: true,
  showStudentPicker: false,
  showStopwatch: false,
  showDailyQuote: false,
  tpaTheme: 'emerald',
  deviceMode: 'smartboard',
};

interface WidgetWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: WidgetConfig;
  onUpdateConfig: (newConfig: WidgetConfig) => void;
}

export const WidgetWizardModal: React.FC<WidgetWizardModalProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
}) => {
  if (!isOpen) return null;

  const handleToggle = (key: keyof WidgetConfig) => {
    const updated = {
      ...config,
      [key]: !config[key],
    };
    onUpdateConfig(updated);
  };

  const handleSetDeviceMode = (mode: 'smartboard' | 'tablet' | 'mobile') => {
    let updated = { ...config, deviceMode: mode };
    if (mode === 'mobile') {
      // Streamline for smaller screen
      updated = {
        ...updated,
        showTPA: true,
        showPeriodTimer: true,
        showQuickNotes: false,
        showDecibelMeter: false,
        showStudentPicker: false,
        showStopwatch: false,
        showDailyQuote: false,
      };
    } else if (mode === 'tablet') {
      updated = {
        ...updated,
        showTPA: true,
        showPeriodTimer: true,
        showQuickNotes: true,
        showDecibelMeter: true,
        showStudentPicker: false,
      };
    } else {
      updated = {
        ...updated,
        showTPA: true,
        showPeriodTimer: true,
        showQuickNotes: true,
        showDecibelMeter: true,
        showStudentPicker: true,
        showStopwatch: true,
        showDailyQuote: true,
      };
    }
    onUpdateConfig(updated);
  };

  const handleSetTheme = (theme: TPATheme) => {
    const updated = { ...config, tpaTheme: theme };
    onUpdateConfig(updated);
    localStorage.setItem('smartboard_tpa_theme', theme);
  };

  const handleResetDefaults = () => {
    onUpdateConfig(DEFAULT_WIDGET_CONFIG);
  };

  const WIDGET_CATALOG = [
    {
      id: 'showTPA' as keyof WidgetConfig,
      name: 'Live T / P / A Attendance Pill',
      category: 'Attendance & Gate AI',
      description: 'Real-time Total, Present, Absent counter on top-right of screen with 1-tap absentee triage.',
      icon: Users,
      color: 'from-emerald-600 to-teal-600',
      badge: 'Signature',
      enabled: config.showTPA,
    },
    {
      id: 'showPeriodTimer' as keyof WidgetConfig,
      name: 'Period Timer & Bell Countdown',
      category: 'Time & Timetable',
      description: 'Countdown timer for current period, next upcoming subject, and automatic bell chimes.',
      icon: Clock,
      color: 'from-blue-600 to-cyan-600',
      badge: 'Popular',
      enabled: config.showPeriodTimer,
    },
    {
      id: 'showDecibelMeter' as keyof WidgetConfig,
      name: 'Decibel Live Noise Meter',
      category: 'Classroom Control',
      description: 'Live microphone discipline bar showing quiet, moderate, or loud classroom noise.',
      icon: Mic,
      color: 'from-indigo-600 to-violet-600',
      badge: 'Discipline',
      enabled: config.showDecibelMeter,
    },
    {
      id: 'showStudentPicker' as keyof WidgetConfig,
      name: 'Lucky Student Picker Wheel',
      category: 'Engagement & Games',
      description: '1-Tap to pick random students for answering questions with celebratory confetti.',
      icon: Shuffle,
      color: 'from-purple-600 to-pink-600',
      badge: 'Interactive',
      enabled: config.showStudentPicker,
    },
    {
      id: 'showQuickNotes' as keyof WidgetConfig,
      name: 'Quick Goals & Sticky Notes',
      category: 'Lesson Planning',
      description: 'Corner memo board for lesson objectives, homework reminders, and key formulas.',
      icon: StickyNote,
      color: 'from-amber-600 to-yellow-600',
      badge: 'Handy',
      enabled: config.showQuickNotes,
    },
    {
      id: 'showStopwatch' as keyof WidgetConfig,
      name: 'Quiz & Speed Challenge Timer',
      category: 'Focus & Testing',
      description: 'Compact stopwatch for timing student problem solving and group sprint exercises.',
      icon: Timer,
      color: 'from-teal-600 to-emerald-600',
      badge: 'Utility',
      enabled: config.showStopwatch,
    },
    {
      id: 'showDailyQuote' as keyof WidgetConfig,
      name: 'Motivational Daily Quote',
      category: 'Inspiration',
      description: 'Curated inspiring quotes on the smartboard for positive morning classroom mindset.',
      icon: Quote,
      color: 'from-rose-600 to-orange-600',
      badge: 'Motivation',
      enabled: config.showDailyQuote,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Smart Device Widget Wizard</span>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-extrabold border border-cyan-500/30">
                  Easy Setup
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Customize widgets for your Interactive Smartboard, Tablet, or Mobile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          
          {/* Device Profile Switcher */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              1. Choose Device Layout Preset
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleSetDeviceMode('smartboard')}
                className={`p-3 rounded-2xl border text-left flex flex-col items-center gap-2 transition ${
                  config.deviceMode === 'smartboard'
                    ? 'border-indigo-500 bg-indigo-950/50 ring-2 ring-indigo-500/30 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Monitor className="w-6 h-6 text-indigo-400" />
                <div className="text-center">
                  <div className="font-bold text-xs">Smartboard</div>
                  <div className="text-[10px] opacity-70">Full 4K interactive HUD</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSetDeviceMode('tablet')}
                className={`p-3 rounded-2xl border text-left flex flex-col items-center gap-2 transition ${
                  config.deviceMode === 'tablet'
                    ? 'border-cyan-500 bg-cyan-950/50 ring-2 ring-cyan-500/30 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Tablet className="w-6 h-6 text-cyan-400" />
                <div className="text-center">
                  <div className="font-bold text-xs">Tablet / iPad</div>
                  <div className="text-[10px] opacity-70">Balanced classroom view</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSetDeviceMode('mobile')}
                className={`p-3 rounded-2xl border text-left flex flex-col items-center gap-2 transition ${
                  config.deviceMode === 'mobile'
                    ? 'border-emerald-500 bg-emerald-950/50 ring-2 ring-emerald-500/30 text-white'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Smartphone className="w-6 h-6 text-emerald-400" />
                <div className="text-center">
                  <div className="font-bold text-xs">Mobile Phone</div>
                  <div className="text-[10px] opacity-70">Compact mini cards</div>
                </div>
              </button>
            </div>
          </div>

          {/* T/P/A Color Theme Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              2. Top-Right T/P/A Attendance Box Color Theme
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(
                [
                  { id: 'emerald', name: 'Emerald', color: 'bg-emerald-500' },
                  { id: 'cyber', name: 'Cyber Neon', color: 'bg-cyan-500' },
                  { id: 'gold', name: 'Royal Gold', color: 'bg-amber-500' },
                  { id: 'rose', name: 'Velvet Rose', color: 'bg-rose-500' },
                  { id: 'slate', name: 'Minimal Slate', color: 'bg-slate-500' },
                  { id: 'chalkboard', name: 'Chalkboard', color: 'bg-green-600' },
                ] as const
              ).map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => handleSetTheme(th.id)}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                    config.tpaTheme === th.id
                      ? 'border-white bg-white/10 ring-2 ring-white/20 text-white'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full ${th.color} shadow-sm`} />
                  <span className="text-[10px] font-bold">{th.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Widget Toggles List */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              3. Available On-Screen Widgets (1-Tap Turn On/Off)
            </label>

            <div className="space-y-2">
              {WIDGET_CATALOG.map((widget) => {
                const Icon = widget.icon;
                return (
                  <div
                    key={widget.id}
                    onClick={() => handleToggle(widget.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      widget.enabled
                        ? 'border-indigo-500/40 bg-indigo-950/20 text-white shadow-sm'
                        : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${widget.color} text-white shadow-md shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white">{widget.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-white/10 text-slate-300 font-semibold">
                            {widget.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {widget.description}
                        </p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="shrink-0">
                      {widget.enabled ? (
                        <span className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-xl shadow transition flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          ON
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold rounded-xl transition">
                          OFF
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Recommended
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition"
          >
            Apply to Smartboard
          </button>
        </div>
      </div>
    </div>
  );
};
