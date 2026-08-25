import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole, type UserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

interface RoleRouteProps {
  roles: UserRole[];
  children: React.ReactNode;
  /** Where to send users who don't have one of the allowed roles. */
  fallback?: string;
}

/**
 * Gates a route by Supabase user-role. Loading shows a spinner;
 * unauthorised users are redirected to /login (or `fallback`).
 */
const RoleRoute: React.FC<RoleRouteProps> = ({ roles, children, fallback = '/login' }) => {
  const { role, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!role || !roles.includes(role)) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default RoleRoute;