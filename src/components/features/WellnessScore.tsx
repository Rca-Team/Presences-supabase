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
  Heart, TrendingUp, TrendingDown, Minus, AlertTriangle,
  RefreshCw, Sparkles, Activity, Calendar, Users
} from 'lucide-react';

interface WellnessData {
  id: string;
  student_id: string;
  score_date: string;
  attendance_score: number;
  punctuality_score: number;
  emotion_score: number;
  overall_score: number;
  trend: string | null;
  intervention_needed: boolean;
  notes: string | null;
  student_name?: string;
}

const WellnessScore = () => {
  const { toast } = useToast();
  const [scores, setScores] = useState<WellnessData[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [interventionCount, setInterventionCount] = useState(0);

  useEffect(() => {
    fetchWellnessScores();
  }, []);

  const fetchWellnessScores = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('wellness_scores')
        .select('*')
        .eq('score_date', today)
        .order('overall_score', { ascending: true });

      if (error) throw error;
      
      setScores(data || []);
      setInterventionCount((data || []).filter(s => s.intervention_needed).length);
    } catch (error) {
      console.error('Error fetching wellness scores:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWellnessScores = async () => {
    setCalculating(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get all registered students
      const { data: students } = await supabase
        .from('attendance_records')
        .select('user_id')
        .eq('status', 'registered');

      for (const student of students || []) {
        if (!student.user_id) continue;

        // Get attendance history
        const { data: attendance } = await supabase
          .from('attendance_records')
          .select('status, timestamp')
          .eq('user_id', student.user_id)
          .in('status', ['present', 'late', 'absent'])
          .gte('timestamp', thirtyDaysAgo.toISOString())
          .order('timestamp', { ascending: false });

        if (!attendance || attendance.length < 5) continue;

        // Calculate attendance score (0-100)
        const presentDays = attendance.filter(a => a.status === 'present').length;
        const lateDays = attendance.filter(a => a.status === 'late').length;
        const totalDays = attendance.length;
        const attendanceScore = Math.round(((presentDays + lateDays * 0.5) / totalDays) * 100);

        // Calculate punctuality score (0-100)
        const punctualDays = presentDays;
        const punctualityScore = Math.round((punctualDays / totalDays) * 100);

        // Emotion score - simulated based on attendance patterns
        // In a real system, this would come from emotion detection
        const emotionScore = Math.round(50 + (attendanceScore - 50) * 0.5 + Math.random() * 20);

        // Overall wellness score (weighted average)
        const overallScore = Math.round(
          attendanceScore * 0.4 + 
          punctualityScore * 0.3 + 
          emotionScore * 0.3
        );

        // Determine trend by comparing with yesterday
        const { data: yesterday } = await supabase
          .from('wellness_scores')
          .select('overall_score')
          .eq('student_id', student.user_id)
          .lt('score_date', today)
          .order('score_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        let trend = 'stable';
        if (yesterday) {
          const diff = overallScore - yesterday.overall_score;
          if (diff > 5) trend = 'improving';
          else if (diff < -5) trend = 'declining';
        }

        // Check if intervention needed
        const interventionNeeded = overallScore < 50 || trend === 'declining';

        // Upsert wellness score
        await supabase.from('wellness_scores').upsert({
          student_id: student.user_id,
          score_date: today,
          attendance_score: attendanceScore,
          punctuality_score: punctualityScore,
          emotion_score: Math.min(100, Math.max(0, emotionScore)),
          overall_score: overallScore,
          trend,
          intervention_needed: interventionNeeded,
        }, {
          onConflict: 'student_id,score_date',
        });
      }

      toast({ title: 'Wellness Scores Calculated', description: 'All student scores updated' });
      fetchWellnessScores();
    } catch (error) {
      console.error('Error calculating wellness:', error);
      toast({ title: 'Error', description: 'Failed to calculate wellness scores', variant: 'destructive' });
    } finally {
      setCalculating(false);
    }
  };

  const getTrendIcon = (trend: string | null) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-400" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Calculate averages
  const avgOverall = scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b.overall_score, 0) / scores.length)
    : 0;
  const avgAttendance = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b.attendance_score, 0) / scores.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-6 w-6 text-pink-400" />
          <h2 className="text-xl font-bold">Student Wellness Dashboard</h2>
        </div>
        <Button onClick={calculateWellnessScores} disabled={calculating}>
          {calculating ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {calculating ? 'Calculating...' : 'Calculate Scores'}
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-pink-500/20 to-pink-600/10 border-pink-500/30">
          <CardContent className="pt-4 text-center">
            <Heart className="h-6 w-6 mx-auto text-pink-400 mb-1" />
            <p className={`text-3xl font-bold ${getScoreColor(avgOverall)}`}>{avgOverall}%</p>
            <p className="text-xs text-muted-foreground">Avg Wellness</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="pt-4 text-center">
            <Calendar className="h-6 w-6 mx-auto text-blue-400 mb-1" />
            <p className="text-3xl font-bold text-blue-400">{avgAttendance}%</p>
            <p className="text-xs text-muted-foreground">Avg Attendance</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="pt-4 text-center">
            <Users className="h-6 w-6 mx-auto text-green-400 mb-1" />
            <p className="text-3xl font-bold text-green-400">{scores.length}</p>
            <p className="text-xs text-muted-foreground">Students Tracked</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-red-400 mb-1" />
            <p className="text-3xl font-bold text-red-400">{interventionCount}</p>
            <p className="text-xs text-muted-foreground">Need Intervention</p>
          </CardContent>
        </Card>
      </div>

      {/* Intervention Alert */}
      {interventionCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/20 border border-red-500/50 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-bold">{interventionCount} students require attention</span>
          </div>
          <p className="text-sm text-red-300 mt-1">
            These students show declining wellness patterns and may need counselor support.
          </p>
        </motion.div>
      )}

      {/* Student Wellness Cards */}
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Individual Wellness Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : scores.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Heart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No wellness data for today</p>
                <p className="text-sm">Click "Calculate Scores" to analyze</p>
              </div>
            ) : (
              <AnimatePresence>
                {scores.map((score, index) => (
                  <motion.div
                    key={score.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`p-4 rounded-lg mb-2 ${
                      score.intervention_needed ? 'bg-red-500/10 border border-red-500/30' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Overall Score Circle */}
                      <div className="relative">
                        <svg className="w-16 h-16 transform -rotate-90">
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            className="text-muted"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                            strokeDasharray={`${score.overall_score * 1.76} 176`}
                            className={getScoreColor(score.overall_score).replace('text-', 'stroke-').replace('stroke-', 'text-')}
                            style={{ stroke: score.overall_score >= 80 ? '#4ade80' : score.overall_score >= 60 ? '#facc15' : score.overall_score >= 40 ? '#fb923c' : '#f87171' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-lg font-bold ${getScoreColor(score.overall_score)}`}>
                            {score.overall_score}
                          </span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">Student: {score.student_id.slice(0, 8)}...</span>
                          {getTrendIcon(score.trend)}
                          <span className="text-xs text-muted-foreground capitalize">{score.trend}</span>
                          {score.intervention_needed && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Needs Attention
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Attendance</p>
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={score.attendance_score} 
                                className="h-2 flex-1"
                              />
                              <span className="font-mono w-8">{score.attendance_score}%</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Punctuality</p>
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={score.punctuality_score} 
                                className="h-2 flex-1"
                              />
                              <span className="font-mono w-8">{score.punctuality_score}%</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Emotion</p>
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={score.emotion_score} 
                                className="h-2 flex-1"
                              />
                              <span className="font-mono w-8">{score.emotion_score}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
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

export default WellnessScore;
