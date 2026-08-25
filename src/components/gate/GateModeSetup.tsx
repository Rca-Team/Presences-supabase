import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, ArrowRight, X, Plus, Zap, History, Clock, CheckCircle2, AlertTriangle, Calendar, ChevronRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';

export interface GateSessionStartConfig {
  gateName: string;
  cameraSource: 'webcam' | 'cctv' | 'both';
  cctvStreamUrl?: string;
}

interface GateModeSetupProps {
  onStart: (config: GateSessionStartConfig) => void;
  onCancel: () => void;
  isStarting?: boolean;
}

const GateModeSetup = ({ onStart, onCancel, isStarting = false }: GateModeSetupProps) => {
  const [gates, setGates] = useState<{ id: string; name: string; gate_type: string }[]>([]);
  const [selectedGate, setSelectedGate] = useState('Main Gate');
  const [customGate, setCustomGate] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [cameraSource, setCameraSource] = useState<'webcam' | 'cctv' | 'both'>('both');
  const [cctvStreamUrl, setCctvStreamUrl] = useState('');
  const [crowdAlertsEnabled, setCrowdAlertsEnabled] = useState(true);

  const startWithConfig = (overrideGateName?: string) => {
    onStart({
      gateName: overrideGateName || selectedGate,
      cameraSource,
      cctvStreamUrl: cctvStreamUrl.trim() || undefined,
    });
  };

  useEffect(() => {
    const fallback = [
      { id: '1', name: 'Main Gate', gate_type: 'main' },
      { id: '2', name: 'Back Gate', gate_type: 'back' },
      { id: '3', name: 'Bus Gate', gate_type: 'bus' },
    ];
    setGates(fallback);
    supabase.from('school_gates').select('id, name, gate_type').eq('is_active', true)
      .then(({ data, error }) => {
        if (!error && data?.length) setGates(data);
      }, (err) => { console.warn('[GateSetup] gates load failed:', err); });
  }, []);

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['gateSessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gate_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['gateEntries', selectedSession],
    queryFn: async () => {
      if (!selectedSession) return [];
      const { data, error } = await supabase
        .from('gate_entries')
        .select('*')
        .eq('gate_session_id', selectedSession)
        .order('entry_time', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSession
  });

  const totalRecognized = sessions?.reduce((sum, s) => sum + (s.total_entries || 0), 0) || 0;
  const totalUnknown = sessions?.reduce((sum, s) => sum + (s.unknown_entries || 0), 0) || 0;

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full my-4"
      >
        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="setup" className="gap-2">
              <DoorOpen className="h-4 w-4" /> Setup
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" /> History
            </TabsTrigger>
          </TabsList>

          {/* Setup Tab */}
          <TabsContent value="setup">
            <Card className="border-primary/20">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <DoorOpen className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Gate Mode Setup</CardTitle>
                <CardDescription>
                  Select which gate this device will monitor. The camera will continuously scan faces.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {gates.map(gate => (
                    <Button
                      key={gate.id}
                      variant={selectedGate === gate.name ? 'default' : 'outline'}
                      className="justify-start h-12 text-left"
                      onClick={() => { setSelectedGate(gate.name); setShowCustom(false); }}
                    >
                      <DoorOpen className="h-4 w-4 mr-2" />
                      {gate.name}
                      <span className="ml-auto text-xs text-muted-foreground capitalize">{gate.gate_type}</span>
                    </Button>
                  ))}
                  
                  {showCustom ? (
                    <div className="flex gap-2">
                      <Input
                        value={customGate}
                        onChange={e => setCustomGate(e.target.value)}
                        placeholder="Enter gate name..."
                        className="flex-1"
                      />
                      <Button onClick={() => { if (customGate.trim()) { setSelectedGate(customGate.trim()); setShowCustom(false); } }}>
                        Set
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" className="justify-start" onClick={() => setShowCustom(true)}>
                      <Plus className="h-4 w-4 mr-2" /> Custom Gate
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Camera source</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'webcam', label: 'Webcam' },
                      { value: 'cctv', label: 'CCTV URL' },
                      { value: 'both', label: 'Both' },
                    ].map((item) => (
                      <Button
                        key={item.value}
                        type="button"
                        variant={cameraSource === item.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCameraSource(item.value as 'webcam' | 'cctv' | 'both')}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  {(cameraSource === 'cctv' || cameraSource === 'both') && (
                    <div className="space-y-2">
                      <Label htmlFor="cctv-url" className="text-xs text-muted-foreground">CCTV stream URL (HLS/MP4)</Label>
                      <Input
                        id="cctv-url"
                        value={cctvStreamUrl}
                        onChange={(e) => setCctvStreamUrl(e.target.value)}
                        placeholder="https://camera.example.com/live.m3u8"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 p-2.5">
                    <div>
                      <p className="text-sm font-medium">Crowd hotspot alerts</p>
                      <p className="text-xs text-muted-foreground">Notify when many students gather in one zone.</p>
                    </div>
                    <Switch checked={crowdAlertsEnabled} onCheckedChange={setCrowdAlertsEnabled} />
                  </div>
                </div>

                <Button 
                  variant="secondary"
                  className="w-full h-12 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary font-semibold"
                  disabled={isStarting}
                  onClick={() => startWithConfig('Main Gate')}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isStarting ? 'Starting…' : 'Quick Start — Main Gate'}
                </Button>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isStarting}>
                    <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                  <Button className="flex-1" onClick={() => startWithConfig()} disabled={isStarting}>
                    {isStarting ? 'Starting…' : 'Start Scanning'} <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Gate Entry History
                </CardTitle>
                <CardDescription>View all past gate sessions with stats and entry logs</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Sessions', value: sessions?.length || 0, icon: DoorOpen, color: 'text-primary' },
                    { label: 'Recognized', value: totalRecognized, icon: CheckCircle2, color: 'text-green-500' },
                    { label: 'Unknown', value: totalUnknown, icon: AlertTriangle, color: 'text-destructive' },
                    { label: 'Total', value: totalRecognized + totalUnknown, icon: Users, color: 'text-blue-500' },
                  ].map((stat, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border bg-muted/30 text-center">
                      <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                      <p className="text-xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Sessions list */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sessions</h3>
                    {sessionsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                    ) : sessions?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <DoorOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No sessions yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {sessions?.map((session) => (
                          <button
                            key={session.id}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedSession === session.id
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedSession(session.id)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-foreground">{session.gate_name}</span>
                              <Badge variant={session.ended_at ? 'secondary' : 'default'} className="text-[10px]">
                                {session.ended_at ? 'Ended' : 'Active'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(session.started_at), 'MMM d, h:mm a')}
                              </span>
                              <span className="flex items-center gap-1 text-green-500">
                                <CheckCircle2 className="h-3 w-3" /> {session.total_entries || 0}
                              </span>
                              {(session.unknown_entries || 0) > 0 && (
                                <span className="flex items-center gap-1 text-destructive">
                                  <AlertTriangle className="h-3 w-3" /> {session.unknown_entries}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Entry log */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Entry Log {selectedSession ? '' : '— Select a session'}
                    </h3>
                    {!selectedSession ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ChevronRight className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Select a session</p>
                      </div>
                    ) : entriesLoading ? (
                      Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                    ) : entries?.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">No entries</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                        {entries?.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                              entry.is_recognized ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'
                            }`}>
                              {entry.is_recognized ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{entry.student_name || 'Unknown'}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(entry.entry_time), 'h:mm:ss a')}
                                {entry.confidence && ` · ${Math.round(entry.confidence * 100)}%`}
                              </p>
                            </div>
                            <Badge variant={entry.is_recognized ? 'default' : 'destructive'} className="text-[10px]">
                              {entry.is_recognized ? '✓' : '?'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Back button */}
                <div className="mt-4 pt-4 border-t border-border">
                  <Button variant="outline" className="w-full" onClick={onCancel}>
                    <X className="h-4 w-4 mr-2" /> Back to Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default GateModeSetup;
