import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  LayoutGrid,
  Check,
  Smartphone,
  Tv,
  Eye,
  ChevronDown,
} from 'lucide-react';
import {
  AndroidWidgetItem,
  AndroidWidgetSize,
  AndroidWidgetCatalogEntry,
  MaterialPalette,
  DEFAULT_ANDROID_WIDGETS,
} from './types';
import { AndroidWidgetContainer } from './AndroidWidgetContainer';
import { AndroidWidgetDrawer } from './AndroidWidgetDrawer';
import { AttendanceKpiWidget } from './AttendanceKpiWidget';
import { TimetablePeriodWidget } from './TimetablePeriodWidget';
import { GatePassQuickWidget } from './GatePassQuickWidget';
import { AbsenteeBlastWidget } from './AbsenteeBlastWidget';
import { StudentPickerWidget } from './StudentPickerWidget';
import { DecibelMeterWidget } from './DecibelMeterWidget';
import { StopwatchWidget } from './StopwatchWidget';
import { EmergencyAlertWidget } from './EmergencyAlertWidget';
import { SmartBoardFloatingDock } from '../smartboard/SmartBoardFloatingDock';
import { ClassStudent, ClassAssignment } from '@/components/teacher/TeacherAdminWorkspace';

interface AndroidWidgetBoardProps {
  students: ClassStudent[];
  activeClass: ClassAssignment | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenAbsenteeManager?: () => void;
  onOpenIssuePass?: () => void;
  onOpenScanPass?: () => void;
}

const STORAGE_KEY = 'presences:android_widgets_layout_v2';

export const AndroidWidgetBoard: React.FC<AndroidWidgetBoardProps> = ({
  students,
  activeClass,
  onRefresh,
  isRefreshing,
  onOpenAbsenteeManager,
  onOpenIssuePass,
  onOpenScanPass,
}) => {
  const navigate = useNavigate();
  const [widgets, setWidgets] = useState<AndroidWidgetItem[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_ANDROID_WIDGETS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_ANDROID_WIDGETS;
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch {}
  }, [widgets]);

  const handleUpdateWidget = (id: string, updates: Partial<AndroidWidgetItem>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  };

  const handleRemoveWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const handleAddWidget = (
    entry: AndroidWidgetCatalogEntry,
    size: AndroidWidgetSize,
    palette: MaterialPalette
  ) => {
    const newWidget: AndroidWidgetItem = {
      id: `w-${entry.type}-${Date.now()}`,
      type: entry.type,
      title: entry.title,
      size,
      palette,
      pinned: false,
      order: widgets.length,
    };
    setWidgets((prev) => [...prev, newWidget]);
  };

  const handleResetDefaults = () => {
    setWidgets(DEFAULT_ANDROID_WIDGETS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  // Sort: pinned first, then order
  const sortedWidgets = [...widgets].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.order - b.order;
  });

  return (
    <div className="space-y-4 relative">
      {/* Top Android & Smart Board Widget Control Bar */}
      <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-3xl bg-card/80 border border-border/80 backdrop-blur-xl shadow-sm flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-foreground tracking-tight">
                Device Widgets & Classroom Board
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                Material You M3
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">
              Glanceable cards & 1-tap quick actions for Class {activeClass?.category || 'Active'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/smartboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 transition-all active:scale-95 shadow-xs"
            title="Launch Fullscreen Smart Board Display"
          >
            <Tv className="h-3.5 w-3.5" />
            <span>Smart Board Display</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-bold border transition-all active:scale-95 ${
              isEditMode
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border-border/80'
            }`}
          >
            {isEditMode ? <Check className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
            {isEditMode ? 'Done Customizing' : 'Customize'}
          </button>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-extrabold shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" /> Add Widget
          </button>
        </div>
      </div>

      {/* Android Widgets Dynamic CSS Grid Canvas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
        <AnimatePresence>
          {sortedWidgets.map((widget) => {
            return (
              <AndroidWidgetContainer
                key={widget.id}
                widget={widget}
                isEditMode={isEditMode}
                onUpdateWidget={handleUpdateWidget}
                onRemoveWidget={handleRemoveWidget}
              >
                {widget.type === 'attendance_kpi' && (
                  <AttendanceKpiWidget
                    widget={widget}
                    students={students}
                    activeClassName={activeClass?.category}
                    onRefresh={onRefresh}
                    isRefreshing={isRefreshing}
                  />
                )}

                {widget.type === 'timetable_period' && (
                  <TimetablePeriodWidget
                    widget={widget}
                    classNameStr={activeClass?.category}
                  />
                )}

                {widget.type === 'gate_pass' && (
                  <GatePassQuickWidget
                    widget={widget}
                    classNameStr={activeClass?.category}
                    onOpenIssuePass={onOpenIssuePass}
                    onOpenScanPass={onOpenScanPass}
                  />
                )}

                {widget.type === 'absentee_blast' && (
                  <AbsenteeBlastWidget
                    widget={widget}
                    students={students}
                    activeClassName={activeClass?.category}
                    onOpenAbsenteeManager={onOpenAbsenteeManager}
                  />
                )}

                {widget.type === 'student_picker' && (
                  <StudentPickerWidget
                    widget={widget}
                    students={students}
                  />
                )}

                {widget.type === 'decibel_meter' && (
                  <DecibelMeterWidget widget={widget} />
                )}

                {widget.type === 'stopwatch_timer' && (
                  <StopwatchWidget widget={widget} />
                )}

                {widget.type === 'emergency_alert' && (
                  <EmergencyAlertWidget
                    widget={widget}
                    classNameStr={activeClass?.category}
                  />
                )}
              </AndroidWidgetContainer>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Widget Catalog Drawer / Modal */}
      <AndroidWidgetDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAddWidget={handleAddWidget}
        onResetDefaults={handleResetDefaults}
        existingWidgets={widgets}
      />

      {/* Floating Smart Board Touch Assistive Dock */}
      <SmartBoardFloatingDock
        students={students}
        activeClassName={activeClass?.category}
      />
    </div>
  );
};
