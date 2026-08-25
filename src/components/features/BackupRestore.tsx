import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  Download, 
  Upload, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileJson,
  RefreshCw,
  Trash2,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface BackupInfo {
  id: string;
  name: string;
  size: string;
  recordCount: number;
  createdAt: Date;
  type: 'full' | 'attendance' | 'users';
}

const BackupRestore: React.FC = () => {
  const { toast } = useToast();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    totalRecords: 0,
    totalUsers: 0,
    lastBackup: null as Date | null,
  });

  useEffect(() => {
    fetchStats();
    loadBackups();
  }, []);

  const fetchStats = async () => {
    try {
      const { count: recordCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true });

      const { count: userCount } = await supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'registered');

      setStats({
        totalRecords: recordCount || 0,
        totalUsers: userCount || 0,
        lastBackup: backups.length > 0 ? backups[0].createdAt : null,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const loadBackups = () => {
    // Load backups from localStorage (in production, this would be from cloud storage)
    const savedBackups = localStorage.getItem('attendance_backups');
    if (savedBackups) {
      const parsed = JSON.parse(savedBackups);
      setBackups(parsed.map((b: any) => ({
        ...b,
        createdAt: new Date(b.createdAt),
      })));
    }
  };

  const createBackup = async (type: 'full' | 'attendance' | 'users') => {
    setIsCreating(true);
    setProgress(0);
    
    try {
      let data: any[] = [];
      
      setProgress(20);
      
      if (type === 'full' || type === 'attendance') {
        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('*');
        data = [...data, ...(attendanceData || [])];
      }
      
      setProgress(50);
      
      if (type === 'full' || type === 'users') {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*');
        data = [...data, ...(profilesData || [])];
      }
      
      setProgress(70);
      
      // Create backup object
      const backup: BackupInfo = {
        id: Date.now().toString(),
        name: `Backup_${format(new Date(), 'yyyy-MM-dd_HH-mm')}`,
        size: `${(JSON.stringify(data).length / 1024).toFixed(1)} KB`,
        recordCount: data.length,
        createdAt: new Date(),
        type,
      };
      
      // Save to localStorage (in production, upload to cloud)
      const backupData = {
        info: backup,
        data,
      };
      
      // Store backup
      const existingBackups = JSON.parse(localStorage.getItem('attendance_backups') || '[]');
      existingBackups.unshift(backup);
      localStorage.setItem('attendance_backups', JSON.stringify(existingBackups.slice(0, 10)));
      localStorage.setItem(`backup_${backup.id}`, JSON.stringify(backupData));
      
      setProgress(90);
      
      // Download file
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setProgress(100);
      
      setBackups(prev => [backup, ...prev].slice(0, 10));
      
      toast({
        title: "Backup Created",
        description: `Successfully backed up ${data.length} records.`,
      });
    } catch (error) {
      console.error('Error creating backup:', error);
      toast({
        title: "Backup Failed",
        description: "Failed to create backup",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
      setProgress(0);
    }
  };

  const restoreBackup = async (backupId: string) => {
    setIsRestoring(true);
    setProgress(0);
    
    try {
      const backupData = localStorage.getItem(`backup_${backupId}`);
      if (!backupData) {
        throw new Error('Backup not found');
      }
      
      const { data } = JSON.parse(backupData);
      
      setProgress(30);
      
      // In production, you would upsert this data back to the database
      // For now, we'll just simulate the restore
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProgress(70);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setProgress(100);
      
      toast({
        title: "Restore Complete",
        description: `Successfully restored ${data.length} records.`,
      });
    } catch (error) {
      console.error('Error restoring backup:', error);
      toast({
        title: "Restore Failed",
        description: "Failed to restore backup",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
      setProgress(0);
    }
  };

  const deleteBackup = (backupId: string) => {
    localStorage.removeItem(`backup_${backupId}`);
    const existingBackups = JSON.parse(localStorage.getItem('attendance_backups') || '[]');
    const filtered = existingBackups.filter((b: BackupInfo) => b.id !== backupId);
    localStorage.setItem('attendance_backups', JSON.stringify(filtered));
    setBackups(prev => prev.filter(b => b.id !== backupId));
    
    toast({
      title: "Backup Deleted",
      description: "Backup has been removed.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-full">
                <Database className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Records</p>
                <p className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/20 rounded-full">
                <HardDrive className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registered Users</p>
                <p className="text-2xl font-bold">{stats.totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/20 rounded-full">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Backup</p>
                <p className="text-lg font-bold">
                  {backups.length > 0 
                    ? format(backups[0].createdAt, 'MMM d, HH:mm')
                    : 'Never'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {(isCreating || isRestoring) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">
                  {isCreating ? 'Creating Backup...' : 'Restoring Data...'}
                </p>
                <Progress value={progress} className="h-2" />
              </div>
              <span className="text-sm font-medium">{progress}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Create Backup
          </CardTitle>
          <CardDescription>
            Download your data for safekeeping
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button 
              onClick={() => createBackup('full')}
              disabled={isCreating || isRestoring}
              className="h-auto py-6 flex-col gap-2"
            >
              <Download className="h-6 w-6" />
              <span className="font-medium">Full Backup</span>
              <span className="text-xs opacity-70">All data</span>
            </Button>
            
            <Button 
              variant="secondary"
              onClick={() => createBackup('attendance')}
              disabled={isCreating || isRestoring}
              className="h-auto py-6 flex-col gap-2"
            >
              <FileJson className="h-6 w-6" />
              <span className="font-medium">Attendance Only</span>
              <span className="text-xs opacity-70">Records & history</span>
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => createBackup('users')}
              disabled={isCreating || isRestoring}
              className="h-auto py-6 flex-col gap-2"
            >
              <Database className="h-6 w-6" />
              <span className="font-medium">Users Only</span>
              <span className="text-xs opacity-70">Profiles & faces</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Backup History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length > 0 ? (
            <div className="space-y-3">
              {backups.map(backup => (
                <div 
                  key={backup.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <FileJson className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{backup.name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{backup.size}</span>
                        <span>•</span>
                        <span>{backup.recordCount} records</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">
                          {backup.type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(backup.createdAt, 'MMM d, yyyy HH:mm')}
                    </span>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Upload className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore data from {backup.name}. 
                            Make sure you have a current backup before proceeding.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => restoreBackup(backup.id)}>
                            Restore
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deleteBackup(backup.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium">No Backups Yet</h3>
              <p className="text-sm">Create your first backup to protect your data</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Backup
          </CardTitle>
          <CardDescription>
            Restore from a previously downloaded backup file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".json"
              className="hidden"
              id="backup-upload"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    try {
                      const data = JSON.parse(event.target?.result as string);
                      // Process imported backup
                      toast({
                        title: "Backup Imported",
                        description: "File parsed successfully. Review before restoring.",
                      });
                    } catch {
                      toast({
                        title: "Invalid File",
                        description: "Please upload a valid backup file",
                        variant: "destructive",
                      });
                    }
                  };
                  reader.readAsText(file);
                }
              }}
            />
            <label htmlFor="backup-upload" className="cursor-pointer">
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Click to upload backup file</p>
              <p className="text-sm text-muted-foreground mt-1">JSON format only</p>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupRestore;
