import React from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { 
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { 
  LayoutDashboard, 
  Users, 
  FolderKanban, 
  Calendar,
  UserPlus,
  Bell,
  Settings,
  Shield,
  FileText,
  Image,
  UserCog,
  Download,
  GraduationCap,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { AnimatedNotificationBadge } from '@/components/ui/animated-notification-badge';

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  notificationCount?: number;
  attendanceUpdated?: boolean;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  onTabChange,
  notificationCount = 0,
  attendanceUpdated = false,
}) => {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const mainNavItems = [
    { 
      id: 'principal', 
      icon: LayoutDashboard, 
      label: 'Dashboard',
      description: 'Overview & stats',
      color: 'from-blue-500 to-blue-600'
    },
    { 
      id: 'categories', 
      icon: FolderKanban, 
      label: 'Categories',
      description: 'Class management',
      color: 'from-purple-500 to-pink-500'
    },
    { 
      id: 'faces', 
      icon: Users, 
      label: 'All Faces',
      description: 'Registered users',
      color: 'from-green-500 to-emerald-500',
      badge: attendanceUpdated ? 'New' : undefined
    },
    { 
      id: 'calendar', 
      icon: Calendar, 
      label: 'Calendar',
      description: 'Attendance records',
      color: 'from-orange-500 to-red-500'
    },
  ];

  const registrationItems = [
    { 
      id: 'register', 
      icon: UserPlus, 
      label: 'Quick Register',
      description: 'Single registration',
      color: 'from-cyan-500 to-blue-500'
    },
    { 
      id: 'idcard', 
      icon: Image, 
      label: 'ID Card Extract',
      description: 'AI batch extraction',
      color: 'from-pink-500 to-rose-500',
      badge: 'AI'
    },
    { 
      id: 'pdf', 
      icon: FileText, 
      label: 'PDF Extract',
      description: 'Document import',
      color: 'from-amber-500 to-orange-500'
    },
  ];

  const managementItems = [
    { 
      id: 'access', 
      icon: UserCog, 
      label: 'Manage Access',
      description: 'User permissions',
      color: 'from-violet-500 to-purple-500'
    },
    { 
      id: 'notifications', 
      icon: Bell, 
      label: 'Notifications',
      description: 'Send alerts',
      color: 'from-yellow-500 to-orange-500',
      count: notificationCount
    },
    { 
      id: 'export', 
      icon: Download, 
      label: 'Export Data',
      description: 'Download reports',
      color: 'from-teal-500 to-cyan-500'
    },
    { 
      id: 'settings', 
      icon: Settings, 
      label: 'Settings',
      description: 'Configuration',
      color: 'from-slate-500 to-slate-600'
    },
  ];

  const renderNavItem = (item: typeof mainNavItems[0] & { count?: number }) => {
    const isActive = activeTab === item.id;
    const Icon = item.icon;
    const itemCount = 'count' in item ? item.count : undefined;

    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          onClick={() => onTabChange(item.id)}
          className={`group relative w-full transition-all duration-200 ${
            isActive 
              ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25' 
              : 'hover:bg-muted/50'
          }`}
        >
          <div className={`flex items-center gap-3 w-full ${isCollapsed ? 'justify-center' : ''}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              isActive 
                ? 'bg-white/20' 
                : `bg-gradient-to-br ${item.color} shadow-lg`
            }`}>
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white'}`} />
            </div>
            
            {!isCollapsed && (
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-sm ${isActive ? 'text-white' : ''}`}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-green-500 text-white border-0">
                      {item.badge}
                    </Badge>
                  )}
                  {itemCount !== undefined && itemCount > 0 && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-red-500 text-white border-0">
                      {itemCount}
                    </Badge>
                  )}
                </div>
                <span className={`text-xs ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {item.description}
                </span>
              </div>
            )}
            
            {!isCollapsed && (
              <ChevronRight className={`w-4 h-4 transition-transform ${
                isActive ? 'text-white rotate-90' : 'text-muted-foreground group-hover:translate-x-1'
              }`} />
            )}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar 
      className="border-r border-blue-100 dark:border-blue-900/50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl"
      collapsible="icon"
    >
      <div className="p-4 border-b border-blue-100 dark:border-blue-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="font-bold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Admin Panel
              </h2>
              <p className="text-xs text-muted-foreground">Management Dashboard</p>
            </div>
          )}
        </div>
      </div>

      <SidebarContent className="py-2">
        <SidebarGroup>
          {!isCollapsed && (
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
              Main Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {mainNavItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          {!isCollapsed && (
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Registration
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {registrationItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          {!isCollapsed && (
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
              Management
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2">
              {managementItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto p-4 border-t border-blue-100 dark:border-blue-900/50">
        <SidebarTrigger className="w-full" />
      </div>
    </Sidebar>
  );
};

export default AdminSidebar;
