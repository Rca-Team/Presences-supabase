import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Calendar, Download, Eye, X } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AttendanceRecord {
  id: string;
  name: string;
  timestamp: string;
  status: string;
  image_url?: string;
  confidence_score?: number;
}

const AttendanceGallery = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('today');
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecords();
  }, [dateFilter]);

  useEffect(() => {
    applyFilters();
  }, [records, searchQuery, statusFilter]);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('attendance_records')
        .select('id, status, timestamp, confidence_score, user_id, device_info, image_url')
        .order('timestamp', { ascending: false });

      // Apply date filter
      if (dateFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('timestamp', today.toISOString());
      } else if (dateFilter === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('timestamp', weekAgo.toISOString());
      } else if (dateFilter === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        query = query.gte('timestamp', monthAgo.toISOString());
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      // Process records
      const processedRecords = await Promise.all(
        (data || []).map(async (record) => {
          let username = 'Unknown';
          
          if (record.device_info) {
            try {
              const deviceInfo = typeof record.device_info === 'string' 
                ? JSON.parse(record.device_info) 
                : record.device_info;
              
              if (deviceInfo.metadata?.name) {
                username = deviceInfo.metadata.name;
              } else if (deviceInfo.name) {
                username = deviceInfo.name;
              }
            } catch (e) {
              console.error('Error parsing device_info:', e);
            }
          }

          return {
            id: record.id,
            name: username,
            timestamp: record.timestamp,
            status: record.status === 'present' ? 'Present' : record.status === 'late' ? 'Late' : 'Absent',
            image_url: record.image_url,
            confidence_score: record.confidence_score
          };
        })
      );

      setRecords(processedRecords);
    } catch (error) {
      console.error('Error fetching attendance records:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...records];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(record =>
        record.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(record =>
        record.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    setFilteredRecords(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'present':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500';
      default:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500';
    }
  };

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Attendance Gallery</h3>
              <p className="text-sm text-muted-foreground">
                {filteredRecords.length} records found
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchRecords}>
              <Calendar className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Gallery Grid */}
          <ScrollArea className="h-[600px] pr-4">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-muted rounded-lg h-48" />
                  </div>
                ))}
              </div>
            ) : filteredRecords.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecords.map((record) => (
                  <Card
                    key={record.id}
                    className="overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group"
                    onClick={() => setSelectedRecord(record)}
                  >
                    <div className="relative aspect-video bg-muted">
                      {record.image_url ? (
                        <img
                          src={record.image_url}
                          alt={record.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Avatar className="w-20 h-20">
                            <AvatarFallback className="text-2xl">
                              {record.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="h-8 w-8 text-white" />
                      </div>
                      <Badge className={`absolute top-2 right-2 ${getStatusColor(record.status)}`}>
                        {record.status}
                      </Badge>
                    </div>
                    <div className="p-3">
                      <p className="font-medium truncate">{record.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(record.timestamp), 'MMM d, yyyy • h:mm a')}
                      </p>
                      {record.confidence_score && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Confidence: {(record.confidence_score * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p>No records found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={() => setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attendance Details</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                {selectedRecord.image_url ? (
                  <img
                    src={selectedRecord.image_url}
                    alt={selectedRecord.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Avatar className="w-32 h-32">
                      <AvatarFallback className="text-4xl">
                        {selectedRecord.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedRecord.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getStatusColor(selectedRecord.status)}>
                    {selectedRecord.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedRecord.timestamp), 'MMM d, yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium">
                    {format(new Date(selectedRecord.timestamp), 'h:mm a')}
                  </p>
                </div>
                {selectedRecord.confidence_score && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Confidence Score</p>
                    <p className="font-medium">
                      {(selectedRecord.confidence_score * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AttendanceGallery;
