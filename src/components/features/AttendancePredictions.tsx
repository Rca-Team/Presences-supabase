import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, TrendingUp, TrendingDown, AlertCircle, 
  Calendar, Users, Bell, RefreshCw, Sparkles
} from 'lucide-react';

interface Prediction {
  id: string;
  student_id: string;
  predicted_date: string;
  probability: number;
  risk_level: string | null;
  factors: any;
  notification_sent: boolean;
  actual_status: string | null;
  student_name?: string;
}

interface RiskStats {
  high: number;
  medium: number;
  low: number;
}

const AttendancePredictions = () => {
  const { toast } = useToast();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [riskStats, setRiskStats] = useState<RiskStats>({ high: 0, medium: 0, low: 0 });
  const [selectedRisk, setSelectedRisk] = useState<string | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  const fetchPredictions = async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('attendance_predictions')
        .select('*')
        .gte('predicted_date', tomorrowStr)
        .order('probability', { ascending: false });

      if (error) throw error;

      // Calculate risk stats
      const stats: RiskStats = { high: 0, medium: 0, low: 0 };
      (data || []).forEach(p => {
        if (p.risk_level === 'high') stats.high++;
        else if (p.risk_level === 'medium') stats.medium++;
        else stats.low++;
      });

      setRiskStats(stats);
      setPredictions(data || []);
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePredictions = async () => {
    setGenerating(true);
    try {
      // Fetch all students with attendance history
      const { data: students, error: studentsError } = await supabase
        .from('attendance_records')
        .select('user_id, device_info')
        .eq('status', 'registered');

      if (studentsError) throw studentsError;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const dayOfWeek = tomorrow.getDay();

      // Generate predictions for each student
      for (const student of students || []) {
        if (!student.user_id) continue;

        // Fetch attendance history for this student
        const { data: history } = await supabase
          .from('attendance_records')
          .select('status, timestamp')
          .eq('user_id', student.user_id)
          .in('status', ['present', 'late', 'absent'])
          .order('timestamp', { ascending: false })
          .limit(30);

        if (!history || history.length < 5) continue;

        // Calculate absence probability
        const absences = history.filter(h => h.status === 'absent').length;
        const lates = history.filter(h => h.status === 'late').length;
        const totalDays = history.length;

        // Check day-of-week patterns
        const sameDayRecords = history.filter(h => 
          new Date(h.timestamp).getDay() === dayOfWeek
        );
        const sameDayAbsences = sameDayRecords.filter(h => h.status === 'absent').length;

        // Calculate probability (weighted formula)
        let probability = (absences / totalDays) * 0.4 + 
                          (lates / totalDays) * 0.2 +
                          (sameDayAbsences / Math.max(sameDayRecords.length, 1)) * 0.4;

        // Normalize between 0.05 and 0.95
        probability = Math.min(0.95, Math.max(0.05, probability));

        // Determine risk level
        let riskLevel = 'low';
        if (probability > 0.7) riskLevel = 'high';
        else if (probability > 0.4) riskLevel = 'medium';

        // Build factors
        const factors = {
          historical_absence_rate: ((absences / totalDays) * 100).toFixed(1) + '%',
          late_rate: ((lates / totalDays) * 100).toFixed(1) + '%',
          day_of_week_pattern: dayOfWeek === 1 || dayOfWeek === 5 ? 'Higher risk day' : 'Normal',
          recent_trend: absences > 3 ? 'Concerning' : 'Stable',
        };

        // Upsert prediction
        await supabase.from('attendance_predictions').upsert({
          student_id: student.user_id,
          predicted_date: tomorrowStr,
          probability,
          risk_level: riskLevel,
          factors,
        }, {
          onConflict: 'student_id,predicted_date',
        });
      }

      toast({ title: 'Predictions Generated', description: 'AI analysis complete for tomorrow' });
      fetchPredictions();
    } catch (error) {
      console.error('Error generating predictions:', error);
      toast({ title: 'Error', description: 'Failed to generate predictions', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const sendReminderNotification = async (prediction: Prediction) => {
    try {
      await supabase.from('notifications').insert({
        user_id: prediction.student_id,
        title: 'Attendance Reminder',
        message: 'We noticed you might be at risk of missing school tomorrow. Please make sure to attend!',
        type: 'reminder',
      });

      await supabase
        .from('attendance_predictions')
        .update({ notification_sent: true })
        .eq('id', prediction.id);

      toast({ title: 'Reminder Sent', description: 'Notification sent to student/parent' });
      fetchPredictions();
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const getRiskColor = (risk: string | null) => {
    switch (risk) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-green-500/20 text-green-400 border-green-500/30';
    }
  };

  const getRiskIcon = (risk: string | null) => {
    switch (risk) {
      case 'high': return <TrendingDown className="h-4 w-4 text-red-400" />;
      case 'medium': return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      default: return <TrendingUp className="h-4 w-4 text-green-400" />;
    }
  };

  const filteredPredictions = selectedRisk 
    ? predictions.filter(p => p.risk_level === selectedRisk)
    : predictions;

  return (
    <div className="space-y-6">
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-bold">AI Attendance Predictions</h2>
        </div>
        <Button onClick={generatePredictions} disabled={generating}>
          {generating ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {generating ? 'Analyzing...' : 'Generate Predictions'}
        </Button>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${selectedRisk === 'high' ? 'ring-2 ring-red-500' : ''} bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30`}
          onClick={() => setSelectedRisk(selectedRisk === 'high' ? null : 'high')}
        >
          <CardContent className="pt-4 text-center">
            <TrendingDown className="h-8 w-8 mx-auto text-red-400 mb-2" />
            <p className="text-3xl font-bold text-red-400">{riskStats.high}</p>
            <p className="text-xs text-muted-foreground">High Risk</p>
            <p className="text-xs text-red-400/70 mt-1">&gt;70% absence probability</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${selectedRisk === 'medium' ? 'ring-2 ring-yellow-500' : ''} bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30`}
          onClick={() => setSelectedRisk(selectedRisk === 'medium' ? null : 'medium')}
        >
          <CardContent className="pt-4 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-yellow-400 mb-2" />
            <p className="text-3xl font-bold text-yellow-400">{riskStats.medium}</p>
            <p className="text-xs text-muted-foreground">Medium Risk</p>
            <p className="text-xs text-yellow-400/70 mt-1">40-70% probability</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${selectedRisk === 'low' ? 'ring-2 ring-green-500' : ''} bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30`}
          onClick={() => setSelectedRisk(selectedRisk === 'low' ? null : 'low')}
        >
          <CardContent className="pt-4 text-center">
            <TrendingUp className="h-8 w-8 mx-auto text-green-400 mb-2" />
            <p className="text-3xl font-bold text-green-400">{riskStats.low}</p>
            <p className="text-xs text-muted-foreground">Low Risk</p>
            <p className="text-xs text-green-400/70 mt-1">&lt;40% probability</p>
          </CardContent>
        </Card>
      </div>

      {/* Predictions List */}
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Tomorrow's Risk Analysis
            {selectedRisk && (
              <Badge className={getRiskColor(selectedRisk)}>
                Showing: {selectedRisk} risk
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPredictions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No predictions available</p>
                <p className="text-sm">Click "Generate Predictions" to analyze</p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredPredictions.map((prediction, index) => (
                  <motion.div
                    key={prediction.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted/50 border-b border-border/30"
                  >
                    <div className={`p-2 rounded-full ${
                      prediction.risk_level === 'high' ? 'bg-red-500/20' :
                      prediction.risk_level === 'medium' ? 'bg-yellow-500/20' : 'bg-green-500/20'
                    }`}>
                      {getRiskIcon(prediction.risk_level)}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">Student ID: {prediction.student_id.slice(0, 8)}...</span>
                        <Badge className={getRiskColor(prediction.risk_level)}>
                          {prediction.risk_level} risk
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          Absence probability:
                        </span>
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <Progress 
                            value={prediction.probability * 100} 
                            className="h-2"
                          />
                          <span className={`font-mono ${
                            prediction.probability > 0.7 ? 'text-red-400' :
                            prediction.probability > 0.4 ? 'text-yellow-400' : 'text-green-400'
                          }`}>
                            {(prediction.probability * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {prediction.factors && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(prediction.factors as Record<string, string>).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key.replace(/_/g, ' ')}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {prediction.notification_sent ? (
                        <Badge variant="secondary" className="gap-1">
                          <Bell className="h-3 w-3" />
                          Notified
                        </Badge>
                      ) : prediction.risk_level === 'high' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => sendReminderNotification(prediction)}
                        >
                          <Bell className="mr-1 h-3 w-3" />
                          Send Reminder
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendancePredictions;
