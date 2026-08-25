
import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    positive: boolean;
  };
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  description, 
  icon, 
  trend,
  className 
}: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden hover-lift", className)}>
      <div className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <h3 className="text-2xl font-bold">{value}</h3>
            
            {trend && (
              <div className="flex items-center mt-1">
                <div className={cn(
                  "text-xs font-medium flex items-center",
                  trend.positive ? "text-green-500" : "text-red-500"
                )}>
                  <span className="mr-1">
                    {trend.positive ? '↑' : '↓'}
                  </span>
                  {trend.value}%
                </div>
                <span className="text-xs text-muted-foreground ml-1">vs last period</span>
              </div>
            )}
            
            {description && (
              <p className="text-sm text-muted-foreground mt-2">{description}</p>
            )}
          </div>
          
          {icon && (
            <div className="p-2 rounded-full bg-primary/10 text-primary">
              {icon}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
