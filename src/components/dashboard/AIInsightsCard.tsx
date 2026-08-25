import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Shield, Brain } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAIInsights } from '@/hooks/useAIInsights';
import { Skeleton } from '@/components/ui/skeleton';

interface AIInsightsCardProps {
  userId?: string;
}

const AIInsightsCard: React.FC<AIInsightsCardProps> = ({ userId }) => {
  const { generateAttendancePrediction, detectAnomalies, getPerformanceInsights, isGenerating } = useAIInsights();

  const { data: insights, isLoading, refetch } = useQuery<any[]>({
    queryKey: ['aiInsights', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('ai_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!userId
  });

  const handleGenerateInsight = async (type: 'attendance_prediction' | 'anomaly_detection' | 'performance_insights') => {
    if (!userId) return;
    
    switch (type) {
      case 'attendance_prediction':
        await generateAttendancePrediction(userId);
        break;
      case 'anomaly_detection':
        await detectAnomalies(userId);
        break;
      case 'performance_insights':
        await getPerformanceInsights(userId);
        break;
    }
    
    refetch();
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'attendance_prediction':
        return <TrendingUp className="h-4 w-4" />;
      case 'anomaly_detection':
        return <Shield className="h-4 w-4" />;
      case 'performance_insights':
        return <Brain className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <Card className="glass-panel mobile-friendly-spacing">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500 animate-pulse-subtle" />
              AI-Powered Insights
            </CardTitle>
            <CardDescription className="responsive-text">
              Smart analytics and predictions
            </CardDescription>
          </div>
          <Badge variant="secondary" className="bg-purple-500/10 text-purple-700 dark:text-purple-300">
            <Sparkles className="h-3 w-3 mr-1" />
            AI
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateInsight('attendance_prediction')}
            disabled={isGenerating || !userId}
            className="mobile-touch-target w-full"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            <span className="text-xs sm:text-sm">Predict</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateInsight('anomaly_detection')}
            disabled={isGenerating || !userId}
            className="mobile-touch-target w-full"
          >
            <Shield className="h-4 w-4 mr-2" />
            <span className="text-xs sm:text-sm">Detect</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerateInsight('performance_insights')}
            disabled={isGenerating || !userId}
            className="mobile-touch-target w-full"
          >
            <Brain className="h-4 w-4 mr-2" />
            <span className="text-xs sm:text-sm">Analyze</span>
          </Button>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : insights && insights.length > 0 ? (
            insights.map((insight: any) => (
              <div
                key={insight.id}
                className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getInsightIcon(insight.insight_type)}
                    <Badge variant="outline" className="text-xs">
                      {insight.insight_type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(insight.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                {insight.data?.insights && (
                  <ul className="text-sm space-y-1 mt-2">
                    {insight.data.insights.slice(0, 2).map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-purple-500">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                
                {insight.confidence && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confidence:</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${insight.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{(insight.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No insights yet. Click a button above to generate AI-powered insights!</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AIInsightsCard;