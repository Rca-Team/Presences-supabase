import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, LayoutGrid, Plus, Share, CheckCircle2, ArrowRight, X, Sparkles, Layers, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface AddWidgetToHomeScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddWidgetToHomeScreenModal: React.FC<AddWidgetToHomeScreenModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'android_pwa' | 'android_native' | 'ios'>(
    isIOS ? 'ios' : 'android_pwa'
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          className="relative w-full max-w-lg rounded-3xl bg-slate-900/95 dark:bg-slate-950/95 border border-white/15 text-white shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Ambient Lighting */}
          <div className="absolute -top-20 -right-20 w-44 h-44 bg-blue-600/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-purple-600/25 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 border border-white/20">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Add Widgets to Home Screen</span>
                <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-bold">
                  STEP-BY-STEP
                </Badge>
              </h3>
              <p className="text-xs text-slate-400">
                Follow these 2 simple steps to get 1-tap live widgets on your phone
              </p>
            </div>
          </div>

          {/* Platform Switcher Tabs */}
          <div className="flex rounded-2xl bg-white/5 p-1 border border-white/10 mb-4 text-xs font-bold">
            <button
              onClick={() => setActiveTab('android_pwa')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                activeTab === 'android_pwa'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🤖 Android (Instant Web)
            </button>
            <button
              onClick={() => setActiveTab('android_native')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                activeTab === 'android_native'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📦 Android (.APK Widget)
            </button>
            <button
              onClick={() => setActiveTab('ios')}
              className={`flex-1 py-2 rounded-xl transition-all ${
                activeTab === 'ios'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🍏 iPhone / iOS
            </button>
          </div>

          {/* Tab 1: Android PWA Instant Shortcut Guide */}
          {activeTab === 'android_pwa' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>No PC or downloading required!</strong> You can turn Presences Widgets into a dedicated Home Screen tile in 10 seconds:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">1</span>
                  <div>
                    <p className="font-bold text-white">Install the Presences App via Chrome</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tap Chrome menu (⋮) $\rightarrow$ <strong>"Install App"</strong> (or click the button below).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">2</span>
                  <div>
                    <p className="font-bold text-white">Long-press (hold) the Presences Icon on Home Screen</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Go to your phone home screen, press and hold the <strong>Presences</strong> app icon.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">3</span>
                  <div>
                    <p className="font-bold text-white">Drag "Widgets" onto your Home Screen!</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      A popup menu will show <strong>📊 Android Widgets</strong>. Press and drag it to place the dedicated widget shortcut directly on your home screen!
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => {
                  install();
                  onClose();
                }}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Trigger Instant App Install</span>
              </Button>
            </div>
          )}

          {/* Tab 2: Android Native APK Widget Guide */}
          {activeTab === 'android_native' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-start gap-2.5">
                <Layers className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <strong>True Native $4\times2$ & $2\times1$ Android Widgets:</strong> Built directly into the Android system launcher menu.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-black text-white">1</span>
                  <div>
                    <p className="font-bold text-white">Install the Presences .APK package</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Install the compiled Android APK on your device.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-black text-white">2</span>
                  <div>
                    <p className="font-bold text-white">Long-press on your phone's Home Screen background</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Press and hold any empty area on your phone's wallpaper $\rightarrow$ tap <strong>"Widgets"</strong> 🧩.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">3</span>
                  <div>
                    <p className="font-bold text-white">Drag the Presences Attendance Widget ($4\times2$)</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Scroll to <strong>Presences</strong> and drag the live Attendance Glance widget onto your screen!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: iPhone / iOS Guide */}
          {activeTab === 'ios' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">1</span>
                  <div>
                    <p className="font-bold text-white">Tap Safari's Share Button</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      At the bottom of Safari, tap the <strong>Share</strong> button <Share className="inline w-3.5 h-3.5 text-blue-400 mx-0.5" />.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">2</span>
                  <div>
                    <p className="font-bold text-white">Select "Add to Home Screen"</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Scroll down and tap <strong>"Add to Home Screen"</strong> <Plus className="inline w-3.5 h-3.5 text-blue-400 mx-0.5" /> $\rightarrow$ Tap <strong>Add</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white"
            >
              Got it, Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddWidgetToHomeScreenModal;
