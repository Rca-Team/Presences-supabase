import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CategoryBreakdownProps {
  data: Array<{
    category: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    color: string;
  }>;
  className?: string;
}

export const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  data,
  className
}) => {
  const total = data.reduce((sum, item) => sum + item.total, 0);

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Category Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Pie chart visualization using CSS */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative h-40 w-40">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              {data.reduce<{ elements: JSX.Element[]; offset: number }>(
                (acc, item, index) => {
                  const percentage = total > 0 ? (item.total / total) * 100 : 0;
                  const circumference = 2 * Math.PI * 40;
                  const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                  const strokeDashoffset = -acc.offset;

                  acc.elements.push(
                    <circle
                      key={item.category}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      strokeWidth="20"
                      stroke={item.color}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-500"
                    />
                  );

                  acc.offset += (percentage / 100) * circumference;
                  return acc;
                },
                { elements: [], offset: 0 }
              ).elements}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legend and details */}
        <div className="space-y-3">
          {data.map((item) => {
            const rate = item.total > 0 ? Math.round((item.present / item.total) * 100) : 0;
            
            return (
              <div key={item.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-sm">Category {item.category}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{item.total} students</span>
                  <span className={cn(
                    'font-medium',
                    rate >= 80 && 'text-green-500',
                    rate >= 60 && rate < 80 && 'text-yellow-500',
                    rate < 60 && 'text-red-500'
                  )}>
                    {rate}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
