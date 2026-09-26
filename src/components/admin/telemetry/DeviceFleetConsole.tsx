import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  Tablet,
  Monitor,
  Tv,
  Globe,
  Wifi,
  Battery,
  BatteryCharging,
  Cpu,
  Layers,
  MapPin,
  Clock,
  Activity,
  Shield,
  Search,
  Filter,
  RefreshCw,
  Bell,
  Volume2,
  ExternalLink,
  Download,
  Share2,
  Lock,
  Unlock,
  Radio,
  Send,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  User,
  Users,
  Compass,
  Eye,
  Crosshair,
  ShieldAlert,
  Gauge,
  Bug,
  Flame,
  Building,
  Camera,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { shareOrDownloadFile } from '@/utils/nativeShare';
import { TelemetrySessionData, ClientErrorRecord } from '@/services/DeviceTelemetryService';
import RemoteCameraRelayController from '@/components/admin/telemetry/RemoteCameraRelayController';
import SatelliteCameraNodeModal from '@/components/attendance/SatelliteCameraNodeModal';

interface DeviceFleetConsoleProps {
  onLock: () => void;
}

export const DeviceFleetConsole: React.FC<DeviceFleetConsoleProps> = ({ onLock }) => {
  const { toast } = useToast();
  const { trigger: haptic } = useHapticFeedback();
  const [activeSessions, setActiveSessions] = useState<Record<string, TelemetrySessionData>>({});
  const [selectedDeviceErrors, setSelectedDeviceErrors] = useState<{ device: TelemetrySessionData; errors: ClientErrorRecord[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'idle'>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'campus' | 'remote'>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'fleet' | 'map' | 'security' | 'activity'>('fleet');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showCameraRelayModal, setShowCameraRelayModal] = useState(false);
  const [showSatelliteNodeModal, setShowSatelliteNodeModal] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update relative time clock
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  // Listen to Supabase Realtime Fleet Presence
  useEffect(() => {
    const channel = supabase.channel('presence:fleet-radar');

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<TelemetrySessionData>();
        const flattened: Record<string, TelemetrySessionData> = {};

        Object.keys(state).forEach((key) => {
          const presences = state[key];
          if (presences && presences.length > 0) {
            const latest = presences[presences.length - 1];
            flattened[latest.deviceId || key] = latest;
          }
        });

        setActiveSessions(flattened);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (newPresences && newPresences.length > 0) {
          const joined = newPresences[0] as TelemetrySessionData;
          setActiveSessions((prev) => ({
            ...prev,
            [joined.deviceId || key]: joined,
          }));
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setActiveSessions((prev) => {
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sessionList = useMemo(() => Object.values(activeSessions), [activeSessions]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = sessionList.length;
    const online = sessionList.filter((s) => s.status === 'online').length;
    const idle = sessionList.filter((s) => s.status === 'idle').length;
    const onCampus = sessionList.filter((s) => s.geofence?.isOnCampus).length;
    const remote = sessionList.filter((s) => !s.geofence?.isOnCampus).length;
    const authenticated = sessionList.filter((s) => !s.isAnonymous).length;
    const guests = sessionList.filter((s) => s.isAnonymous).length;
    const smartboards = sessionList.filter((s) => s.hardware?.deviceType === 'smartboard').length;
    const anomaliesCount = sessionList.filter((s) => s.security?.isIncognito || s.security?.isMultiAccount).length;
    const errorCount = sessionList.reduce((acc, s) => acc + (s.recentErrors?.length || 0), 0);

    // Top city
    const cityCounts: Record<string, number> = {};
    sessionList.forEach((s) => {
      const city = s.geo?.city || 'Local';
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Delhi';

    // Average latency
    const latencies = sessionList.map((s) => s.hardware?.rttMs).filter(Boolean) as number[];
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 28;

    return { total, online, idle, onCampus, remote, authenticated, guests, smartboards, topCity, avgLatency, anomaliesCount, errorCount };
  }, [sessionList]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessionList.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (locationFilter === 'campus' && !s.geofence?.isOnCampus) return false;
      if (locationFilter === 'remote' && s.geofence?.isOnCampus) return false;
      if (deviceFilter !== 'all' && s.hardware?.deviceType !== deviceFilter) return false;
      if (roleFilter !== 'all') {
        if (roleFilter === 'guest' && !s.isAnonymous) return false;
        if (roleFilter !== 'guest' && s.userRole?.toLowerCase() !== roleFilter.toLowerCase()) return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchIp = s.geo?.ip?.toLowerCase().includes(query);
        const matchCity = s.geo?.city?.toLowerCase().includes(query);
        const matchName = s.userName?.toLowerCase().includes(query);
        const matchEmail = s.userEmail?.toLowerCase().includes(query);
        const matchRoute = s.currentRoute?.toLowerCase().includes(query);
        const matchModel = s.hardware?.brandModel?.toLowerCase().includes(query);
        const matchDevice = s.deviceId?.toLowerCase().includes(query);
        return matchIp || matchCity || matchName || matchEmail || matchRoute || matchModel || matchDevice;
      }
      return true;
    });
  }, [sessionList, statusFilter, locationFilter, deviceFilter, roleFilter, searchQuery]);

  // Send Remote Fleet Commands
  const handleSendCommand = async (
    type: 'ping' | 'alert' | 'reload' | 'lock_kiosk' | 'unlock_kiosk',
    targetDeviceId?: string,
    message?: string
  ) => {
    setIsSendingCommand(true);
    try {
      const channel = supabase.channel('broadcast:fleet-commands');
      await channel.send({
        type: 'broadcast',
        event: type,
        payload: {
          targetDeviceId: targetDeviceId || null,
          message: message || (type === 'ping' ? 'Ping verification from School Admin' : undefined),
          sentAt: Date.now(),
        },
      });

      haptic('success');
      toast({
        title: `Command Dispatched [${type.toUpperCase()}]`,
        description: targetDeviceId
          ? `Sent to device ${targetDeviceId.slice(0, 8)}...`
          : 'Broadcasted to all active fleet devices.',
      });
      setShowBroadcastModal(false);
      setBroadcastMessage('');
    } catch (err) {
      toast({
        title: 'Command Failed',
        description: 'Failed to broadcast fleet message.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingCommand(false);
    }
  };

  // Export session data
  const handleExportSessions = async (format: 'csv' | 'json') => {
    haptic('selection');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'json') {
      const jsonStr = JSON.stringify(sessionList, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      await shareOrDownloadFile(blob, `presences-fleet-telemetry-${timestamp}.json`, 'Presences Live Fleet Telemetry (JSON)');
    } else {
      const headers = [
        'Device ID',
        'User Name',
        'Role',
        'Email',
        'Status',
        'Current Route',
        'Active Duration (s)',
        'Campus Status',
        'Distance to School (m)',
        'IP Address',
        'ISP',
        'City',
        'State/Region',
        'Country',
        'Latitude',
        'Longitude',
        'Device Type',
        'Brand & Model',
        'OS',
        'Browser',
        'CPU Cores',
        'RAM (GB)',
        'GPU Renderer',
        'Battery %',
        'Charging',
        'FPS',
        'Incognito',
        'Multi-Account',
      ];

      const rows = sessionList.map((s) => [
        s.deviceId,
        s.userName || 'Anonymous Guest',
        s.userRole || 'Guest',
        s.userEmail || '',
        s.status,
        s.currentRoute,
        Math.round((now - s.routeEnteredAt) / 1000),
        s.geofence?.isOnCampus ? 'On-Campus' : 'Remote',
        s.geofence?.distanceMeters ?? '',
        s.geo?.ip || '',
        `"${(s.geo?.isp || '').replace(/"/g, '""')}"`,
        s.geo?.city || '',
        s.geo?.region || '',
        s.geo?.country || '',
        s.geo?.latitude || '',
        s.geo?.longitude || '',
        s.hardware?.deviceType || '',
        `"${(s.hardware?.brandModel || '').replace(/"/g, '""')}"`,
        `${s.hardware?.os || ''} ${s.hardware?.osVersion || ''}`,
        `${s.hardware?.browser || ''} ${s.hardware?.browserVersion || ''}`,
        s.hardware?.cpuCores || '',
        s.hardware?.deviceMemoryGB || '',
        `"${(s.hardware?.gpuRenderer || '').replace(/"/g, '""')}"`,
        s.hardware?.batteryLevel ?? '',
        s.hardware?.batteryCharging ?? '',
        s.diagnostics?.fps || 60,
        s.security?.isIncognito ? 'Yes' : 'No',
        s.security?.isMultiAccount ? 'Yes' : 'No',
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      await shareOrDownloadFile(blob, `presences-fleet-telemetry-${timestamp}.csv`, 'Presences Live Fleet Telemetry (CSV)');
    }

    toast({ title: 'Export Complete', description: 'Fleet telemetry session log saved.' });
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-4 h-4" />;
      case 'tablet':
        return <Tablet className="w-4 h-4" />;
      case 'smartboard':
        return <Tv className="w-4 h-4 text-purple-400" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  const formatDuration = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Top Banner & Control Bar */}
      <div className="rounded-3xl p-5 md:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-indigo-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 border border-white/20">
                <Radio className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg md:text-xl font-black tracking-tight">Enterprise Fleet & Session Intelligence</h2>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-bold px-2 py-0.5">
                    REALTIME GEOFENCE
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Live presence, campus geofencing, security anomalies, hardware diagnostics & remote kiosk locks
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCameraRelayModal(true)}
              className="h-8.5 rounded-xl border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold btn-spring"
            >
              <Camera className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Remote Camera Relay
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSatelliteNodeModal(true)}
              className="h-8.5 rounded-xl border-indigo-500/40 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold btn-spring"
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
              Start Camera Station
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBroadcastModal(true)}
              className="h-8.5 rounded-xl border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-bold btn-spring"
            >
              <Bell className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Broadcast Alert
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportSessions('csv')}
              className="h-8.5 rounded-xl border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-bold btn-spring"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
              Export CSV
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExportSessions('json')}
              className="h-8.5 rounded-xl border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-bold btn-spring"
            >
              <Share2 className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
              Export JSON
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                haptic('selection');
                try {
                  sessionStorage.removeItem('presences_telemetry_unlocked');
                } catch {}
                onLock();
              }}
              className="h-8.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold border border-rose-500/30"
              title="Lock Console"
            >
              <Lock className="w-3.5 h-3.5 mr-1" />
              Lock
            </Button>
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mt-5 pt-5 border-t border-white/10">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Devices</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl md:text-2xl font-black text-white">{metrics.total}</span>
              <span className="text-[11px] font-bold text-emerald-400 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1 animate-pulse" />
                {metrics.online} Online
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Campus Geofence</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl md:text-2xl font-black text-emerald-400">{metrics.onCampus}</span>
              <span className="text-[10px] text-slate-300">/ {metrics.remote} Remote</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Logged In Staff</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl md:text-2xl font-black text-blue-400">{metrics.authenticated}</span>
              <span className="text-[10px] text-slate-400">{metrics.guests} Guests</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Security Flags</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-xl md:text-2xl font-black ${metrics.anomaliesCount > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                {metrics.anomaliesCount}
              </span>
              <span className="text-[10px] text-slate-400">{metrics.anomaliesCount > 0 ? 'Audit Alert' : 'Clean'}</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Latency & Jitter</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl md:text-2xl font-black text-emerald-400">{metrics.avgLatency}ms</span>
              <span className="text-[10px] text-slate-400">RTT</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client Errors</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-xl md:text-2xl font-black ${metrics.errorCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {metrics.errorCount}
              </span>
              <span className="text-[10px] text-slate-400">Captured</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs, Search & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setActiveTab('fleet');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'fleet'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Active Fleet ({filteredSessions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setActiveTab('map');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'map'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Campus Geofence Map</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setActiveTab('security');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'security'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Security & Audit ({metrics.anomaliesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptic('selection');
              setActiveTab('activity');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'activity'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Activity Stream</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[170px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search IP, Name, Route, City..."
              className="h-8 pl-8 pr-3 text-xs rounded-xl"
            />
          </div>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value as any)}
            className="h-8 px-2 rounded-xl text-xs font-medium bg-muted border border-input text-foreground"
          >
            <option value="all">All Locations</option>
            <option value="campus">On Campus Zone</option>
            <option value="remote">Remote / Off-Campus</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-8 px-2 rounded-xl text-xs font-medium bg-muted border border-input text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="online">Online Only</option>
            <option value="idle">Idle Only</option>
          </select>

          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="h-8 px-2 rounded-xl text-xs font-medium bg-muted border border-input text-foreground"
          >
            <option value="all">All Devices</option>
            <option value="mobile">Mobile Phones</option>
            <option value="tablet">Tablets</option>
            <option value="desktop">Desktop PCs</option>
            <option value="smartboard">Smart Boards</option>
          </select>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.length === 0 ? (
            <Card className="col-span-full p-12 text-center border-dashed">
              <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
                <Smartphone className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold">No Active Devices Matching Criteria</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {sessionList.length === 0
                  ? 'Listening for incoming device telemetry heartbeats on Supabase Realtime channel...'
                  : 'Try clearing your search query or adjusting status/geofence filters.'}
              </p>
            </Card>
          ) : (
            filteredSessions.map((session) => {
              const isOnline = session.status === 'online';
              const timeOnRoute = now - (session.routeEnteredAt || session.sessionStartedAt || now);
              const battery = session.hardware?.batteryLevel;
              const isCharging = session.hardware?.batteryCharging;
              const isLowBattery = battery !== null && battery !== undefined && battery < 15 && !isCharging;
              const lat = session.geo?.latitude;
              const lng = session.geo?.longitude;
              const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
              const isOnCampus = session.geofence?.isOnCampus;
              const errorCount = session.recentErrors?.length || 0;

              return (
                <motion.div
                  key={session.deviceId}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl bg-card border border-border/80 shadow-sm hover:shadow-md transition-all p-4.5 space-y-3 relative overflow-hidden"
                >
                  {/* Status breathing accent */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      session.isKioskLocked
                        ? 'bg-rose-600'
                        : isOnline
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />

                  {/* Top Bar: Device Type, OS Badge & Online Status */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-muted flex items-center justify-center text-primary shrink-0">
                        {getDeviceIcon(session.hardware?.deviceType || 'desktop')}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {session.hardware?.brandModel || 'Web Client'}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {session.hardware?.os} {session.hardware?.osVersion} · {session.hardware?.browser}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {session.isKioskLocked && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                          LOCKED
                        </Badge>
                      )}
                      {session.hardware?.isPWA && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                          PWA
                        </Badge>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          isOnline
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        {isOnline ? 'Online' : 'Idle'}
                      </span>
                    </div>
                  </div>

                  {/* Campus Geofence Tag & Security Flag Bar */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                        isOnCampus
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                      }`}
                    >
                      <Building className="w-3 h-3" />
                      <span>{session.geofence?.campusZoneName || 'Campus Zone'}</span>
                    </span>

                    {session.security?.isIncognito && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                        🕵️ Incognito
                      </Badge>
                    )}

                    {session.security?.isMultiAccount && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-400 border-amber-500/20">
                        ⚠️ Multi-User ({session.security.accountsSeenCount})
                      </Badge>
                    )}

                    {isLowBattery && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 animate-pulse">
                        Low Battery {battery}%
                      </Badge>
                    )}
                  </div>

                  {/* User Profile / Guest Badge */}
                  <div className="p-2.5 rounded-xl bg-muted/50 border flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                        {session.userName ? session.userName.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {session.userName || 'Anonymous Visitor'}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {session.userEmail || `ID: ${session.deviceId.slice(0, 12)}...`}
                        </p>
                      </div>
                    </div>

                    <Badge
                      className={`text-[9px] font-bold px-2 py-0.5 shrink-0 ${
                        session.isAnonymous
                          ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                      }`}
                    >
                      {session.userRole || 'Guest'}
                    </Badge>
                  </div>

                  {/* Active Route & Duration */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        <Compass className="w-3 h-3 text-primary" />
                        Active Page:
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatDuration(timeOnRoute)} on page
                      </span>
                    </div>
                    <div className="px-2.5 py-1.5 rounded-xl bg-primary/5 border border-primary/15 flex items-center justify-between">
                      <span className="text-xs font-mono font-extrabold text-primary truncate">
                        {session.currentRoute}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[120px]">
                        {session.pageTitle}
                      </span>
                    </div>
                  </div>

                  {/* IP Address & Physical Location */}
                  <div className="p-2.5 rounded-xl bg-slate-900 text-white space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                        <span>{session.geo?.countryFlag || '🌐'}</span>
                        <span>{session.geo?.ip || '127.0.0.1'}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                        {session.geo?.isp}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 text-[10px]">
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                        <span>{session.geo?.city}, {session.geo?.region}</span>
                      </span>

                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 shrink-0 font-bold underline"
                          title="Open coordinates in Google Maps"
                        >
                          <span>Maps</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Diagnostics & Performance Grid */}
                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="p-1.5 rounded-lg bg-muted/60 border text-center">
                      <p className="text-muted-foreground font-semibold">Framerate</p>
                      <p className="font-bold text-foreground truncate mt-0.5">
                        {session.diagnostics?.fps || 60} FPS
                      </p>
                    </div>

                    <div className="p-1.5 rounded-lg bg-muted/60 border text-center">
                      <p className="text-muted-foreground font-semibold">Health Score</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                        {session.security?.connectionQualityScore || 98}%
                      </p>
                    </div>

                    <div className="p-1.5 rounded-lg bg-muted/60 border text-center">
                      <p className="text-muted-foreground font-semibold">Power</p>
                      <p className="font-bold text-foreground truncate mt-0.5 flex items-center justify-center gap-0.5">
                        {isCharging ? <BatteryCharging className="w-3 h-3 text-emerald-500" /> : <Battery className="w-3 h-3" />}
                        <span>{battery !== null && battery !== undefined ? `${battery}%` : 'AC'}</span>
                      </p>
                    </div>
                  </div>

                  {/* Error Log Indicator */}
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceErrors({ device: session, errors: session.recentErrors })}
                      className="w-full py-1 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold flex items-center justify-center gap-1.5"
                    >
                      <Bug className="w-3 h-3 shrink-0" />
                      <span>{errorCount} Client Error{errorCount > 1 ? 's' : ''} Captured (Click to view)</span>
                    </button>
                  )}

                  {/* Remote Action Buttons */}
                  <div className="pt-2 border-t flex items-center justify-between gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSendingCommand}
                      onClick={() => handleSendCommand('ping', session.deviceId)}
                      className="h-7 px-2 text-[11px] rounded-lg border-primary/20 hover:bg-primary/10 text-primary font-bold flex-1"
                      title="Send Remote Ping Chime"
                    >
                      <Volume2 className="w-3 h-3 mr-1" />
                      Ping
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSendingCommand}
                      onClick={() => {
                        const msg = window.prompt('Enter announcement text to send to this device:');
                        if (msg) handleSendCommand('alert', session.deviceId, msg);
                      }}
                      className="h-7 px-2 text-[11px] rounded-lg border-amber-500/30 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold flex-1"
                      title="Send Alert Toast"
                    >
                      <Bell className="w-3 h-3 mr-1" />
                      Alert
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSendingCommand}
                      onClick={() => {
                        if (session.isKioskLocked) {
                          handleSendCommand('unlock_kiosk', session.deviceId);
                        } else {
                          const reason = window.prompt('Enter maintenance lock reason:', 'Device locked for classroom maintenance');
                          if (reason) handleSendCommand('lock_kiosk', session.deviceId, reason);
                        }
                      }}
                      className={`h-7 px-2 text-[11px] rounded-lg font-bold ${
                        session.isKioskLocked
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : 'bg-muted hover:bg-muted/80 text-foreground border-input'
                      }`}
                      title={session.isKioskLocked ? 'Unlock Kiosk Terminal' : 'Lock Kiosk Terminal'}
                    >
                      {session.isKioskLocked ? <Unlock className="w-3 h-3 text-emerald-500" /> : <Lock className="w-3 h-3 text-slate-400" />}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSendingCommand}
                      onClick={() => {
                        if (window.confirm('Force reload this client browser remotely?')) {
                          handleSendCommand('reload', session.deviceId);
                        }
                      }}
                      className="h-7 px-2 text-[11px] rounded-lg hover:bg-rose-500/10 text-rose-500 font-bold"
                      title="Remote Force Refresh"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Security & Audit Tab */}
      {activeTab === 'security' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <span>Security & Device Audit Roster</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detailed audit of incognito sessions, multi-account device sharing, and proxy connections
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-bold px-3 py-1">
              {metrics.anomaliesCount} Audit Flag{metrics.anomaliesCount > 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="space-y-3">
            {sessionList
              .filter((s) => s.security?.isIncognito || s.security?.isMultiAccount || s.security?.isVPNorProxy)
              .map((s) => (
                <div key={s.deviceId} className="p-4 rounded-2xl bg-card border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">{s.userName || 'Anonymous Visitor'} ({s.hardware?.brandModel})</h4>
                        <p className="text-[10px] text-muted-foreground">IP: {s.geo?.ip} · {s.geo?.city}, {s.geo?.country}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {s.security?.isIncognito && (
                        <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-[10px]">
                          Incognito Mode
                        </Badge>
                      )}
                      {s.security?.isMultiAccount && (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                          {s.security.accountsSeenCount} Accounts on Device
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

            {metrics.anomaliesCount === 0 && (
              <div className="p-8 text-center border-dashed border rounded-2xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-foreground">Zero Security Flags Detected</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">All connected clients are using verified direct school connections.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Campus Geofence Map Tab */}
      {activeTab === 'map' && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <span>Campus Geofence Distribution</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Physical distance and geolocation clusters relative to PM Shri KV Campus
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-bold">
                {metrics.onCampus} On Campus
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs font-bold">
                {metrics.remote} Remote
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Object.entries(
              sessionList.reduce((acc, s) => {
                const city = s.geo?.city || 'Unknown';
                if (!acc[city]) acc[city] = [];
                acc[city].push(s);
                return acc;
              }, {} as Record<string, TelemetrySessionData[]>)
            ).map(([city, list]) => {
              const first = list[0];
              const lat = first.geo?.latitude;
              const lng = first.geo?.longitude;
              const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

              return (
                <div key={city} className="p-4 rounded-2xl bg-card border shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{first.geo?.countryFlag || '🌐'}</span>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{city}</h4>
                        <p className="text-[10px] text-muted-foreground">{first.geo?.region}, {first.geo?.country}</p>
                      </div>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
                      {list.length} Device{list.length > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
                    <p>Coordinates: {lat?.toFixed(4)}, {lng?.toFixed(4)}</p>
                    <p>ISP: {first.geo?.isp || 'Broadband'}</p>
                    <p>Timezone: {first.geo?.timezone}</p>
                  </div>

                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-600 pt-1"
                    >
                      <span>View on Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Live Activity Stream Tab */}
      {activeTab === 'activity' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <span>Live Fleet Activity Feed</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chronological real-time stream of page transitions and student/staff actions
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Stream
            </span>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {sessionList
              .flatMap((s) => (s.recentEvents || []).map((e) => ({ ...e, device: s })))
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 35)
              .map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl bg-muted/40 border flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {evt.description}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {evt.device.userName || 'Guest'} · {evt.device.hardware?.brandModel} · {evt.device.geo?.city}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Client Error Diagnostics Modal */}
      {selectedDeviceErrors && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl bg-card border p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <Bug className="w-5 h-5 text-rose-500" />
                <span>Remote Client Diagnostics ({selectedDeviceErrors.device.hardware?.brandModel})</span>
              </h3>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setSelectedDeviceErrors(null)}>
                ✕
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Captured unhandled JavaScript exceptions and promise rejections from this device:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {selectedDeviceErrors.errors.map((err) => (
                <div key={err.id} className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono">
                  <p className="font-bold">{err.message}</p>
                  {err.source && <p className="text-[10px] opacity-75 mt-0.5">{err.source}:{err.lineno}:{err.colno}</p>}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setSelectedDeviceErrors(null)} className="rounded-xl text-xs font-bold">
                Close Inspector
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-3xl bg-card border p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <span>Broadcast Fleet Announcement</span>
              </h3>
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={() => setShowBroadcastModal(false)}>
                ✕
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              This message will appear instantly as an alert notification on all {metrics.total} connected school devices.
            </p>

            <Input
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="e.g. Please proceed to the assembly hall for announcement..."
              className="rounded-xl text-xs"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowBroadcastModal(false)} className="rounded-xl text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!broadcastMessage.trim() || isSendingCommand}
                onClick={() => handleSendCommand('alert', undefined, broadcastMessage)}
                className="rounded-xl text-xs font-bold"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Send Broadcast
              </Button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Remote Cross-Device Camera Relay Controller Modal */}
      {showCameraRelayModal && (
        <RemoteCameraRelayController
          isOpen={showCameraRelayModal}
          onClose={() => setShowCameraRelayModal(false)}
        />
      )}

      {/* Satellite Camera Station Node Modal */}
      {showSatelliteNodeModal && (
        <SatelliteCameraNodeModal
          isOpen={showSatelliteNodeModal}
          onClose={() => setShowSatelliteNodeModal(false)}
        />
      )}
    </div>
  );
};

export default DeviceFleetConsole;
