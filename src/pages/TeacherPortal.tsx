import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';
import TeacherAdminWorkspace from '@/components/teacher/TeacherAdminWorkspace';

const TeacherPortal: React.FC = () => {
  const navigate = useNavigate();
  const { role, isLoading: roleLoading } = useUserRole();

  useEffect(() => {
    if (roleLoading) return;
    if (!role || !['teacher', 'admin', 'principal'].includes(role)) {
      navigate('/login', { replace: true });
    }
  }, [role, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-background pb-12">
        <div className="container mx-auto px-3 py-4 max-w-6xl">
          <TeacherAdminWorkspace />
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default TeacherPortal;