import React from 'react';
import TeacherAdminWorkspace from '@/components/teacher/TeacherAdminWorkspace';

const TeacherDashboard: React.FC = () => {
  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto space-y-6">
      <TeacherAdminWorkspace />
    </div>
  );
};

export default TeacherDashboard;
