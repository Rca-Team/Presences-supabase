import React from 'react';
import PageLayout from '@/components/layouts/PageLayout';
import PracticalNotificationGuide from '@/components/admin/PracticalNotificationGuide';

const NotificationDemo = () => {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-8">
        <PracticalNotificationGuide />
      </div>
    </PageLayout>
  );
};

export default NotificationDemo;