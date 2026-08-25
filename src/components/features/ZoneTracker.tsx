import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Users, Clock, AlertTriangle, Shield, 
  Eye, Lock, Unlock, Activity
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
  description: string | null;
  zone_type: string | null;
  is_restricted: boolean;
  allowed_categories: string[] | null;
  camera_id: string | null;
}

interface ZoneEntry {
  id: string;
  student_id: string;
  zone_id: string | null;
  entry_time: string;
  exit_time: string | null;
  is_authorized: boolean;
  alert_triggered: boolean;
  zone_name?: string;
}

const ZoneTracker = () => {
  const { toast } = useToast();
  const [zones, setZones] = useState<Zone[]>([]);
  const [entries, setEntries] = useState<ZoneEntry[]>([]);
  const [zoneCounts, setZoneCounts] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<ZoneEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
    fetchTodayEntries();

    const channel = supabase
      .channel('zone-entries-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'zone_entries' }, (payload) => {
        const newEntry = payload.new as ZoneEntry;
        setEntries(prev => [newEntry, ...prev]);
        
        // Update zone count
        if (newEntry.zone_id && !newEntry.exit_time) {
          setZoneCounts(prev => ({
            ...prev,
            [newEntry.zone_id!]: (prev[newEntry.zone_id!] || 0) + 1
          }));
        }

        // Check for unauthorized access
        if (!newEntry.is_authorized) {
          setAlerts(prev => [newEntry, ...prev]);
          toast({
            title: '🚨 Unauthorized Access',
            description: 'A student entered a restricted zone',
            variant: 'destructive',
          });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'zone_entries' }, (payload) => {
        const updatedEntry = payload.new as ZoneEntry;
        setEntries(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
        
        // Update zone count if exited
        if (updatedEntry.exit_time && updatedEntry.zone_id) {
          setZoneCounts(prev => ({
            ...prev,
            [updatedEntry.zone_id!]: Math.max(0, (prev[updatedEntry.zone_id!] || 1) - 1)
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchZones = async () => {
    try {
      const { data, error } = await supabase
        .from('campus_zones')
        .select('*')
        .order('name');

      if (error) throw error;
      setZones(data || []);
    } catch (error) {
      console.error('Error fetching zones:', error);
    }
  };

  const fetchTodayEntries = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('zone_entries')
        .select(`
          *,
          campus_zones(name)
        `)
        .gte('entry_time', `${today}T00:00:00`)
        .order('entry_time', { ascending: false });

      if (error) throw error;

      // Calculate current occupancy per zone
      const counts: Record<string, number> = {};
      (data || []).forEach(entry => {
        if (entry.zone_id && !entry.exit_time) {
          counts[entry.zone_id] = (counts[entry.zone_id] || 0) + 1;
        }
      });

      setZoneCounts(counts);
      setEntries(data || []);
      setAlerts((data || []).filter(e => !e.is_authorized));
    } catch (error) {
      console.error('Error fetching entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const getZoneIcon = (type: string | null) => {
    switch (type) {
      case 'classroom': return '📚';
      case 'library': return '📖';
      case 'cafeteria': return '🍽️';
      case 'playground': return '⚽';
      case 'lab': return '🔬';
      case 'office': return '🏢';
      case 'restricted': return '🚫';
      case 'entrance': return '🚪';
      case 'exit': return '🚶';
      default: return '📍';
    }
  };

  const getZoneColor = (zone: Zone) => {
    if (zone.is_restricted) return 'border-red-500/50 bg-red-500/10';
    switch (zone.zone_type) {
      case 'entrance':
      case 'exit': return 'border-green-500/50 bg-green-500/10';
      case 'lab': return 'border-yellow-500/50 bg-yellow-500/10';
      case 'office': return 'border-purple-500/50 bg-purple-500/10';
      default: return 'border-blue-500/50 bg-blue-500/10';
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/20 border border-red-500/50 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertTriangle className="h-5 w-5 animate-pulse" />
            <span className="font-bold">Unauthorized Access Alerts ({alerts.length})</span>
          </div>
          <ScrollArea className="max-h-24">
            {alerts.slice(0, 3).map(alert => (
              <div key={alert.id} className="text-sm text-red-300 flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {new Date(alert.entry_time).toLocaleTimeString()} - Restricted zone accessed
              </div>
            ))}
          </ScrollArea>
        </motion.div>
      )}

      {/* Zone Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {zones.map((zone) => (
          <motion.div
            key={zone.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card className={`${getZoneColor(zone)} transition-all cursor-pointer`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{getZoneIcon(zone.zone_type)}</span>
                  {zone.is_restricted ? (
                    <Lock className="h-4 w-4 text-red-400" />
                  ) : (
                    <Unlock className="h-4 w-4 text-green-400" />
                  )}
                </div>
                
                <h3 className="font-semibold text-sm mb-1">{zone.name}</h3>
                
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Users className="h-3 w-3" />
                    <span>Currently</span>
                  </div>
                  <span className="text-xl font-bold text-primary">
                    {zoneCounts[zone.id] || 0}
                  </span>
                </div>

                {zone.is_restricted && (
                  <Badge variant="destructive" className="w-full mt-2 justify-center text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    Restricted
                  </Badge>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Live Zone Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Movements */}
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary animate-pulse" />
              Live Zone Movements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <AnimatePresence>
                {entries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2" />
                    <p>No zone activity today</p>
                  </div>
                ) : (
                  entries.slice(0, 20).map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={`flex items-center gap-3 p-2 rounded-lg mb-1 ${
                        !entry.is_authorized ? 'bg-red-500/10 border border-red-500/30' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        entry.exit_time ? 'bg-gray-400' : 'bg-green-400 animate-pulse'
                      }`} />
                      
                      <div className="flex-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {zones.find(z => z.id === entry.zone_id)?.name || 'Unknown Zone'}
                          </span>
                          {!entry.is_authorized && (
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(entry.entry_time).toLocaleTimeString()}
                          {entry.exit_time && (
                            <span>→ {new Date(entry.exit_time).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>

                      <Badge variant={entry.exit_time ? 'secondary' : 'default'} className="text-xs">
                        {entry.exit_time ? 'Exited' : 'Inside'}
                      </Badge>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Zone Statistics */}
        <Card className="bg-card/50 backdrop-blur border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-primary" />
              Zone Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {zones.slice(0, 6).map(zone => {
                const count = zoneCounts[zone.id] || 0;
                const maxCapacity = 50; // Assume 50 per zone
                const percentage = (count / maxCapacity) * 100;
                
                return (
                  <div key={zone.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span>{getZoneIcon(zone.zone_type)}</span>
                        <span>{zone.name}</span>
                      </div>
                      <span className="font-mono">{count}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div 
                        className={`rounded-full h-1.5 transition-all ${
                          percentage > 80 ? 'bg-red-500' :
                          percentage > 50 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-border/30">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {Object.values(zoneCounts).reduce((a, b) => a + b, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total in Zones</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">
                  {alerts.length}
                </p>
                <p className="text-xs text-muted-foreground">Alerts Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ZoneTracker;
