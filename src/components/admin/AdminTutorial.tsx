import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CalendarDays,
  Activity,
  Image,
  BarChart3,
  UserCog,
  Bell,
  MessageSquareText,
  Mail,
  Siren,
  Settings,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  HelpCircle,
  Rocket,
  Search,
  BookOpen,
  CheckCircle2,
  Compass,
  ArrowRight,
  Zap,
  Shield,
  Lightbulb,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

export interface TutorialStep {
  id: string;
  tabId: string;
  icon: React.ElementType;
  title: string;
  category: 'Core Operations' | 'Students & AI' | 'Safety & Comms';
  description: string;
  proTip: string;
  badge: string;
  color: string;
  standardLocation: string;
  liteLocation: string;
}

export const TUTORIAL_MODULES: TutorialStep[] = [
  {
    id: 'dashboard',
    tabId: 'dashboard',
    icon: LayoutDashboard,
    title: 'Principal Command Dashboard',
    category: 'Core Operations',
    description: 'Real-time school-wide attendance metrics, live class charts, executive insights, and today’s instant check-in summaries.',
    proTip: 'Use the live sync button at top-right to instantly refresh campus-wide numbers without full page reloads.',
    badge: 'Executive',
    color: '#3b82f6',
    standardLocation: 'Sidebar → Overview → Dashboard',
    liteLocation: 'Dock of Tabs → Core Operations → Principal Dashboard',
  },
  {
    id: 'timetable',
    tabId: 'timetable',
    icon: CalendarDays,
    title: 'Timetable Matrix & Auto-Substitution',
    category: 'Core Operations',
    description: '8-period weekly schedule matrix for Classes 1–12 with automated teacher substitution when staff are absent or on leave.',
    proTip: 'When a teacher is marked absent, the smart substitution engine automatically suggests available subject specialists with 0 free-period conflicts.',
    badge: 'AI Timetable',
    color: '#6366f1',
    standardLocation: 'Sidebar → Management → Timetable & Subs',
    liteLocation: 'Dock of Tabs → Core Operations → Timetable & Substitutions',
  },
  {
    id: 'students',
    tabId: 'students',
    icon: Users,
    title: 'Student Roster & Calendar',
    category: 'Students & AI',
    description: 'Comprehensive student directory with biometric photo cards, 3D face recapture triggers, section rosters, and 365-day attendance calendars.',
    proTip: 'Tap the 3D Scan button directly on any student card to update their face biometric vector in under 5 seconds.',
    badge: 'Directory',
    color: '#06b6d4',
    standardLocation: 'Sidebar → Overview → Student Directory',
    liteLocation: 'Dock of Tabs → Students & AI → Master Student Roster',
  },
  {
    id: 'sections',
    tabId: 'sections',
    icon: FolderKanban,
    title: 'Class & Section Manager',
    category: 'Students & AI',
    description: 'Organize grades, streams (Science, Commerce, Arts), section allocations, and designate Class Teachers for attendance ownership.',
    proTip: 'Assigning a Class Teacher gives them instant 1-tap mobile attendance authorization for their specific class cohort.',
    badge: 'Sections',
    color: '#8b5cf6',
    standardLocation: 'Sidebar → Overview → Class Sections',
    liteLocation: 'Dock of Tabs → Students & AI → Class & Section Manager',
  },
  {
    id: 'samples',
    tabId: 'samples',
    icon: Activity,
    title: 'Face Recognition Neural Vectors',
    category: 'Students & AI',
    description: 'Inspect 512-dimension AI embedding vectors, quality scores, lighting variation samples, and resolve duplicate face profiles.',
    proTip: 'Ensure each student has at least 3 high-quality angles (Front, Left, Right) to guarantee instant 0-ms recognition under changing lighting.',
    badge: 'Biometric AI',
    color: '#10b981',
    standardLocation: 'Sidebar → Registration → Face Samples',
    liteLocation: 'Dock of Tabs → Students & AI → Face Diagnostics',
  },
  {
    id: 'idcard',
    tabId: 'idcard',
    icon: Image,
    title: 'Batch ID Card Face Extractor',
    category: 'Students & AI',
    description: 'Upload PDF admission rosters or class ID card sheets — neural detector automatically crops faces, extracts roll numbers, and creates student accounts.',
    proTip: 'Supports batch PDF processing with up to 100 student ID cards per single upload.',
    badge: 'Batch AI',
    color: '#0ea5e9',
    standardLocation: 'Sidebar → Registration → ID Card Extract',
    liteLocation: 'Dock of Tabs → Students & AI → Batch ID Card Extractor',
  },
  {
    id: 'emergency',
    tabId: 'emergency',
    icon: Siren,
    title: 'Emergency Alert & Campus Lockdown',
    category: 'Safety & Comms',
    description: 'Broadcast high-priority emergency sirens (Fire, Lockdown, Medical, Earthquake) to all school gates, teacher devices, and parent phones with instant override.',
    proTip: 'Emergency alerts override silent mode and trigger persistent audible sirens across all active school terminals.',
    badge: 'Critical Safety',
    color: '#ef4444',
    standardLocation: 'Sidebar → Management → Emergency Alert',
    liteLocation: 'Dock of Tabs → Safety & Comms → Emergency Alert Command',
  },
  {
    id: 'notifications',
    tabId: 'notifications',
    icon: Bell,
    title: 'Parent Broadcast & Circulars',
    category: 'Safety & Comms',
    description: 'Multi-channel circular dispatch via WhatsApp, SMS, and Email with dynamic placeholders for student names, classes, and attendance status.',
    proTip: 'Use smart templates to automatically send custom absence alerts to parents of late or absent students at cutoff time.',
    badge: 'Messaging',
    color: '#f59e0b',
    standardLocation: 'Sidebar → Management → Notifications',
    liteLocation: 'Dock of Tabs → Safety & Comms → Broadcast Notifications',
  },
  {
    id: 'reports',
    tabId: 'reports',
    icon: BarChart3,
    title: 'Attendance Reports & Analytics',
    category: 'Core Operations',
    description: 'Deep analytical reports with class-wise attendance rates, chronic absentee lists, gender ratios, and exportable official CBSE/Kendriya Vidyalaya registers.',
    proTip: 'Filter by date range and class section to generate instant high-resolution PDF rosters ready for administrative sign-off.',
    badge: 'Reports',
    color: '#22c55e',
    standardLocation: 'Sidebar → Management → Reports & Analytics',
    liteLocation: 'Dock of Tabs → Core Operations → Reports & Analytics',
  },
  {
    id: 'access',
    tabId: 'access',
    icon: UserCog,
    title: 'User Roles & Staff Permissions',
    category: 'Safety & Comms',
    description: 'Role-based access security for Principals, Admins, Teachers, and Gate Operators with granular section permission controls.',
    proTip: 'Teachers can be restricted to only view and manage attendance for their designated class sections.',
    badge: 'Security',
    color: '#ec4899',
    standardLocation: 'Sidebar → Management → User Access',
    liteLocation: 'Dock of Tabs → Safety & Comms → User & Staff Permissions',
  },
  {
    id: 'settings',
    tabId: 'settings',
    icon: Settings,
    title: 'Morning Cutoff & Policies',
    category: 'Safety & Comms',
    description: 'Set official school start time, morning late entry grace period (e.g. 08:30 AM), automated notification triggers, and pilot testing settings.',
    proTip: 'Attendance scanned before cutoff is logged as "Present"; attendance scanned during grace period is automatically flagged as "Late".',
    badge: 'Policy',
    color: '#64748b',
    standardLocation: 'Sidebar → Settings → Attendance Cutoff',
    liteLocation: 'Dock of Tabs → Safety & Comms → Morning Cutoff & Policies',
  },
];

const STORAGE_KEY = 'admin-tutorial-v2-completed';

export interface AdminTutorialProps {
  onNavigate: (tabId: string) => void;
  mode?: 'standard' | 'lite';
  variant?: 'button' | 'pill' | 'compact';
}

export const AdminTutorial: React.FC<AdminTutorialProps> = ({
  onNavigate,
  mode = 'standard',
  variant = 'pill',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'walkthrough' | 'knowledge-base'>('walkthrough');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const isMobile = useIsMobile();
  const { trigger: haptic } = useHapticFeedback();

  // Check first time visit
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const currentStep = TUTORIAL_MODULES[currentStepIndex] || TUTORIAL_MODULES[0];
  const progressPercent = ((currentStepIndex + 1) / TUTORIAL_MODULES.length) * 100;

  const handleNext = useCallback(() => {
    haptic('selection');
    if (currentStepIndex < TUTORIAL_MODULES.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleClose();
    }
  }, [currentStepIndex, haptic]);

  const handlePrev = useCallback(() => {
    haptic('selection');
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex, haptic]);

  const handleClose = useCallback(() => {
    haptic('selection');
    setIsOpen(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, [haptic]);

  const handleOpen = useCallback(() => {
    haptic('selection');
    setIsOpen(true);
  }, [haptic]);

  const handleJumpToModule = useCallback(
    (tabId: string) => {
      haptic('success');
      onNavigate(tabId);
      handleClose();
    },
    [onNavigate, handleClose, haptic]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        if (viewMode === 'walkthrough') {
          e.preventDefault();
          handleNext();
        }
      } else if (e.key === 'ArrowLeft') {
        if (viewMode === 'walkthrough') {
          e.preventDefault();
          handlePrev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, viewMode, handleNext, handlePrev, handleClose]);

  // Filtered knowledge base items
  const filteredModules = useMemo(() => {
    return TUTORIAL_MODULES.filter((m) => {
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.proTip.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const StepIcon = currentStep.icon;

  return (
    <>
      {/* Trigger Button */}
      {variant === 'pill' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpen}
          className={cn(
            "h-8 px-2.5 sm:px-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-xs",
            mode === 'lite'
              ? "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
              : "border-slate-200/80 dark:border-white/10 nano-glass-dock hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 btn-spring"
          )}
          title="Open Interactive Admin Guide & Tutorial"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span className="hidden sm:inline">Admin Tutorial</span>
          <span className="sm:hidden">Guide</span>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative group rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          onClick={handleOpen}
          title="Admin Tutorial & Guide"
        >
          <HelpCircle className="h-4 w-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        </Button>
      )}

      {/* Main Interactive Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClose}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
            />

            {/* Modal Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 14 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32, mass: 0.6 }}
              className="relative w-full max-w-2xl rounded-3xl border border-slate-200/80 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            >
              {/* Top Accent Bar */}
              <div
                className="h-1.5 w-full transition-all duration-300"
                style={{
                  background:
                    viewMode === 'walkthrough'
                      ? `linear-gradient(90deg, ${currentStep.color}, #3b82f6)`
                      : 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
                }}
              />

              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200/70 dark:border-white/10 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 border border-white/20 shrink-0">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                        Admin Command Center Guide
                      </h2>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider py-0 px-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        {mode === 'lite' ? '⚡ Lite Mode' : '✨ Standard Mode'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      PM Shri KV NFC Vigyan Vihar · Master operations & features
                    </p>
                  </div>
                </div>

                {/* View Switcher & Close */}
                <div className="flex items-center gap-2">
                  <div className="hidden xs:flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-white/5">
                    <button
                      onClick={() => setViewMode('walkthrough')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        viewMode === 'walkthrough'
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      Tour
                    </button>
                    <button
                      onClick={() => setViewMode('knowledge-base')}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                        viewMode === 'knowledge-base'
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      All Modules
                    </button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
                {viewMode === 'walkthrough' ? (
                  /* STEP-BY-STEP GUIDED WALKTHROUGH */
                  <div className="space-y-4">
                    {/* Progress Strip */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Step {currentStepIndex + 1} of {TUTORIAL_MODULES.length}
                        </span>
                        <span className="font-mono text-[11px]">
                          {Math.round(progressPercent)}% completed
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: currentStep.color }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>

                    {/* Active Step Feature Card */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentStep.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.22 }}
                        className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 space-y-4 relative overflow-hidden"
                      >
                        {/* Soft background ambient glow */}
                        <div
                          className="pointer-events-none absolute -right-12 -top-12 w-44 h-44 rounded-full blur-3xl opacity-20"
                          style={{ background: currentStep.color }}
                        />

                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-3 relative z-10">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${currentStep.color}, ${currentStep.color}cc)`,
                              }}
                            >
                              <StepIcon className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                  {currentStep.title}
                                </h3>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-bold py-0.5 px-2 rounded-full"
                                  style={{
                                    backgroundColor: `${currentStep.color}20`,
                                    color: currentStep.color,
                                  }}
                                >
                                  {currentStep.badge}
                                </Badge>
                              </div>
                              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                Category: {currentStep.category}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed relative z-10">
                          {currentStep.description}
                        </p>

                        {/* Pro Tip Box */}
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/5 p-3 flex items-start gap-2.5 relative z-10">
                          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-900 dark:text-amber-200/90 leading-normal">
                            <strong className="font-bold text-amber-950 dark:text-amber-100">Pro Tip: </strong>
                            {currentStep.proTip}
                          </div>
                        </div>

                        {/* Location Navigation Guide */}
                        <div className="rounded-xl border border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-slate-900/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 relative z-10">
                          <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                            <Compass className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>
                              <strong>Location: </strong>
                              {mode === 'lite' ? currentStep.liteLocation : currentStep.standardLocation}
                            </span>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleJumpToModule(currentStep.tabId)}
                            className="h-7 px-3 text-xs font-bold rounded-lg text-white cursor-pointer shadow-xs"
                            style={{ backgroundColor: currentStep.color }}
                          >
                            <span>Open Module</span>
                            <ExternalLink className="w-3 h-3 ml-1.5" />
                          </Button>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Step Selector Dots */}
                    <div className="flex items-center justify-center gap-1.5 py-1">
                      {TUTORIAL_MODULES.map((step, idx) => (
                        <button
                          key={step.id}
                          onClick={() => {
                            haptic('selection');
                            setCurrentStepIndex(idx);
                          }}
                          className="p-1 cursor-pointer group"
                          title={step.title}
                        >
                          <motion.div
                            className="rounded-full transition-all duration-200"
                            animate={{
                              width: idx === currentStepIndex ? 22 : 6,
                              height: 6,
                              backgroundColor:
                                idx === currentStepIndex
                                  ? step.color
                                  : idx < currentStepIndex
                                  ? 'rgba(59, 130, 246, 0.4)'
                                  : 'rgba(148, 163, 184, 0.25)',
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* KNOWLEDGE BASE & INSTANT MODULE LAUNCHER */
                  <div className="space-y-4">
                    {/* Search & Category Filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          placeholder="Search operations, AI features, reports, alerts..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-white/10"
                        />
                      </div>

                      <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {['All', 'Core Operations', 'Students & AI', 'Safety & Comms'].map((cat) => (
                          <button
                            key={cat}
                            onClick={() => {
                              haptic('selection');
                              setSelectedCategory(cat);
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer",
                              selectedCategory === cat
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Modules Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[48vh] overflow-y-auto pr-1">
                      {filteredModules.map((module) => {
                        const IconComponent = module.icon;
                        return (
                          <div
                            key={module.id}
                            className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 flex flex-col justify-between gap-3 hover:border-blue-500/40 transition-all duration-200 group"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                                    style={{ backgroundColor: module.color }}
                                  >
                                    <IconComponent className="w-4 h-4" />
                                  </div>
                                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {module.title}
                                  </h4>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] font-bold px-1.5 py-0 rounded-md shrink-0"
                                  style={{
                                    backgroundColor: `${module.color}20`,
                                    color: module.color,
                                  }}
                                >
                                  {module.badge}
                                </Badge>
                              </div>

                              <p className="text-[11.5px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                {module.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/5">
                              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[150px]">
                                {module.category}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleJumpToModule(module.tabId)}
                                className="h-6 px-2.5 text-[11px] font-bold rounded-lg border-slate-300 dark:border-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors cursor-pointer"
                              >
                                <span>Launch</span>
                                <ArrowRight className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-3.5 sm:p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3 shrink-0">
                {viewMode === 'walkthrough' ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrev}
                      disabled={currentStepIndex === 0}
                      className="h-8 px-3 rounded-xl text-xs font-bold border-slate-200 dark:border-slate-800 cursor-pointer disabled:opacity-40"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                      <span>Previous</span>
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClose}
                        className="h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        Skip Tour
                      </Button>

                      <Button
                        size="sm"
                        onClick={handleNext}
                        className="h-8 px-4 rounded-xl text-xs font-bold text-white shadow-md cursor-pointer"
                        style={{ backgroundColor: currentStep.color }}
                      >
                        {currentStepIndex === TUTORIAL_MODULES.length - 1 ? (
                          <>
                            <Rocket className="w-3.5 h-3.5 mr-1.5" />
                            <span>Complete Tour</span>
                          </>
                        ) : (
                          <>
                            <span>Next Step</span>
                            <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Showing <strong>{filteredModules.length}</strong> institutional modules
                    </div>
                    <Button
                      size="sm"
                      onClick={handleClose}
                      className="h-8 px-4 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer"
                    >
                      Close Guide
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminTutorial;
