import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import TeacherAdminWorkspace from '@/components/teacher/TeacherAdminWorkspace';
import { parseClassSection } from '@/utils/teacherAccess';

const TeacherPortal: React.FC = () => {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId?: string }>();
  const { role, isLoading: roleLoading } = useUserRole();
  const { preference, setPreference } = usePerformanceMode();

  // Default to Lite Mode for fast, battery-optimized teacher portal experience
  useEffect(() => {
    try {
      const stored = localStorage.getItem('presences:lite-mode');
      if (stored !== 'off' && preference !== 'on') {
        setPreference('on');
      }
    } catch {}
  }, [preference, setPreference]);

  useEffect(() => {
    if (roleLoading) return;
    if (!role) {
      navigate('/login?redirectTo=/teacher', { replace: true });
      return;
    }
    if (role !== 'teacher' && role !== 'admin' && role !== 'principal') {
      navigate('/attendance', { replace: true });
    }
  }, [role, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const initialClass = classId ? (() => {
    const parsed = parseClassSection(classId);
    return parsed ? { class: parsed.className, section: parsed.section, category: classId.toUpperCase() } : undefined;
  })() : undefined;

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-background pb-20 md:pb-12">
        <div className="container mx-auto px-2.5 sm:px-3 py-3 sm:py-4 max-w-6xl">
          <TeacherAdminWorkspace initialClass={initialClass} />
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default TeacherPortal;