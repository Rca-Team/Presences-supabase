import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { backgroundPushService } from '@/services/BackgroundPushService';
import { 
  AlertTriangle, Shield, Phone, Users, Clock, 
  CheckCircle, XCircle, Volume2, Bell, Siren, MapPin
} from 'lucide-react';

interface EmergencyEvent {
  id: string;
  event_type: string;
  triggered_by: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  triggered_at?: string | null;
}

const mapEmergencyEvent = (row: any): EmergencyEvent => {
  const meta = row?.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : null;

  const notes = typeof meta?.notes === 'string' ? meta.notes : (row?.description ?? null);
  const location = typeof meta?.location === 'string' ? meta.location : null;

  return {
    ...row,
    notes,
    location,
    created_at: row?.triggered_at || row?.created_at,
  } as EmergencyEvent;
};

const PanicButton = () => {
  const { toast } = useToast();
  const [emergencies, setEmergencies] = useState<EmergencyEvent[]>([]);
  const [activeEmergency, setActiveEmergency] = useState<EmergencyEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedType, setSelectedType] = useState('lockdown');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    fetchEmergencies();

    const channel = supabase
      .channel('emergency-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_events' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newEmergency = mapEmergencyEvent(payload.new);
          setEmergencies(prev => [newEmergency, ...prev]);
          if (newEmergency.status === 'active') {
            setActiveEmergency(newEmergency);
            // Play alert sound
            playAlertSound();
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapEmergencyEvent(payload.new);
          setEmergencies(prev => prev.map(e => e.id === updated.id ? updated : e));
          if (updated.status !== 'active' && activeEmergency?.id === updated.id) {
            setActiveEmergency(null);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeEmergency]);

  const fetchEmergencies = async () => {
    try {
      const { data, error } = await supabase
        .from('emergency_events')
        .select('id, event_type, triggered_by, status, description, metadata, resolved_at, resolved_by, created_at, triggered_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const mapped = (data || []).map(mapEmergencyEvent);
      setEmergencies(mapped);
      
      const active = mapped.find(e => e.status === 'active');
      if (active) setActiveEmergency(active);
    } catch (error) {
      console.error('Error fetching emergencies:', error);
    } finally {
      setLoading(false);
    }
  };

  const playAlertSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      setTimeout(() => {
        oscillator.frequency.value = 600;
      }, 200);
      
      setTimeout(() => {
        oscillator.stop();
      }, 500);
    } catch (e) {
      console.log('Could not play alert sound');
    }
  };

  const triggerEmergency = async () => {
    if (triggering) return;
    
    setTriggering(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('emergency_events').insert({
        event_type: selectedType,
        triggered_by: userData.user?.id || null,
        status: 'active',
        title: `${selectedType.toUpperCase()} Alert`,
        severity: selectedType === 'medical' ? 'high' : 'critical',
        description: notes || `${selectedType} emergency triggered`,
        metadata: {
          trigger_method: 'button',
          location: location || null,
          notes: notes || null,
        },
      });

      if (error) throw error;

      // Send background push so alert reaches users even when app is closed.
      void backgroundPushService.broadcastEmergency(
        selectedType,
        notes || undefined,
        location || undefined,
      );

      toast({
        title: '🚨 EMERGENCY TRIGGERED',
        description: `${selectedType.toUpperCase()} initiated. All staff notified.`,
        variant: 'destructive',
      });

      setShowConfirm(false);
      setNotes('');
      setLocation('');
    } catch (error) {
      console.error('Error triggering emergency:', error);
      toast({ title: 'Error', description: 'Failed to trigger emergency', variant: 'destructive' });
    } finally {
      setTriggering(false);
    }
  };

  const resolveEmergency = async (emergencyId: string, status: 'resolved' | 'false_alarm') => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('emergency_events')
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: userData.user?.id || null,
        })
        .eq('id', emergencyId);

      if (error) throw error;

      if (status === 'resolved') {
        void backgroundPushService.broadcastEmergency(
          'allclear',
          'Emergency resolved by staff.',
          activeEmergency?.location || undefined,
        );
      }

      toast({
        title: status === 'resolved' ? '✓ Emergency Resolved' : '⚠️ Marked as False Alarm',
        description: 'All staff have been notified',
      });
    } catch (error) {
      console.error('Error resolving emergency:', error);
    }
  };

  const getEmergencyIcon = (type: string) => {
    switch (type) {
      case 'lockdown': return <Shield className="h-6 w-6" />;
      case 'evacuation': return <Users className="h-6 w-6" />;
      case 'medical': return <Phone className="h-6 w-6" />;
      case 'fire': return <Siren className="h-6 w-6" />;
      default: return <AlertTriangle className="h-6 w-6" />;
    }
  };

  const getEmergencyColor = (type: string) => {
    switch (type) {
      case 'lockdown': return 'from-red-600 to-red-800';
      case 'evacuation': return 'from-orange-600 to-orange-800';
      case 'medical': return 'from-blue-600 to-blue-800';
      case 'fire': return 'from-yellow-600 to-red-700';
      default: return 'from-gray-600 to-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Emergency Alert */}
      <AnimatePresence>
        {activeEmergency && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`bg-gradient-to-r ${getEmergencyColor(activeEmergency.event_type)} rounded-xl p-6 border-2 border-white/30`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="p-3 bg-white/20 rounded-full"
                >
                  {getEmergencyIcon(activeEmergency.event_type)}
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold text-white uppercase">
                    {activeEmergency.event_type} ACTIVE
                  </h2>
                  <p className="text-white/80 text-sm">
                    Triggered {new Date(activeEmergency.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                  onClick={() => resolveEmergency(activeEmergency.id, 'false_alarm')}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  False Alarm
                </Button>
                <Button 
                  className="bg-white text-red-600 hover:bg-white/90"
                  onClick={() => resolveEmergency(activeEmergency.id, 'resolved')}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  All Clear
                </Button>
              </div>
            </div>

            {activeEmergency.location && (
              <div className="flex items-center gap-2 text-white/90 mb-2">
                <MapPin className="h-4 w-4" />
                <span>Location: {activeEmergency.location}</span>
              </div>
            )}
            
            {activeEmergency.notes && (
              <p className="text-white/80 bg-black/20 rounded-lg p-3 text-sm">
                {activeEmergency.notes}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Trigger Panel */}
      <Card className="bg-card/50 backdrop-blur border-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-400">
            <Siren className="h-5 w-5" />
            Emergency Response System
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!showConfirm ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { type: 'lockdown', label: 'Lockdown', icon: Shield, color: 'red' },
                { type: 'evacuation', label: 'Evacuate', icon: Users, color: 'orange' },
                { type: 'medical', label: 'Medical', icon: Phone, color: 'blue' },
                { type: 'fire', label: 'Fire', icon: Siren, color: 'yellow' },
              ].map(({ type, label, icon: Icon, color }) => (
                <motion.button
                  key={type}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setSelectedType(type); setShowConfirm(true); }}
                  className={`p-6 rounded-xl border-2 border-${color}-500/30 bg-${color}-500/10 hover:bg-${color}-500/20 transition-all`}
                  disabled={!!activeEmergency}
                >
                  <Icon className={`h-8 w-8 mx-auto mb-2 text-${color}-400`} />
                  <p className="font-semibold">{label}</p>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-red-400 mb-2" />
                <h3 className="text-xl font-bold text-red-400 uppercase mb-1">
                  Confirm {selectedType}?
                </h3>
                <p className="text-sm text-muted-foreground">
                  This will alert all staff members immediately
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Location (optional)</label>
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main-building">Main Building</SelectItem>
                      <SelectItem value="playground">Playground</SelectItem>
                      <SelectItem value="cafeteria">Cafeteria</SelectItem>
                      <SelectItem value="library">Library</SelectItem>
                      <SelectItem value="science-lab">Science Lab</SelectItem>
                      <SelectItem value="gymnasium">Gymnasium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Textarea
                placeholder="Additional notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={triggerEmergency}
                  disabled={triggering}
                >
                  {triggering ? (
                    <span className="animate-pulse">Triggering...</span>
                  ) : (
                    <>
                      <Siren className="mr-2 h-4 w-4" />
                      TRIGGER {selectedType.toUpperCase()}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Emergency History */}
      <Card className="bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Emergency History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            {emergencies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2" />
                <p>No emergency events recorded</p>
              </div>
            ) : (
              emergencies.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border-b border-border/30"
                >
                  <div className={`p-2 rounded-full ${
                    event.status === 'active' ? 'bg-red-500/20 animate-pulse' :
                    event.status === 'resolved' ? 'bg-green-500/20' : 'bg-yellow-500/20'
                  }`}>
                    {getEmergencyIcon(event.event_type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">{event.event_type}</span>
                      <Badge variant={
                        event.status === 'active' ? 'destructive' :
                        event.status === 'resolved' ? 'default' : 'secondary'
                      }>
                        {event.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(event.created_at).toLocaleString()}
                      {event.resolved_at && (
                        <span>
                          • Resolved {new Date(event.resolved_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default PanicButton;
