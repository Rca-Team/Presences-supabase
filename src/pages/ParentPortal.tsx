import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  DoorOpen,
  Users,
  Trophy,
  RefreshCw,
  LogOut,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/Logo';
import { useParentPortal } from '@/hooks/useParentPortal';
import { ParentAuthCard } from '@/components/parent/ParentAuthCard';
import { ParentHeroCard } from '@/components/parent/ParentHeroCard';
import { ParentAttendanceCalendar } from '@/components/parent/ParentAttendanceCalendar';
import { ParentLiveTimetable } from '@/components/parent/ParentLiveTimetable';
import { ParentLeaveManager } from '@/components/parent/ParentLeaveManager';
import { ParentGateFeed } from '@/components/parent/ParentGateFeed';
import { ParentFacultyDirectory } from '@/components/parent/ParentFacultyDirectory';
import { ParentAchievementsHub } from '@/components/parent/ParentAchievementsHub';
import { ParentReportCardModal } from '@/components/parent/ParentReportCardModal';

export default function ParentPortal() {
  const {
    child,
    savedChildren,
    studentIdInput,
    phoneInput,
    isLoading,
    hasSearched,
    isLive,
    attendance,
    gateLogs,
    leaves,
    badges,
    summary,
    setStudentIdInput,
    setPhoneInput,
    lookupStudent,
    switchChild,
    submitLeave,
    logout,
  } = useParentPortal();

  const [activeTab, setActiveTab] = useState<'attendance' | 'timetable' | 'leaves' | 'gate' | 'teachers' | 'achievements'>('attendance');
  const [showReportModal, setShowReportModal] = useState(false);

  const handleRefresh = () => {
    if (child && child.parent_phone) {
      lookupStudent(child.employee_id, child.parent_phone);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/80 px-4 py-3 backdrop-blur-2xl shadow-xs">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-muted">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Logo />
            <div className="hidden sm:block">
              <h1 className="text-sm font-black text-foreground leading-tight">
                Parent Portal
              </h1>
              <p className="text-[10px] font-semibold text-muted-foreground">
                PM Shri KV NFC Vigyan Vihar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {child && (
              <>
                <Badge
                  variant="outline"
                  className="gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold bg-background/60 border-border/80"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isLive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                    }`}
                  />
                  <span className="hidden sm:inline">{isLive ? 'Realtime Connected' : 'Auto Syncing'}</span>
                </Badge>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  onClick={handleRefresh}
                  title="Refresh records"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="rounded-xl text-xs text-muted-foreground hover:text-destructive h-8 px-2.5"
                >
                  <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Switch Child</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 pb-24">
        {!child ? (
          /* 1. Login / Student Lookup Card */
          <ParentAuthCard
            studentId={studentIdInput}
            phone={phoneInput}
            isLoading={isLoading}
            savedChildren={savedChildren}
            onStudentIdChange={setStudentIdInput}
            onPhoneChange={setPhoneInput}
            onSearch={(id, phone) => lookupStudent(id, phone)}
            onSelectSibling={switchChild}
          />
        ) : (
          /* 2. Full Active Student Dashboard */
          <AnimatePresence mode="wait">
            <motion.div
              key={child.employee_id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Primary Live Presence Hero Card */}
              <ParentHeroCard
                child={child}
                summary={summary}
                isLive={isLive}
                onOpenLeaveModal={() => setActiveTab('leaves')}
                onOpenTimetableTab={() => setActiveTab('timetable')}
                onOpenReportModal={() => setShowReportModal(true)}
                savedChildren={savedChildren}
                onSelectSibling={switchChild}
                onLogout={logout}
              />

              {/* Main Feature Tabs */}
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as any)}
                className="w-full space-y-4"
              >
                {/* Horizontal Tab Navigation Bar */}
                <div className="overflow-x-auto pb-1">
                  <TabsList className="bg-card/80 backdrop-blur-xl border border-border/80 p-1 rounded-2xl h-11 inline-flex w-full sm:w-auto min-w-full sm:min-w-0 justify-start">
                    <TabsTrigger
                      value="attendance"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <Calendar className="h-3.5 w-3.5" /> Attendance
                    </TabsTrigger>
                    <TabsTrigger
                      value="timetable"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <Clock className="h-3.5 w-3.5" /> Timetable
                    </TabsTrigger>
                    <TabsTrigger
                      value="leaves"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <FileText className="h-3.5 w-3.5" /> Apply Leave
                      {leaves.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-background/30 text-[10px]">
                          {leaves.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="gate"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <DoorOpen className="h-3.5 w-3.5" /> Gate Logs
                    </TabsTrigger>
                    <TabsTrigger
                      value="teachers"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <Users className="h-3.5 w-3.5" /> Teachers Desk
                    </TabsTrigger>
                    <TabsTrigger
                      value="achievements"
                      className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3.5"
                    >
                      <Trophy className="h-3.5 w-3.5 text-amber-500" /> Badges
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab 1: Attendance Calendar */}
                <TabsContent value="attendance" className="mt-0 focus-visible:outline-none">
                  <ParentAttendanceCalendar attendance={attendance} summary={summary} />
                </TabsContent>

                {/* Tab 2: Live Class Timetable */}
                <TabsContent value="timetable" className="mt-0 focus-visible:outline-none">
                  <ParentLiveTimetable child={child} />
                </TabsContent>

                {/* Tab 3: Leave Manager */}
                <TabsContent value="leaves" className="mt-0 focus-visible:outline-none">
                  <ParentLeaveManager child={child} leaves={leaves} onSubmitLeave={submitLeave} />
                </TabsContent>

                {/* Tab 4: Gate Logs */}
                <TabsContent value="gate" className="mt-0 focus-visible:outline-none">
                  <ParentGateFeed child={child} />
                </TabsContent>

                {/* Tab 5: Faculty Directory */}
                <TabsContent value="teachers" className="mt-0 focus-visible:outline-none">
                  <ParentFacultyDirectory child={child} />
                </TabsContent>

                {/* Tab 6: Achievements */}
                <TabsContent value="achievements" className="mt-0 focus-visible:outline-none">
                  <ParentAchievementsHub child={child} summary={summary} badges={badges} />
                </TabsContent>
              </Tabs>
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Printable Report Modal */}
      {child && (
        <ParentReportCardModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          child={child}
          summary={summary}
          attendance={attendance}
        />
      )}
    </div>
  );
}
