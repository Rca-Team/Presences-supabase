import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Plus, Trash2, Flag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

interface Holiday {
  id: string;
  name: string;
  name_hindi: string | null;
  holiday_date: string;
  holiday_type: string;
  state: string;
  is_half_day: boolean;
}

const INDIAN_STATES = [
  'all', 'Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka',
  'Kerala', 'Maharashtra', 'Madhya Pradesh', 'Rajasthan', 'Tamil Nadu',
  'Telangana', 'Uttar Pradesh', 'West Bengal'
];

const DEFAULT_HOLIDAYS: Omit<Holiday, 'id'>[] = [
  { name: 'Republic Day', name_hindi: null, holiday_date: '2026-01-26', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Holi', name_hindi: null, holiday_date: '2026-03-14', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Good Friday', name_hindi: null, holiday_date: '2026-04-03', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Independence Day', name_hindi: null, holiday_date: '2026-08-15', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Gandhi Jayanti', name_hindi: null, holiday_date: '2026-10-02', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Dussehra', name_hindi: null, holiday_date: '2026-10-20', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Diwali', name_hindi: null, holiday_date: '2026-11-08', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: 'Christmas', name_hindi: null, holiday_date: '2026-12-25', holiday_type: 'national', state: 'all', is_half_day: false },
  { name: "Children's Day", name_hindi: null, holiday_date: '2026-11-14', holiday_type: 'national', state: 'all', is_half_day: true },
  { name: "Teachers' Day", name_hindi: null, holiday_date: '2026-09-05', holiday_type: 'school', state: 'all', is_half_day: true },
];

const IndianHolidayCalendar = () => {
  const { isAdminOrPrincipal } = useUserRole();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', name_hindi: '', holiday_date: '', holiday_type: 'school', state: 'all', is_half_day: false });

  const fetchHolidays = async () => {
    const { data } = await supabase.from('school_holidays').select('*').order('holiday_date');
    if (data) setHolidays(data as Holiday[]);
  };

  useEffect(() => { fetchHolidays(); }, []);

  const loadDefaults = async () => {
    const { error } = await supabase.from('school_holidays').insert(DEFAULT_HOLIDAYS);
    if (error) toast.error('Failed to load defaults');
    else { toast.success('Default Indian holidays loaded!'); fetchHolidays(); }
  };

  const addHoliday = async () => {
    if (!newHoliday.name || !newHoliday.holiday_date) return;
    const { error } = await supabase.from('school_holidays').insert({ ...newHoliday, name_hindi: null });
    if (error) toast.error('Failed to add holiday');
    else { toast.success('Holiday added'); setShowAdd(false); setNewHoliday({ name: '', name_hindi: '', holiday_date: '', holiday_type: 'school', state: 'all', is_half_day: false }); fetchHolidays(); }
  };

  const deleteHoliday = async (id: string) => {
    await supabase.from('school_holidays').delete().eq('id', id);
    fetchHolidays();
  };

  const filtered = holidays.filter(h => stateFilter === 'all' || h.state === 'all' || h.state === stateFilter);
  const upcoming = filtered.filter(h => new Date(h.holiday_date) >= new Date()).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Flag className="h-5 w-5 text-orange-500" />
            Indian Holiday Calendar
          </h2>
          <p className="text-sm text-muted-foreground">National and state holidays - attendance auto-skipped</p>
        </div>
        <div className="flex gap-2">
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All States' : s}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdminOrPrincipal && holidays.length === 0 && (
            <Button onClick={loadDefaults} variant="outline">Load Defaults</Button>
          )}
          {isAdminOrPrincipal && (
            <Button onClick={() => setShowAdd(!showAdd)} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Holiday name" value={newHoliday.name} onChange={e => setNewHoliday(p => ({ ...p, name: e.target.value }))} />
              <Input type="date" value={newHoliday.holiday_date} onChange={e => setNewHoliday(p => ({ ...p, holiday_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Select value={newHoliday.holiday_type} onValueChange={v => setNewHoliday(p => ({ ...p, holiday_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newHoliday.state} onValueChange={v => setNewHoliday(p => ({ ...p, state: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All States' : s}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch checked={newHoliday.is_half_day} onCheckedChange={c => setNewHoliday(p => ({ ...p, is_half_day: c }))} />
                <Label className="text-sm">Half Day</Label>
              </div>
            </div>
            <Button onClick={addHoliday}>Add Holiday</Button>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upcoming Holidays</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {upcoming.map(h => (
                <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-sm">{h.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{new Date(h.holiday_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{h.holiday_type}</Badge>
                    {h.is_half_day && <Badge variant="secondary" className="text-[10px]">Half Day</Badge>}
                    {isAdminOrPrincipal && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteHoliday(h.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Holidays ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No holidays configured. {isAdminOrPrincipal && 'Click "Load Defaults" to add Indian national holidays.'}</p>
          ) : (
            <div className="space-y-1">
              {filtered.map(h => (
                <div key={h.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{h.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(h.holiday_date).toLocaleDateString('en-IN')}</span>
                    <Badge variant="outline" className="text-[10px]">{h.holiday_type}</Badge>
                    {h.is_half_day && <Badge variant="secondary" className="text-[10px]">Half</Badge>}
                    {h.state !== 'all' && <Badge variant="outline" className="text-[10px]">{h.state}</Badge>}
                    {isAdminOrPrincipal && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteHoliday(h.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IndianHolidayCalendar;
