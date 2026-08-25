import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, Medal, Star, Crown, Flame, Zap, Target,
  Gift, Award, TrendingUp, Users, Calendar
} from 'lucide-react';

interface BadgeInfo {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  points: number;
  badge_type: string | null;
}

interface StudentBadge {
  id: string;
  student_id: string;
  badge_id: string | null;
  earned_at: string;
  month_year: string | null;
  badge?: BadgeInfo;
}

interface LeaderboardEntry {
  id: string;
  category: string;
  month_year: string;
  total_points: number;
  average_attendance: number;
  rank: number | null;
}

interface PointEntry {
  id: string;
  student_id: string;
  points: number;
  reason: string | null;
  earned_at: string;
}

const Gamification = () => {
  const { toast } = useToast();
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [studentBadges, setStudentBadges] = useState<StudentBadge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [points, setPoints] = useState<PointEntry[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('badges');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all available badges
      const { data: badgesData } = await supabase
        .from('badges')
        .select('*')
        .order('points', { ascending: false });
      setBadges(badgesData || []);

      // Fetch student badges (for demo, show all)
      const { data: studentBadgesData } = await supabase
        .from('student_badges')
        .select(`
          *,
          badges(*)
        `)
        .order('earned_at', { ascending: false })
        .limit(50);
      setStudentBadges(studentBadgesData || []);

      // Fetch leaderboard
      const monthYear = new Date().toISOString().slice(0, 7);
      const { data: leaderboardData } = await supabase
        .from('class_leaderboard')
        .select('*')
        .eq('month_year', monthYear)
        .order('total_points', { ascending: false });
      setLeaderboard(leaderboardData || []);

      // Fetch recent point earnings
      const { data: pointsData } = await supabase
        .from('attendance_points')
        .select('*')
        .order('earned_at', { ascending: false })
        .limit(20);
      setPoints(pointsData || []);

      // Calculate total points
      const total = (pointsData || []).reduce((sum, p) => sum + p.points, 0);
      setTotalPoints(total);
    } catch (error) {
      console.error('Error fetching gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const awardBadge = async (studentId: string, badgeId: string) => {
    try {
      const monthYear = new Date().toISOString().slice(0, 7);
      
      const { error } = await supabase.from('student_badges').insert({
        student_id: studentId,
        badge_id: badgeId,
        month_year: monthYear,
      });

      if (error) throw error;
      
      toast({ title: '🏆 Badge Awarded!', description: 'Student earned a new achievement' });
      fetchData();
    } catch (error) {
      console.error('Error awarding badge:', error);
    }
  };

  const awardPoints = async (studentId: string, pointsToAdd: number, reason: string) => {
    try {
      const { error } = await supabase.from('attendance_points').insert({
        student_id: studentId,
        points: pointsToAdd,
        reason,
      });

      if (error) throw error;
      
      toast({ title: `+${pointsToAdd} Points!`, description: reason });
      fetchData();
    } catch (error) {
      console.error('Error awarding points:', error);
    }
  };

  const getBadgeIcon = (iconName: string | null) => {
    const icons: Record<string, React.ReactNode> = {
      '🌟': <Star className="h-6 w-6 text-yellow-400" />,
      '🏆': <Trophy className="h-6 w-6 text-yellow-500" />,
      '🐦': <Zap className="h-6 w-6 text-blue-400" />,
      '🔥': <Flame className="h-6 w-6 text-orange-500" />,
      '⚡': <Zap className="h-6 w-6 text-purple-400" />,
      '👑': <Crown className="h-6 w-6 text-yellow-400" />,
      '💪': <Target className="h-6 w-6 text-green-400" />,
      '🎓': <Award className="h-6 w-6 text-blue-500" />,
    };
    return icons[iconName || ''] || <Medal className="h-6 w-6 text-primary" />;
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { icon: <Crown className="h-5 w-5 text-yellow-400" />, color: 'from-yellow-500/30 to-yellow-600/10 border-yellow-500/50' };
    if (rank === 2) return { icon: <Medal className="h-5 w-5 text-gray-300" />, color: 'from-gray-400/30 to-gray-500/10 border-gray-400/50' };
    if (rank === 3) return { icon: <Medal className="h-5 w-5 text-amber-600" />, color: 'from-amber-500/30 to-amber-600/10 border-amber-500/50' };
    return { icon: <span className="font-bold">#{rank}</span>, color: 'bg-card/50' };
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30">
          <CardContent className="pt-4 text-center">
            <Trophy className="h-8 w-8 mx-auto text-yellow-400 mb-2" />
            <p className="text-3xl font-bold text-yellow-400">{badges.length}</p>
            <p className="text-xs text-muted-foreground">Available Badges</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardContent className="pt-4 text-center">
            <Award className="h-8 w-8 mx-auto text-purple-400 mb-2" />
            <p className="text-3xl font-bold text-purple-400">{studentBadges.length}</p>
            <p className="text-xs text-muted-foreground">Badges Earned</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="pt-4 text-center">
            <Star className="h-8 w-8 mx-auto text-green-400 mb-2" />
            <p className="text-3xl font-bold text-green-400">{totalPoints}</p>
            <p className="text-xs text-muted-foreground">Total Points</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="pt-4 text-center">
            <Users className="h-8 w-8 mx-auto text-blue-400 mb-2" />
            <p className="text-3xl font-bold text-blue-400">{leaderboard.length}</p>
            <p className="text-xs text-muted-foreground">Classes Competing</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="badges" className="gap-2">
            <Trophy className="h-4 w-4" />
            Badges
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-2">
            <Crown className="h-4 w-4" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="points" className="gap-2">
            <Star className="h-4 w-4" />
            Points
          </TabsTrigger>
        </TabsList>

        <TabsContent value="badges">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Badges */}
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  Available Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="grid grid-cols-2 gap-3">
                    {badges.map((badge, index) => (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center hover:border-primary/50 transition-all"
                      >
                        <div className="text-3xl mb-2">{badge.icon}</div>
                        <p className="font-semibold text-sm">{badge.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{badge.description}</p>
                        <Badge className="mt-2 bg-primary/20 text-primary">
                          +{badge.points} pts
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Recently Earned */}
            <Card className="bg-card/50 backdrop-blur border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  Recently Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  {studentBadges.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Medal className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No badges earned yet</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {studentBadges.map((sb, index) => (
                        <motion.div
                          key={sb.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border-b border-border/30"
                        >
                          <div className="text-2xl">{sb.badge?.icon || '🏆'}</div>
                          <div className="flex-1">
                            <p className="font-medium">{sb.badge?.name || 'Achievement'}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(sb.earned_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant="outline">+{sb.badge?.points || 0}</Badge>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card className="bg-card/50 backdrop-blur border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-400" />
                Class Leaderboard - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No leaderboard data yet</p>
                  <p className="text-sm">Class rankings update automatically</p>
                </div>
              ) : (
                <ScrollArea className="h-96">
                  {leaderboard.map((entry, index) => {
                    const rank = index + 1;
                    const { icon, color } = getRankDisplay(rank);
                    
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-center gap-4 p-4 rounded-lg mb-2 bg-gradient-to-r ${color}`}
                      >
                        <div className="w-10 h-10 flex items-center justify-center">
                          {icon}
                        </div>
                        
                        <div className="flex-1">
                          <p className="font-bold text-lg">Category {entry.category}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {entry.average_attendance.toFixed(1)}% attendance
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{entry.total_points}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="points">
          <Card className="bg-card/50 backdrop-blur border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-400" />
                Recent Point Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {points.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No points earned yet</p>
                    <p className="text-sm">Points are awarded for attendance achievements</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {points.map((point, index) => (
                      <motion.div
                        key={point.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border-b border-border/30"
                      >
                        <div className="p-2 rounded-full bg-yellow-500/20">
                          <Star className="h-4 w-4 text-yellow-400" />
                        </div>
                        
                        <div className="flex-1">
                          <p className="font-medium">{point.reason || 'Attendance reward'}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(point.earned_at).toLocaleString()}
                          </p>
                        </div>

                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          +{point.points}
                        </Badge>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Gamification;
