import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAIInsights = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInsight = async (type: 'attendance_prediction' | 'anomaly_detection' | 'performance_insights', userId: string) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { 
          type,
          userId,
          data: {} 
        }
      });

      if (error) throw error;

      toast({
        title: "AI Insight Generated",
        description: "Your personalized insights are ready!",
      });

      return data;
    } catch (error: any) {
      console.error('Error generating insight:', error);
      
      if (error.message?.includes('429')) {
        toast({
          title: "Rate Limit Exceeded",
          description: "Too many requests. Please try again later.",
          variant: "destructive"
        });
      } else if (error.message?.includes('402')) {
        toast({
          title: "Credits Required",
          description: "Please add credits to continue using AI features.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to generate AI insights",
          variant: "destructive"
        });
      }
      
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAttendancePrediction = (userId: string) => 
    generateInsight('attendance_prediction', userId);

  const detectAnomalies = (userId: string) => 
    generateInsight('anomaly_detection', userId);

  const getPerformanceInsights = (userId: string) => 
    generateInsight('performance_insights', userId);

  return {
    generateAttendancePrediction,
    detectAnomalies,
    getPerformanceInsights,
    isGenerating
  };
};
