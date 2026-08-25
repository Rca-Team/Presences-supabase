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
  Bus, Users, MapPin, Clock, Bell, Check, 
  ArrowUp, ArrowDown, AlertTriangle, Phone
} from 'lucide-react';

interface BusInfo {
  id: string;
  bus_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  route_name: string | null;
  capacity: number;
  is_active: boolean;
}

interface BusEvent {
  id: string;
  student_id: string;
  bus_id: string | null;
  event_type: string;
  location: string | null;
  timestamp: string;
  verified_by: string;
  parent_notified: boolean;
  student_name?: string;
  bus_number?: string;
}

const BusTracker = () => {
  const { toast } = useToast();
  const [buses, setBuses] = useState<BusInfo[]>([]);
  const [events, setEvents] = useState<BusEvent[]>([]);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardedCounts, setBoardedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchBuses();
    fetchTodayEvents();

    const channel = supabase
      .channel('bus-events-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_events' }, (payload) => {
        const newEvent = payload.new as BusEvent;
        setEvents(prev => [newEvent, ...prev]);
        
        // Update boarded count
        if (newEvent.bus_id) {
          setBoardedCounts(prev => ({
            ...prev,
            [newEvent.bus_id!]: (prev[newEvent.bus_id!] || 0) + (newEvent.event_type === 'board' ? 1 : -1)
          }));
        }

        toast({
          title: newEvent.event_type === 'board' ? '🚌 Student Boarded' : '🚶 Student Alighted',
          description: `Student ${newEvent.event_type === 'board' ? 'boarded' : 'left'} the bus`,
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBuses = async () => {
    try {
      const { data, error } = await supabase
        .from('buses')
        .select('*')
        .eq('is_active', true)
        .order('bus_number');

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
    }
  };

  const fetchTodayEvents = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('bus_events')
        .select(`
          *,
          buses(bus_number)
        `)
        .gte('timestamp', `${today}T00:00:00`)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      
      // Process events and count boarded students per bus
      const counts: Record<string, number> = {};
      (data || []).forEach(event => {
        if (event.bus_id) {
          if (!counts[event.bus_id]) counts[event.bus_id] = 0;
          counts[event.bus_id] += event.event_type === 'board' ? 1 : -1;
        }
      });
      
      setBoardedCounts(counts);
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const recordBusEvent = async (studentId: string, busId: string, eventType: 'board' | 'alight') => {
    try {
      const { error } = await supabase.from('bus_events').insert({
        student_id: studentId,
        bus_id: busId,
        event_type: eventType,
        verified_by: 'manual',
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error recording bus event:', error);
      toast({ title: 'Error', description: 'Failed to record event', variant: 'destructive' });
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'board': return <ArrowUp className="h-4 w-4 text-green-400" />;
      case 'alight': return <ArrowDown className="h-4 w-4 text-blue-400" />;
      case 'missed': return <AlertTriangle className="h-4 w-4 text-red-400" />;
      default: return <Bus className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Bus Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {buses.map((bus) => (
          <motion.div
            key={bus.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card 
              className={`cursor-pointer transition-all ${
                selectedBus === bus.id 
                  ? 'bg-primary/20 border-primary' 
                  : 'bg-card/50 backdrop-blur hover:bg-card/70'
              }`}
              onClick={() => setSelectedBus(selectedBus === bus.id ? null : bus.id)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bus className="h-5 w-5 text-primary" />
                    <span className="font-bold">{bus.bus_number}</span>
                  </div>
                  <Badge variant="outline" className="bg-green-500/20 text-green-400">
                    Active
                  </Badge>
                </div>
                
                <div className="space-y-1 text-sm text-muted-foreground">
                  {bus.route_name && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {bus.route_name}
                    </div>
                  )}
                  {bus.driver_name && (
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {bus.driver_name}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Students on board</span>
                    <span className="font-bold text-lg">
                      {boardedCounts[bus.id] || 0}/{bus.capacity}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mt-1">
                    <div 
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${((boardedCounts[bus.id] || 0) / bus.capacity) * 100}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {buses.length === 0 && !loading && (
          <Card className="col-span-full bg-muted/30 border-dashed">
            <CardContent className="py-8 text-center">
              <Bus className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No buses configured</p>
              <p className="text-xs text-muted-foreground mt-1">Add buses from the admin panel</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Live Activity Feed */}
      <Card className="bg-card/50 backdrop-blur border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary animate-pulse" />
            Live Bus Activity
            <Badge variant="outline" className="ml-2">Today</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            <AnimatePresence>
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2" />
                  <p>No bus activity today</p>
                </div>
              ) : (
                events
                  .filter(e => !selectedBus || e.bus_id === selectedBus)
                  .map((event, index) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 border-b border-border/30"
                    >
                      <div className={`p-2 rounded-full ${
                        event.event_type === 'board' ? 'bg-green-500/20' :
                        event.event_type === 'alight' ? 'bg-blue-500/20' : 'bg-red-500/20'
                      }`}>
                        {getEventIcon(event.event_type)}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {event.event_type === 'board' ? 'Student boarded' : 
                             event.event_type === 'alight' ? 'Student alighted' : 'Missed pickup'}
                          </span>
                          {event.parent_notified && (
                            <Check className="h-3 w-3 text-green-400" aria-label="Parent notified" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(event.timestamp).toLocaleTimeString()}
                          {event.location && (
                            <>
                              <span>•</span>
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </>
                          )}
                        </div>
                      </div>

                      <Badge variant="outline" className="text-xs">
                        {event.verified_by}
                      </Badge>
                    </motion.div>
                  ))
              )}
            </AnimatePresence>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="pt-4 text-center">
            <ArrowUp className="h-6 w-6 mx-auto text-green-400 mb-1" />
            <p className="text-2xl font-bold">{events.filter(e => e.event_type === 'board').length}</p>
            <p className="text-xs text-muted-foreground">Boarded Today</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="pt-4 text-center">
            <ArrowDown className="h-6 w-6 mx-auto text-blue-400 mb-1" />
            <p className="text-2xl font-bold">{events.filter(e => e.event_type === 'alight').length}</p>
            <p className="text-xs text-muted-foreground">Alighted Today</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border-yellow-500/30">
          <CardContent className="pt-4 text-center">
            <Bus className="h-6 w-6 mx-auto text-yellow-400 mb-1" />
            <p className="text-2xl font-bold">{buses.filter(b => b.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Active Buses</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500/30">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-red-400 mb-1" />
            <p className="text-2xl font-bold">{events.filter(e => e.event_type === 'missed').length}</p>
            <p className="text-xs text-muted-foreground">Missed Pickups</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BusTracker;
