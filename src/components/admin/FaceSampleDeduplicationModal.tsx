import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import {
  Sparkles,
  Trash2,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Layers,
  HardDrive,
  Users,
  Eye,
  Check,
} from 'lucide-react';
import {
  scanDuplicateFaceSamples,
  executeDeduplication,
  DeduplicationScanResult,
  StudentDeduplicationGroup,
} from '@/services/face-recognition/FaceSampleDeduplicationService';

interface FaceSampleDeduplicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  targetUserId?: string;
}

export const FaceSampleDeduplicationModal: React.FC<FaceSampleDeduplicationModalProps> = ({
  open,
  onOpenChange,
  onCompleted,
  targetUserId,
}) => {
  const { toast } = useToast();
  const { trigger: haptic } = useHapticFeedback();
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [scanResult, setScanResult] = useState<DeduplicationScanResult | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);
  const [completedReport, setCompletedReport] = useState<{
    count: number;
    bytes: number;
  } | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleScan = useCallback(async () => {
    setScanning(true);
    setCompletedReport(null);
    try {
      const result = await scanDuplicateFaceSamples();
      setScanResult(result);
      if (result.groups.length > 0) {
        setExpandedStudentKey(result.groups[0].userId || result.groups[0].employeeId || null);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      toast({
        title: 'Scan Failed',
        description: err.message || 'Could not scan duplicate face samples.',
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      handleScan();
    }
  }, [open, handleScan]);

  const handleRunDeduplication = async (specificUserId?: string) => {
    setCleaning(true);
    haptic('medium');
    try {
      const result = await executeDeduplication({
        targetUserId: specificUserId || targetUserId,
        onProgress: setProgress,
      });

      if (result.success) {
        haptic('success');
        setCompletedReport({
          count: result.totalDuplicatesRemoved,
          bytes: result.storageReclaimedBytes,
        });

        toast({
          title: '⚡ Cloud Storage Optimized',
          description: `Successfully pruned ${result.totalDuplicatesRemoved} duplicate photos and reclaimed ${formatBytes(result.storageReclaimedBytes)} of cloud storage!`,
        });

        // Re-scan to update view
        await handleScan();
        onCompleted?.();
      } else {
        toast({
          title: 'Optimization Issues',
          description: result.errors[0] || 'Some items could not be cleaned.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Deduplication error:', err);
      toast({
        title: 'Deduplication Failed',
        description: err.message || 'Failed to remove duplicates.',
        variant: 'destructive',
      });
    } finally {
      setCleaning(false);
      setProgress(null);
    }
  };

  const displayedGroups = scanResult?.groups || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-lenis-prevent="true"
        className="max-w-3xl w-[95vw] max-h-[88vh] flex flex-col p-0 overflow-hidden bg-card/95 backdrop-blur-2xl border border-primary/20 shadow-2xl rounded-3xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-border/60 bg-gradient-to-r from-primary/10 via-card to-accent/10 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/20 text-primary border border-primary/30 shadow-md">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  AI Cloud Storage Optimizer
                </DialogTitle>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px] font-bold uppercase tracking-wider">
                  Lossless Deduplication
                </Badge>
              </div>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Automatically identifies duplicate photo downloads, burst captures, and redundant descriptor copies to free up cloud storage.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-5 overflow-y-auto space-y-4">
          {/* Status Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-card/60 border border-border/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Users className="w-3.5 h-3.5 text-blue-500" /> Students Scanned
              </div>
              <div className="text-lg sm:text-xl font-bold text-foreground mt-1 tabular-nums">
                {scanning ? '...' : scanResult?.totalStudentsScanned ?? 0}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-card/60 border border-border/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <Layers className="w-3.5 h-3.5 text-amber-500" /> Duplicates Found
              </div>
              <div className="text-lg sm:text-xl font-bold text-amber-500 mt-1 tabular-nums">
                {scanning ? '...' : scanResult?.totalDuplicatesFound ?? 0}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-card/60 border border-border/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <HardDrive className="w-3.5 h-3.5 text-emerald-500" /> Storage Wasted
              </div>
              <div className="text-lg sm:text-xl font-bold text-emerald-500 mt-1 tabular-nums">
                {scanning ? '...' : formatBytes(scanResult?.estimatedBytesSaved ?? 0)}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-card/60 border border-border/60 shadow-xs flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Safety Mode
              </div>
              <div className="text-xs font-bold text-primary mt-1">
                Primary Preserved
              </div>
            </div>
          </div>

          {/* Execution Progress */}
          {cleaning && progress && (
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span>{progress.label}</span>
                <span className="tabular-nums">
                  {Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%
                </span>
              </div>
              <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2" />
            </div>
          )}

          {/* Success Banner */}
          {completedReport && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  Optimization Completed Successfully!
                </p>
                <p className="text-xs text-muted-foreground">
                  Pruned {completedReport.count} duplicate records and reclaimed {formatBytes(completedReport.bytes)} of cloud storage.
                </p>
              </div>
            </div>
          )}

          {/* List of Detected Duplicates */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Duplicate Breakdown by Student ({displayedGroups.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleScan}
                disabled={scanning || cleaning}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
                Re-scan
              </Button>
            </div>

            {scanning ? (
              <div className="text-center py-12 space-y-2">
                <RefreshCw className="w-6 h-6 mx-auto animate-spin text-primary" />
                <p className="text-xs font-semibold text-muted-foreground">Analyzing cloud face samples and descriptors...</p>
              </div>
            ) : displayedGroups.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-border/60 space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/80" />
                <p className="text-sm font-bold text-foreground">Zero Duplicate Storage Waste Found!</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  All face samples and biometric models in your database are fully deduplicated and optimized.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedGroups.map((group) => {
                  const key = group.userId || group.employeeId || group.studentName;
                  const isExpanded = expandedStudentKey === key;

                  return (
                    <div
                      key={key}
                      className="rounded-2xl border border-border/60 bg-card/60 hover:bg-card transition-all overflow-hidden"
                    >
                      <div
                        onClick={() => setExpandedStudentKey(isExpanded ? null : key)}
                        className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary overflow-hidden shrink-0">
                            {group.avatarUrl ? (
                              <img src={group.avatarUrl} alt={group.studentName} className="w-full h-full object-cover" />
                            ) : (
                              group.studentName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{group.studentName}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              ID: {group.employeeId || 'N/A'} {group.classSection ? `• ${group.classSection}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="destructive" className="text-[10px] font-bold px-2 py-0.5">
                            {group.duplicateCount} duplicate{group.duplicateCount === 1 ? '' : 's'}
                          </Badge>
                          <span className="text-xs text-emerald-500 font-bold tabular-nums">
                            -{formatBytes(group.estimatedBytesSaved)}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Duplicate Preview */}
                      {isExpanded && (
                        <div className="p-3.5 pt-0 border-t border-border/40 bg-muted/15 space-y-3">
                          <div className="flex items-center justify-between pt-2">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                              Preview: 1 Kept vs {group.duplicateSamples.length} Redundant Copies
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={cleaning}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunDeduplication(group.userId || group.employeeId);
                              }}
                              className="h-6 text-[10px] font-bold px-2 text-destructive hover:bg-destructive/10 border-destructive/30"
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Clean This Student
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {/* Kept Item */}
                            {group.keeperSample && (
                              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/40 relative">
                                <span className="absolute top-1 right-1 z-10 px-1.5 py-0.2 rounded-md bg-emerald-500 text-white font-bold text-[8px]">
                                  KEPT (PRIMARY)
                                </span>
                                <div className="aspect-square rounded-lg overflow-hidden bg-black/20 flex items-center justify-center mb-1">
                                  {group.keeperSample.imageUrl ? (
                                    <img
                                      src={group.keeperSample.imageUrl}
                                      alt="Kept"
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">No image</span>
                                  )}
                                </div>
                                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 truncate">
                                  {group.keeperSample.sourceTable === 'face_descriptors' ? 'Trained Slot' : 'Primary Photo'}
                                </p>
                              </div>
                            )}

                            {/* Duplicates */}
                            {group.duplicateSamples.map((dup, idx) => (
                              <div
                                key={dup.id || idx}
                                className="p-2 rounded-xl bg-destructive/5 border border-destructive/30 relative opacity-80"
                              >
                                <span className="absolute top-1 right-1 z-10 px-1.5 py-0.2 rounded-md bg-destructive text-destructive-foreground font-bold text-[8px]">
                                  DUPLICATE
                                </span>
                                <div className="aspect-square rounded-lg overflow-hidden bg-black/20 flex items-center justify-center mb-1">
                                  {dup.imageUrl ? (
                                    <img
                                      src={dup.imageUrl}
                                      alt="Duplicate"
                                      className="w-full h-full object-cover grayscale"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">Duplicate</span>
                                  )}
                                </div>
                                <p className="text-[10px] font-semibold text-destructive truncate">
                                  {dup.sourceTable === 'face_descriptors' ? 'Redundant Slot' : 'Duplicate Image'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border/60 bg-card/80 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={cleaning}
            className="text-xs font-semibold"
          >
            Close
          </Button>

          <Button
            onClick={() => handleRunDeduplication()}
            disabled={cleaning || scanning || (scanResult?.totalDuplicatesFound ?? 0) === 0}
            className="rounded-2xl px-5 text-xs font-bold bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/25 hover:brightness-110 active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {cleaning
              ? 'Optimizing Storage...'
              : `Auto-Clean All ${scanResult?.totalDuplicatesFound ?? 0} Duplicates (${formatBytes(scanResult?.estimatedBytesSaved ?? 0)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FaceSampleDeduplicationModal;
