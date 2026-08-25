import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';

import Logo from '@/components/Logo';
import { Lock, Mail, User, ShieldCheck, ArrowLeft, Scan, BookOpen, Shield, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { motion } from 'framer-motion';

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const queryRedirect = new URLSearchParams(location.search).get('redirectTo');
  const storedRedirect = sessionStorage.getItem('auth_redirect_to');
  const from = queryRedirect || (location.state as { from?: string } | null)?.from || storedRedirect || '/attendance';

  useEffect(() => {
    if (!queryRedirect) return;
    if (queryRedirect.startsWith('/') && !queryRedirect.startsWith('//')) {
      sessionStorage.setItem('auth_redirect_to', queryRedirect);
    }
  }, [queryRedirect]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        sessionStorage.removeItem('auth_redirect_to');
        navigate(from, { replace: true });
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        sessionStorage.removeItem('auth_redirect_to');
        navigate(from, { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, from]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Password mismatch", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?redirectTo=${encodeURIComponent(from)}`,
          data: { name: formData.name }
        }
      });
      if (error) throw error;
      toast({ title: "Account created!", description: "Check your email to verify your account" });
      navigate(`/login?redirectTo=${encodeURIComponent(from)}`, { replace: true });
    } catch (error: any) {
      toast({ title: "Signup failed", description: error.message || "Failed to create account", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      sessionStorage.setItem('auth_redirect_to', from);
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${window.location.origin}/login?redirectTo=${encodeURIComponent(from)}`,
      });
      if (result?.error) throw result.error;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-hidden flex neon-liquid-bg">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }} transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-1/4 -left-20 w-52 sm:w-96 h-52 sm:h-96 rounded-full blur-[80px]"
          style={{ background: 'hsl(var(--ios-purple) / 0.2)' }} />
        <motion.div animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.1, 0.2] }} transition={{ duration: 10, repeat: Infinity, delay: 1 }}
          className="absolute bottom-1/4 -right-20 w-52 sm:w-96 h-52 sm:h-96 rounded-full blur-[80px]"
          style={{ background: 'hsl(var(--ios-blue) / 0.2)' }} />
      </div>

      {/* Left Panel (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Logo size="lg" />
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-foreground">
            Join Smart School Platform
          </motion.h2>


          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="grid grid-cols-2 gap-3">
            {[
              { icon: Scan, label: "Face Attendance", colorVar: '--ios-blue' },
              { icon: BookOpen, label: "Smart Timetable", colorVar: '--ios-green' },
              { icon: Shield, label: "Gate Security", colorVar: '--ios-red' },
              { icon: Bell, label: "Parent Alerts", colorVar: '--ios-orange' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-card/60 border border-border/50 backdrop-blur-sm">
                <item.icon className="w-5 h-5" style={{ color: `hsl(var(${item.colorVar}))` }} />
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex-1 flex items-center justify-center px-5 py-6 sm:p-6 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] space-y-4">
          
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-95 p-1 -m-1">
              <ArrowLeft className="w-5 h-5" />
              <span className="sr-only sm:not-sr-only">Home</span>
            </Link>
            <div className="lg:hidden"><Logo size="sm" /></div>
            <div className="w-12" />
          </div>

          <div className="text-center lg:text-left space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Create account</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Get started with Presences smart automation
            </p>
          </div>

          <Card className="p-5 sm:p-7 space-y-4 liquid-glass-surface liquid-glass-highlight border-border/70 shadow-xl rounded-2xl">
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-primary" />
                  Full Name
                </Label>
                <Input id="name" name="name" type="text" placeholder="Your name" value={formData.name}
                  onChange={handleInputChange} className="h-12 text-base rounded-xl" required autoComplete="name" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  Email
                </Label>
                <Input id="email" name="email" type="email" placeholder="name@school.com" value={formData.email}
                  onChange={handleInputChange} className="h-12 text-base rounded-xl" required autoComplete="email" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Password
                  </Label>
                  <PasswordInput id="password" name="password" placeholder="••••••••" value={formData.password}
                    onChange={handleInputChange} className="h-12 text-base rounded-xl" required autoComplete="new-password" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Confirm
                  </Label>
                  <PasswordInput id="confirmPassword" name="confirmPassword" placeholder="••••••••" value={formData.confirmPassword}
                    onChange={handleInputChange} className="h-12 text-base rounded-xl" required autoComplete="new-password" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">Minimum 6 characters</p>

              <Button type="submit" className="w-full h-12 text-base font-semibold rounded-xl bg-primary hover:bg-primary/90" disabled={isLoading}>
                {isLoading ? (
                  <><span className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground border-r-transparent animate-spin" />Creating...</>
                ) : "Create Account"}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-card text-muted-foreground">or</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full h-12 text-base rounded-xl active:scale-[0.98] transition-transform" onClick={handleGoogleSignUp}>
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>
          </Card>

          <p className="text-center text-sm text-muted-foreground pb-safe">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Signup;
