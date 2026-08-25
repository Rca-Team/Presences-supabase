import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import PageLayout from '@/components/layouts/PageLayout';
import PushNotificationSettings from '@/components/notifications/PushNotificationSettings';
import FaceReRegistration from '@/components/profile/FaceReRegistration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/ui/progress-ring';
import PageTransition from '@/components/PageTransition';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  BarChart3, 
  Bell, 
  Shield,
  Sparkles,
  TrendingUp,
  Edit3,
  Save,
  CheckCircle2,
  Clock,
  Award,
  Activity,
  LogOut,
  Settings,
  ChevronRight,
  RefreshCw,
  Scan,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '',
    parent_name: '',
    parent_email: '',
    parent_phone: ''
  });
  const [testWhatsAppLoading, setTestWhatsAppLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return;
    }
    setUser(user);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    setProfile(profileData);
    if (profileData) {
      setFormData({
        display_name: profileData.display_name || '',
        parent_name: profileData.parent_name || '',
        parent_email: profileData.parent_email || '',
        parent_phone: profileData.parent_phone || ''
      });
    }
  };

  const { data: attendanceStats } = useQuery({
    queryKey: ['userAttendance', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, count } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);
      
      const present = data?.filter(r => r.status === 'present').length || 0;
      const late = data?.filter(r => r.status === 'late').length || 0;
      const rate = count ? (present / count * 100) : 0;
      
      return { total: count || 0, present, late, rate };
    },
    enabled: !!user
  });

  const { data: aiInsights } = useQuery({
    queryKey: ['aiInsights'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!user
  });

  const { data: notifications, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!user
  });

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          refetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetchNotifications]);

  const handleSave = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update(formData)
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Success",
        description: "Profile updated successfully"
      });
      setIsEditing(false);
      fetchUserData();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out."
    });
    navigate('/');
  };

  const generateAIInsight = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { 
          type: 'performance_insights',
          userId: user.id,
          data: {} 
        }
      });

      if (error) throw error;

      toast({
        title: "AI Insight Generated",
        description: "Your personalized insights are ready!",
        variant: "default"
      });
    } catch (error) {
      console.error('Error generating insight:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI insights",
        variant: "destructive"
      });
    }
  };

  const sendHelloWorldTest = async () => {
    const phone = testPhone.trim() || formData.parent_phone;
    if (!phone) {
      toast({
        title: "No phone number",
        description: "Enter a phone number below or save a parent phone number in your profile first.",
        variant: "destructive"
      });
      return;
    }

    setTestWhatsAppLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phoneNumber: phone,
          textBody: `Hello World! 👋\n\nThis is a test WhatsApp message from Presence.\nIf you received this, your WhatsApp notifications are working correctly.`,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "WhatsApp sent ✅",
          description: `Hello World test delivered to ${phone}. Message ID: ${data.messageId || 'ok'}`
        });
      } else {
        toast({
          title: "WhatsApp failed",
          description: data?.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      toast({
        title: "Test failed",
        description: e.message,
        variant: "destructive"
      });
    } finally {
      setTestWhatsAppLoading(false);
    }
  };

  const statsCards = [
    {
      title: 'Attendance',
      value: `${attendanceStats?.rate?.toFixed(0) || 0}%`,
      icon: Activity,
      color: 'from-blue-500 to-blue-600',
    },
    {
      title: 'Present',
      value: attendanceStats?.present || 0,
      icon: CheckCircle2,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Late',
      value: attendanceStats?.late || 0,
      icon: Clock,
      color: 'from-yellow-500 to-orange-500',
    },
    {
      title: 'Total',
      value: attendanceStats?.total || 0,
      icon: BarChart3,
      color: 'from-purple-500 to-pink-500',
    },
  ];

  const quickActions = [
    { icon: Settings, label: 'Settings', onClick: () => {} },
    { icon: RefreshCw, label: 'Sync Data', onClick: fetchUserData },
    { icon: LogOut, label: 'Sign Out', onClick: handleLogout, danger: true },
  ];

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50 dark:from-slate-950 dark:via-blue-950/50 dark:to-indigo-950">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
            className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-tr from-indigo-400/15 to-blue-400/15 rounded-full blur-3xl"
          />
        </div>

        <div className="relative mobile-container py-6 sm:py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6 sm:mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">My Profile</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                Welcome Back
              </span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">Manage your account and view analytics</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Profile Card - Mobile Optimized */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl overflow-hidden">
                {/* Profile Header */}
                <div className="relative h-24 sm:h-32 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0" style={{
                      backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                      backgroundSize: '24px 24px',
                    }} />
                  </div>
                </div>
                
                <div className="px-4 sm:px-6 pb-6">
                  <div className="flex flex-col items-center -mt-12 sm:-mt-16">
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      className="relative"
                    >
                      <Avatar className="w-24 h-24 sm:w-28 sm:h-28 border-4 border-white dark:border-slate-900 shadow-xl">
                        <AvatarImage src={profile?.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-500 text-white text-2xl sm:text-3xl font-bold">
                          {profile?.display_name?.[0] || user?.email?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 bg-green-500 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </div>
                    </motion.div>
                    
                    <h2 className="mt-3 sm:mt-4 text-lg sm:text-xl font-bold text-center">{profile?.display_name || 'User'}</h2>
                    <p className="text-muted-foreground text-xs sm:text-sm truncate max-w-[200px]">{user?.email}</p>
                    
                    <Badge className="mt-2 sm:mt-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white border-0 text-xs">
                      <Award className="w-3 h-3 mr-1" />
                      Verified Member
                    </Badge>
                  </div>
                  
                  {/* Attendance Ring */}
                  <div className="mt-4 sm:mt-6 flex justify-center">
                    <ProgressRing 
                      progress={attendanceStats?.rate || 0} 
                      size="lg"
                      color="blue"
                      showValue={false}
                    >
                      <div className="text-center">
                        <span className="text-xl sm:text-2xl font-bold">{attendanceStats?.rate?.toFixed(0) || 0}%</span>
                        <p className="text-xs text-muted-foreground">Attendance</p>
                      </div>
                    </ProgressRing>
                  </div>

                  {/* Quick Actions for Mobile */}
                  <div className="mt-6 space-y-2 lg:hidden">
                    {quickActions.map((action, i) => (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.98 }}
                        onClick={action.onClick}
                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                          action.danger 
                            ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400' 
                            : 'bg-muted/50 hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <action.icon className="w-5 h-5" />
                          <span className="font-medium">{action.label}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Main Content */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2 space-y-4 sm:space-y-6"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {statsCards.map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i }}
                    whileHover={{ y: -3 }}
                    className={`p-3 sm:p-4 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg`}
                  >
                    <stat.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white/90 mb-1 sm:mb-2" />
                    <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-white/70">{stat.title}</p>
                  </motion.div>
                ))}
              </div>

              {/* Tabs */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4 sm:mb-6 bg-white/50 dark:bg-slate-800/50 p-1 rounded-xl border border-blue-100 dark:border-blue-900">
                  <TabsTrigger value="details" className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg">
                    <User className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Details</span>
                  </TabsTrigger>
                  <TabsTrigger value="face" className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg">
                    <Scan className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Face ID</span>
                  </TabsTrigger>
                  <TabsTrigger value="insights" className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg">
                    <Sparkles className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">AI Insights</span>
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg">
                    <Bell className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Alerts</span>
                  </TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                  <TabsContent value="details">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl">
                        <CardHeader className="pb-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
                                <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                              </div>
                              Personal Information
                            </CardTitle>
                            <Button 
                              variant={isEditing ? "default" : "outline"}
                              size="sm"
                              onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                              className={isEditing ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white" : "border-blue-200 dark:border-blue-800"}
                            >
                              {isEditing ? (
                                <>
                                  <Save className="w-4 h-4 mr-2" />
                                  Save
                                </>
                              ) : (
                                <>
                                  <Edit3 className="w-4 h-4 mr-2" />
                                  Edit
                                </>
                              )}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 sm:space-y-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs sm:text-sm text-muted-foreground">Display Name</Label>
                              <Input
                                value={formData.display_name}
                                onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                                disabled={!isEditing}
                                className="h-10 sm:h-12 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs sm:text-sm text-muted-foreground">Email</Label>
                              <Input
                                value={user?.email || ''}
                                disabled
                                className="h-10 sm:h-12 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900"
                              />
                            </div>
                          </div>

                          <div className="border-t border-blue-100 dark:border-blue-900 pt-4 sm:pt-6">
                            <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                              <Shield className="w-4 h-4 text-blue-500" />
                              Parent/Guardian Information
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm text-muted-foreground">Parent Name</Label>
                                <Input
                                  value={formData.parent_name}
                                  onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
                                  disabled={!isEditing}
                                  className="h-10 sm:h-12 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm text-muted-foreground">Parent Email</Label>
                                <Input
                                  type="email"
                                  value={formData.parent_email}
                                  onChange={(e) => setFormData({...formData, parent_email: e.target.value})}
                                  disabled={!isEditing}
                                  className="h-10 sm:h-12 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900"
                                />
                              </div>
                              <div className="space-y-2 sm:col-span-2">
                                <Label className="text-xs sm:text-sm text-muted-foreground">Parent Phone</Label>
                                <Input
                                  value={formData.parent_phone}
                                  onChange={(e) => setFormData({...formData, parent_phone: e.target.value})}
                                  disabled={!isEditing}
                                  className="h-10 sm:h-12 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900"
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="face">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {user && (
                        <FaceReRegistration 
                          userId={user.id} 
                          userName={profile?.display_name || user.email || 'User'} 
                        />
                      )}
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="insights">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl">
                        <CardHeader className="pb-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div>
                              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
                                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                AI-Powered Insights
                              </CardTitle>
                              <CardDescription className="mt-1 text-xs sm:text-sm">Personalized analytics powered by AI</CardDescription>
                            </div>
                            <Button 
                              onClick={generateAIInsight}
                              size="sm"
                              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white"
                            >
                              <TrendingUp className="h-4 w-4 mr-2" />
                              Generate
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 sm:space-y-4">
                          {aiInsights && aiInsights.length > 0 ? (
                            aiInsights.map((insight: any, i: number) => (
                              <motion.div
                                key={insight.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="p-3 sm:p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <Badge className="bg-purple-500/20 text-purple-600 dark:text-purple-400 border-0 text-xs">
                                    {insight.insight_type.replace('_', ' ')}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(insight.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                {insight.data?.insights && (
                                  <ul className="mt-2 space-y-1">
                                    {insight.data.insights.map((item: string, idx: number) => (
                                      <li key={idx} className="text-xs sm:text-sm flex items-start gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </motion.div>
                            ))
                          ) : (
                            <div className="text-center py-8 sm:py-12">
                              <Sparkles className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-purple-300 dark:text-purple-700" />
                              <p className="text-muted-foreground text-sm">No AI insights yet.</p>
                              <p className="text-xs text-muted-foreground">Click "Generate" to create personalized insights!</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="notifications">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-4"
                    >
                      {/* Push Notification Settings */}
                      <PushNotificationSettings className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl" />

                      {/* WhatsApp Test */}
                      <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl">
                        <CardHeader className="pb-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                            <div>
                              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                </div>
                                WhatsApp Test
                              </CardTitle>
                              <CardDescription className="mt-1 text-xs sm:text-sm">
                                Send a Hello World message to any WhatsApp number
                              </CardDescription>
                            </div>
                            <Button
                              onClick={sendHelloWorldTest}
                              disabled={testWhatsAppLoading}
                              size="sm"
                              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                            >
                              {testWhatsAppLoading ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <MessageSquare className="h-4 w-4 mr-2" />
                              )}
                              Send Hello World
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label htmlFor="test-phone" className="text-xs sm:text-sm">
                              Phone number
                            </Label>
                            <Input
                              id="test-phone"
                              type="tel"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                              placeholder={formData.parent_phone || "+919876543210"}
                              className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Leave blank to use your saved parent phone ({formData.parent_phone || "not set"}).
                              Include country code.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Notification History */}
                      <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl">
                        <CardHeader className="pb-4">
                          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                            </div>
                            Notification History
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 sm:space-y-3">
                          {notifications && notifications.length > 0 ? (
                            notifications.map((notif: any, i: number) => (
                              <motion.div
                                key={notif.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`p-3 sm:p-4 rounded-xl border transition-all hover:shadow-md ${
                                  notif.is_read 
                                    ? 'bg-muted/30 border-muted' 
                                    : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                                }`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-semibold text-xs sm:text-sm">{notif.title}</h4>
                                  <Badge variant={notif.type === 'warning' ? 'destructive' : 'default'} className="text-xs">
                                    {notif.type}
                                  </Badge>
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground">{notif.message}</p>
                                <span className="text-xs text-muted-foreground mt-2 block">
                                  {new Date(notif.created_at).toLocaleString()}
                                </span>
                              </motion.div>
                            ))
                          ) : (
                            <div className="text-center py-8 sm:py-12">
                              <Bell className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground/30" />
                              <p className="text-muted-foreground text-sm">No notifications yet</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </TabsContent>
                </AnimatePresence>
              </Tabs>

              {/* Desktop Quick Actions */}
              <div className="hidden lg:flex gap-3">
                {quickActions.map((action, i) => (
                  <Button
                    key={i}
                    variant={action.danger ? "destructive" : "outline"}
                    onClick={action.onClick}
                    className={!action.danger ? "border-blue-200 dark:border-blue-800" : ""}
                  >
                    <action.icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Profile;
