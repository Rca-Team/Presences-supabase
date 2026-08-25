
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AttendanceToday from './AttendanceToday';
import AttendanceStats from './AttendanceStats';
import { Bell, BookOpen, LineChart } from 'lucide-react';

const AttendanceSidebar = () => {
  return (
    <div className="space-y-6 animate-slide-in-right">
      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid w-full grid-cols-2 p-1 school-card">
          <TabsTrigger value="today" className="flex items-center gap-2 py-2">
            <Bell className="h-4 w-4 text-[hsl(var(--school-blue))]" />
            <span>Today</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex items-center gap-2 py-2">
            <LineChart className="h-4 w-4 text-[hsl(var(--school-green))]" />
            <span>Stats</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="today" className="space-y-4 pt-4 relative">
          <div className="absolute top-2 right-2 opacity-10 pointer-events-none">
            <BookOpen className="h-20 w-20 text-[hsl(var(--school-blue))]" />
          </div>
          <AttendanceToday />
        </TabsContent>
        
        <TabsContent value="stats" className="space-y-4 pt-4 relative">
          <div className="absolute top-2 right-2 opacity-10 pointer-events-none">
            <LineChart className="h-20 w-20 text-[hsl(var(--school-green))]" />
          </div>
          <AttendanceStats />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceSidebar;
