import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Shield, User } from 'lucide-react';

type StatusType = 'present' | 'absent' | 'late' | 'pending' | 'unauthorized' | 'registered';

interface StatusBadgeProps {
  status: StatusType;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  className?: string;
}

const statusConfig: Record<StatusType, {
  label: string;
  icon: typeof CheckCircle2;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  present: {
    label: 'Present',
    icon: CheckCircle2,
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-500',
    borderClass: 'border-green-500/30',
  },
  absent: {
    label: 'Absent',
    icon: XCircle,
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-500',
    borderClass: 'border-red-500/30',
  },
  late: {
    label: 'Late',
    icon: Clock,
    bgClass: 'bg-yellow-500/10',
    textClass: 'text-yellow-500',
    borderClass: 'border-yellow-500/30',
  },
  pending: {
    label: 'Pending',
    icon: AlertTriangle,
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-500',
    borderClass: 'border-orange-500/30',
  },
  unauthorized: {
    label: 'Unauthorized',
    icon: Shield,
    bgClass: 'bg-destructive/10',
    textClass: 'text-destructive',
    borderClass: 'border-destructive/30',
  },
  registered: {
    label: 'Registered',
    icon: User,
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-500',
    borderClass: 'border-blue-500/30',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
  lg: 'px-3 py-1.5 text-base gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showIcon = true,
  size = 'md',
  animated = false,
  className
}) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        config.bgClass,
        config.textClass,
        config.borderClass,
        sizeClasses[size],
        animated && 'animate-pulse',
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{config.label}</span>
    </span>
  );
};
