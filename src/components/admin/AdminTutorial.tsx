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
  CreditCard,
  BarChart3,
  UserCog,
  Bell,
  MessageSquareText,
  Mail,
  Siren,
  QrCode,
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
  ExternalLink,
  Layers,
  Monitor,
  Laptop,
  Workflow,
  Command,
  TrendingUp,
  Download,
  Flame,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

export interface TutorialStep {
  id: string;
  tabId: string;
  icon: React.ElementType;
  title: string;
  category: 'Core Operations' | 'Students & AI' | 'Safety & Comms';
  standardGroup: 'Overview' | 'Registration' | 'Management';
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
    standardGroup: 'Overview',
    description: 'Real-time school-wide attendance metrics, live class charts, executive insights, and today’s instant check-in summaries with automatic Supabase sync.',
    proTip: 'Use the live Refresh button in the top bar to pull instantaneous campus metrics without full page reloads.',
    badge: 'Executive',
    color: '#3b82f6',
    standardLocation: 'Sidebar → Overview → Dashboard',
    liteLocation: 'Dock of Tabs → Core Operations → Principal Dashboard',
  },
  {
    id: 'sections',
    tabId: 'sections',
    icon: FolderKanban,
    title: 'Class & Section Manager',
    category: 'Students & AI',
    standardGroup: 'Overview',
    description: 'Organize grades, streams (Science, Commerce, Arts), section allocations, and designate Class Teachers for authorized attendance ownership.',
    proTip: 'Assigning a Class Teacher gives them instant 1-tap mobile attendance authorization for their specific class cohort.',
    badge: 'Sections',
    color: '#8b5cf6',
    standardLocation: 'Sidebar → Overview → Class',
    liteLocation: 'Dock of Tabs → Students & AI → Class & Section Manager',
  },
  {
    id: 'students',
    tabId: 'students',
    icon: Users,
    title: 'Master Student Roster & Calendar',
    category: 'Students & AI',
    standardGroup: 'Overview',
    description: 'Comprehensive student directory with biometric photo cards, 3D face recapture triggers, section rosters, and 365-day attendance calendars.',
    proTip: 'Tap the 3D Scan button directly on any student card to update their face biometric vector in under 5 seconds.',
    badge: 'Directory',
    color: '#06b6d4',
    standardLocation: 'Sidebar → Overview → Students',
    liteLocation: 'Dock of Tabs → Students & AI → Master Student Roster',
  },
  {
    id: 'idcard',
    tabId: 'idcard',
    icon: Image,
    title: 'Batch ID Card Face Extractor',
    category: 'Students & AI',
    standardGroup: 'Registration',
    description: 'Upload PDF admission rosters or class ID card sheets — neural detector automatically crops faces, extracts roll numbers, and creates student accounts.',
    proTip: 'Supports batch PDF processing with up to 100 student ID cards per single upload with zero cloud latency.',
    badge: 'Batch AI',
    color: '#0ea5e9',
    standardLocation: 'Sidebar → Registration → ID Extract',
    liteLocation: 'Dock of Tabs → Students & AI → Batch ID Card Extractor',
  },
  {
    id: 'idcards',
    tabId: 'idcards',
    icon: CreditCard,
    title: 'Student ID Cards & Profile Directory',
    category: 'Students & AI',
    standardGroup: 'Registration',
    description: 'Inspect full student registration details, parent contact numbers, class assignments, and printable official student identity cards.',
    proTip: 'Quickly export or batch-print official identity cards with embedded QR codes for gate pass validation.',
    badge: 'ID Cards',
    color: '#38bdf8',
    standardLocation: 'Sidebar → Registration → ID Cards',
    liteLocation: 'Dock of Tabs → Students & AI → Student Details',
  },
  {
    id: 'timetable',
    tabId: 'timetable',
    icon: CalendarDays,
    title: 'Timetable Matrix & Auto-Substitution',
    category: 'Core Operations',
    standardGroup: 'Management',
    description: '8-period weekly schedule matrix for Classes 1–12 with automated teacher substitution when staff are absent or on leave.',
    proTip: 'When a teacher is marked absent, the smart substitution engine automatically suggests available subject specialists with 0 free-period conflicts.',
    badge: 'AI Timetable',
    color: '#6366f1',
    standardLocation: 'Sidebar → Management → Timetable',
    liteLocation: 'Dock of Tabs → Core Operations → Timetable & Substitutions',
  },
  {
    id: 'samples',
    tabId: 'samples',
    icon: Activity,
    title: 'Face Biometric Vectors & AI Diagnostics',
    category: 'Students & AI',
    standardGroup: 'Management',
    description: 'Inspect 512-dimension neural embedding vectors, face quality scores, lighting variation samples, and resolve duplicate face profiles.',
    proTip: 'Ensure each student has at least 3 high-quality angles (Front, Left, Right) to guarantee instant 0-ms recognition under changing lighting.',
    badge: 'Biometric AI',
    color: '#10b981',
    standardLocation: 'Sidebar → Management → Face Samples',
    liteLocation: 'Dock of Tabs → Students & AI → Face Diagnostics',
  },
  {
    id: 'reports',
    tabId: 'reports',
    icon: BarChart3,
    title: 'Attendance Reports & Analytics',
    category: 'Core Operations',
    standardGroup: 'Management',
    description: 'Deep analytical reports with class-wise attendance rates, chronic absentee lists, substitution audit logs, and exportable official CBSE/KV registers.',
    proTip: 'Filter by date range and class section to generate instant high-resolution PDF rosters ready for administrative sign-off.',
    badge: 'Reports',
    color: '#22c55e',
    standardLocation: 'Sidebar → Management → Reports',
    liteLocation: 'Dock of Tabs → Core Operations → Reports & Analytics',
  },
  {
    id: 'access',
    tabId: 'access',
    icon: UserCog,
    title: 'User Roles & Staff Permissions',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Role-based access security for Principals, Admins, Teachers, and Gate Operators with granular section permission controls.',
    proTip: 'Teachers can be restricted to only view and manage attendance for their designated class sections.',
    badge: 'Security',
    color: '#ec4899',
    standardLocation: 'Sidebar → Management → Access',
    liteLocation: 'Dock of Tabs → Safety & Comms → User & Staff Permissions',
  },
  {
    id: 'notifications',
    tabId: 'notifications',
    icon: Bell,
    title: 'Parent Broadcast & Circulars',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Multi-channel circular dispatch via WhatsApp, SMS, and Email with dynamic placeholders for student names, classes, and attendance status.',
    proTip: 'Use smart templates to automatically send custom absence alerts to parents of late or absent students at morning cutoff.',
    badge: 'Messaging',
    color: '#f59e0b',
    standardLocation: 'Sidebar → Management → Notifications',
    liteLocation: 'Dock of Tabs → Safety & Comms → Broadcast Notifications',
  },
  {
    id: 'inbox',
    tabId: 'inbox',
    icon: Mail,
    title: 'Administration Inbox & Queries',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Incoming administrative communications, parent queries, teacher leave notes, and formal approval requests.',
    proTip: 'Review and approve teacher leave applications directly from the inbox to automatically trigger timetable substitutions.',
    badge: 'Inbox',
    color: '#a855f7',
    standardLocation: 'Sidebar → Management → Inbox',
    liteLocation: 'Dock of Tabs → Safety & Comms → Administration Inbox',
  },
  {
    id: 'notif-log',
    tabId: 'notif-log',
    icon: MessageSquareText,
    title: 'Notification Delivery & Audit Logs',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Detailed audit trail of all sent SMS, WhatsApp, and Push circulars with real-time delivery statuses and retry logs.',
    proTip: 'Monitor failed SMS transmissions to instantly detect incorrect parent phone numbers.',
    badge: 'Audit Log',
    color: '#0284c7',
    standardLocation: 'Sidebar → Management → Delivery Log',
    liteLocation: 'Dock of Tabs → Safety & Comms → Notification Delivery Logs',
  },
  {
    id: 'emergency',
    tabId: 'emergency',
    icon: Siren,
    title: 'Emergency Siren & Campus Lockdown',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Broadcast high-priority emergency sirens (Fire, Lockdown, Medical, Earthquake) to all school gates, teacher devices, and parent phones with instant override.',
    proTip: 'Emergency alerts override silent mode and trigger persistent audible sirens across all active school terminals.',
    badge: 'Critical Safety',
    color: '#ef4444',
    standardLocation: 'Sidebar → Management → Emergency',
    liteLocation: 'Dock of Tabs → Safety & Comms → Emergency Alert Command',
  },
  {
    id: 'gatepass',
    tabId: 'gatepass',
    icon: QrCode,
    title: 'Gate Pass QR Verification & Security',
    category: 'Core Operations',
    standardGroup: 'Management',
    description: 'Manage digital student exit permits, visitor entry passes, and cryptographic QR code validation for gate security personnel.',
    proTip: 'Approved gate passes instantly alert gate guards upon student QR scan and log departure timestamps.',
    badge: 'Gate Pass',
    color: '#14b8a6',
    standardLocation: 'Sidebar → Management → Gate Passes',
    liteLocation: 'Dock of Tabs → Core Operations → Gate Pass Manager',
  },
  {
    id: 'settings',
    tabId: 'settings',
    icon: Settings,
    title: 'Morning Cutoff & Policies',
    category: 'Safety & Comms',
    standardGroup: 'Management',
    description: 'Set official school start time, morning late entry grace period (e.g. 08:30 AM), automated notification triggers, and pilot testing settings.',
    proTip: 'Attendance scanned before cutoff is logged as "Present"; attendance scanned during grace period is automatically flagged as "Late".',
    badge: 'Policy',
    color: '#64748b',
    standardLocation: 'Sidebar → Management → Settings',
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
  const [viewMode, setViewMode] = useState<'walkthrough' | 'explainer' | 'knowledge-base'>('walkthrough');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeExplainerSection, setActiveExplainerSection] = useState<'sidebar' | 'header' | 'metrics' | 'stage' | 'shortcuts'>('sidebar');
  const isMobile = useIsMobile();
  const { trigger: haptic } = useHapticFeedback();

  // First time check
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
      } else if (e.key === 'ArrowRight') {
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
      const matchesCategory =
        selectedCategory === 'All' ||
        m.category === selectedCategory ||
        m.standardGroup === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.standardGroup.toLowerCase().includes(q) ||
        m.standardLocation.toLowerCase().includes(q) ||
        m.liteLocation.toLowerCase().includes(q) ||
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
          title="Open Interactive Admin Guide & Standard Mode Layout Explainer"
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
          title="Admin Tutorial & Standard Mode Layout Explainer"
        >
          <HelpCircle className="h-4 w-4 text-slate-500 group-hover:text-blue-500 transition-colors" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        </Button>
      )}

      {/* Main Interactive Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-5 md:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClose}
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
            />

            {/* Modal Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 14 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32, mass: 0.6 }}
              className="relative w-full max-w-3xl rounded-3xl border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 shadow-2xl backdrop-blur-2xl overflow-hidden z-10 flex flex-col max-h-[92vh]"
            >
              {/* Top Accent Gradient Bar */}
              <div
                className="h-1.5 w-full transition-all duration-300 shrink-0"
                style={{
                  background:
                    viewMode === 'walkthrough'
                      ? `linear-gradient(90deg, ${currentStep.color}, #3b82f6)`
                      : viewMode === 'explainer'
                      ? 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)'
                      : 'linear-gradient(90deg, #06b6d4, #3b82f6, #ec4899)',
                }}
              />

              {/* Header */}
              <div className="p-3.5 sm:p-5 border-b border-slate-200/70 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 border border-white/20 shrink-0">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                        Admin Command Center Guide
                      </h2>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider py-0 px-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        {mode === 'lite' ? '⚡ Lite Mode' : '✨ Standard Mode'}
                      </Badge>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      PM Shri KV NFC Vigyan Vihar · Master layout architecture & operations
                    </p>
                  </div>
                </div>

                {/* Navigation View Switcher */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-white/5 shrink-0 overflow-x-auto">
                    <button
                      onClick={() => {
                        haptic('selection');
                        setViewMode('walkthrough');
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                        viewMode === 'walkthrough'
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      Tour
                    </button>
                    <button
                      onClick={() => {
                        haptic('selection');
                        setViewMode('explainer');
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1",
                        viewMode === 'explainer'
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      <Layers className="w-3 h-3 text-indigo-500" />
                      <span>Layout Explainer</span>
                    </button>
                    <button
                      onClick={() => {
                        haptic('selection');
                        setViewMode('knowledge-base');
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
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
                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                    title="Close Tutorial"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6 space-y-4">
                {/* 1. STEP-BY-STEP GUIDED WALKTHROUGH */}
                {viewMode === 'walkthrough' && (
                  <div className="space-y-4">
                    {/* Progress Strip */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          Module {currentStepIndex + 1} of {TUTORIAL_MODULES.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] font-mono py-0 px-1.5">
                            {currentStep.standardGroup}
                          </Badge>
                          <span className="font-mono text-[11px]">
                            {Math.round(progressPercent)}%
                          </span>
                        </div>
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
                        className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 space-y-4 relative overflow-hidden shadow-xs"
                      >
                        {/* Soft background ambient glow */}
                        <div
                          className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-20"
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
                              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                <span>Category: {currentStep.category}</span>
                                <span>•</span>
                                <span className="text-blue-600 dark:text-blue-400">Sidebar: {currentStep.standardGroup}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed relative z-10">
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

                        {/* Location Navigation & Jump */}
                        <div className="rounded-xl border border-slate-200/80 dark:border-white/5 bg-white/90 dark:bg-slate-900/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                              <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>
                                <strong>Standard Mode: </strong>
                                <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {currentStep.standardLocation}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>
                                <strong>Lite Mode: </strong>
                                <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  {currentStep.liteLocation}
                                </span>
                              </span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleJumpToModule(currentStep.tabId)}
                            className="h-8 px-3.5 text-xs font-bold rounded-xl text-white cursor-pointer shadow-sm shrink-0 self-start sm:self-auto"
                            style={{ backgroundColor: currentStep.color }}
                          >
                            <span>Open Module</span>
                            <ExternalLink className="w-3 h-3 ml-1.5" />
                          </Button>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    {/* Step Selector Dots */}
                    <div className="flex items-center justify-center gap-1.5 py-1 overflow-x-auto no-scrollbar">
                      {TUTORIAL_MODULES.map((step, idx) => (
                        <button
                          key={step.id}
                          onClick={() => {
                            haptic('selection');
                            setCurrentStepIndex(idx);
                          }}
                          className="p-1 cursor-pointer group shrink-0"
                          title={`${idx + 1}. ${step.title}`}
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
                )}

                {/* 2. STANDARD MODE UI LAYOUT EXPLAINER & ARCHITECTURE */}
                {viewMode === 'explainer' && (
                  <div className="space-y-4">
                    {/* Explainer Intro Card */}
                    <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-purple-500/10 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          Standard Mode Layout Architecture
                        </h3>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        The Standard Mode Admin Command Center is engineered with a modular macOS/iOS Nano-Glass design. It provides desktop multi-tasking, collapsible sidebar groupings, real-time database feeds, and high-density operational telemetry.
                      </p>
                    </div>

                    {/* Interactive Layout Section Selector */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { id: 'sidebar', label: '1. Sidebar & Groups', icon: FolderKanban, color: 'text-blue-500' },
                        { id: 'header', label: '2. Top Command Bar', icon: Shield, color: 'text-indigo-500' },
                        { id: 'metrics', label: '3. Realtime Metrics', icon: TrendingUp, color: 'text-emerald-500' },
                        { id: 'stage', label: '4. Dynamic Stage', icon: Layers, color: 'text-purple-500' },
                        { id: 'shortcuts', label: '5. Fast Actions', icon: Command, color: 'text-amber-500' },
                      ].map((sec) => (
                        <button
                          key={sec.id}
                          onClick={() => {
                            haptic('selection');
                            setActiveExplainerSection(sec.id as any);
                          }}
                          className={cn(
                            "p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer",
                            activeExplainerSection === sec.id
                              ? "bg-slate-100 dark:bg-slate-800 border-blue-500 shadow-xs"
                              : "border-slate-200/80 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                          )}
                        >
                          <sec.icon className={cn("w-4 h-4", sec.color)} />
                          <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                            {sec.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Detailed Section Explainer Card */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeExplainerSection}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/50 p-4 sm:p-5 space-y-3"
                      >
                        {activeExplainerSection === 'sidebar' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <FolderKanban className="w-4 h-4 text-blue-500" />
                                Collapsible Sidebar Navigation Structure
                              </h4>
                              <Badge variant="outline" className="text-[10px] font-bold">Left Drawer</Badge>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              The left sidebar organizes all 15 administrative features into 3 logical functional groups with collapsible state toggle:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-1">
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">1. Overview Group</span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                  Principal Dashboard, Class & Sections Manager, Master Student Directory.
                                </p>
                              </div>
                              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-1">
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">2. Registration Group</span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                  Batch ID Card Extractor, Student Identity Cards & Profile Manager.
                                </p>
                              </div>
                              <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-1">
                                <span className="text-xs font-bold text-purple-600 dark:text-purple-400">3. Management Group</span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                  Reports, User Access, Broadcast Notifications, Face Samples, Timetables, Emergency, Gate Passes, Settings.
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-white/5">
                              <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>Use the bottom collapse arrow (<ChevronRight className="w-3 h-3 inline" />) to shrink the sidebar into an icon-only quick dock.</span>
                            </div>
                          </div>
                        )}

                        {activeExplainerSection === 'header' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Shield className="w-4 h-4 text-indigo-500" />
                                Executive Nano-Glass Header Bar
                              </h4>
                              <Badge variant="outline" className="text-[10px] font-bold">Top Bar</Badge>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              Positioned at the top of the main stage, the command bar provides contextual information and instantaneous management actions:
                            </p>
                            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-disc pl-4">
                              <li><strong>Active Module Title & Context:</strong> Shows the active panel name with the institutional identifier (PM Shri KV NFC).</li>
                              <li><strong>Interactive Tutorial Pill:</strong> One-tap access to guided tours, knowledge base search, and layout explainers.</li>
                              <li><strong>Live Data Refresh:</strong> Pulls latest biometric records and gate entries from Supabase without full page reloading.</li>
                              <li><strong>Theme Switcher:</strong> Instantly switch between Deep Dark Mode and Crisp Light Mode.</li>
                            </ul>
                          </div>
                        )}

                        {activeExplainerSection === 'metrics' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                Live Campus Metric Strip
                              </h4>
                              <Badge variant="outline" className="text-[10px] font-bold">Sub-Header</Badge>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              Real-time telemetry updated via Supabase Postgres WebSocket changes whenever face attendance or gate scans occur:
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
                                <span className="text-[10px] font-bold uppercase text-slate-500">Registered</span>
                                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">Total Faces</div>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
                                <span className="text-[10px] font-bold uppercase text-slate-500">Present</span>
                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Today's Check-ins</div>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
                                <span className="text-[10px] font-bold uppercase text-slate-500">Late</span>
                                <div className="text-sm font-bold text-amber-600 dark:text-amber-400">Post-Cutoff</div>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60">
                                <span className="text-[10px] font-bold uppercase text-slate-500">Total Scans</span>
                                <div className="text-sm font-bold text-purple-600 dark:text-purple-400">Campus Flow</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeExplainerSection === 'stage' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Layers className="w-4 h-4 text-purple-500" />
                                Dynamic Stage & Zero-Jank Lazy Loading
                              </h4>
                              <Badge variant="outline" className="text-[10px] font-bold">Content Area</Badge>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              Each admin tab is dynamically lazy-loaded with individual error boundaries and smooth Framer Motion spring transitions:
                            </p>
                            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-disc pl-4">
                              <li><strong>Optimized Bundle Size:</strong> Heavy charting, PDF export, and biometric engines are split into independent asynchronous chunks.</li>
                              <li><strong>Error Containment:</strong> If any network error occurs on a single module, only that panel shows a retry card without crashing the rest of the dashboard.</li>
                              <li><strong>Pull-to-Refresh & Scroll Management:</strong> Smooth native scrolling with touch gesture pull-to-refresh on tablet and mobile viewports.</li>
                            </ul>
                          </div>
                        )}

                        {activeExplainerSection === 'shortcuts' && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Command className="w-4 h-4 text-amber-500" />
                                Power User Shortcuts & Fast Actions
                              </h4>
                              <Badge variant="outline" className="text-[10px] font-bold">Hotkeys</Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 flex items-center justify-between">
                                <span className="text-slate-700 dark:text-slate-300">Navigate Guide</span>
                                <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">← / → Arrows</span>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 flex items-center justify-between">
                                <span className="text-slate-700 dark:text-slate-300">Close Guide</span>
                                <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">ESC</span>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 flex items-center justify-between">
                                <span className="text-slate-700 dark:text-slate-300">Emergency Broadcast</span>
                                <span className="font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded text-[11px]">Sidebar → Emergency</span>
                              </div>
                              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 flex items-center justify-between">
                                <span className="text-slate-700 dark:text-slate-300">Attendance CSV Export</span>
                                <span className="font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-[11px]">Sidebar Bottom Dock</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}

                {/* 3. KNOWLEDGE BASE & INSTANT MODULE LAUNCHER */}
                {viewMode === 'knowledge-base' && (
                  <div className="space-y-4">
                    {/* Search & Category Filter */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          placeholder="Search operations, AI features, reports, alerts, sidebar paths..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 h-9 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-white/10"
                        />
                      </div>

                      <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {['All', 'Overview', 'Registration', 'Management', 'Core Operations', 'Students & AI', 'Safety & Comms'].map((cat) => (
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
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

                              <div className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-200/50 dark:border-white/5 truncate">
                                📍 {module.standardLocation}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-white/5">
                              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
                                {module.standardGroup} • {module.category}
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
              <div className="p-3.5 sm:p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between gap-3 shrink-0">
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
                      Showing <strong>{viewMode === 'explainer' ? 'Standard UI Architecture' : `${filteredModules.length} institutional modules`}</strong>
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
