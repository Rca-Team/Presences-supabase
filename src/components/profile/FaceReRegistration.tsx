import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { loadRegistrationModels } from '@/services/face-recognition/OptimizedRegistrationService';
import { storeFaceSample, getUserTrainingStats } from '@/services/face-recognition/ProgressiveTrainingService';
import { descriptorToString } from '@/services/face-recognition/ModelService';
import Scan3DCapture from '@/components/register/Scan3DCapture';
import { toast } from 'sonner';
import { 
  Scan, RefreshCw, CheckCircle2, AlertTriangle, Trash2, 
  ShieldCheck, Loader2, Camera, ChevronRight, Info
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface FaceReRegistrationProps {
  userId: string;
  userName: string;
}

const FaceReRegistration: React.FC<FaceReRegistrationProps> = ({ userId, userName }) => {
  const queryClient = useQueryClient();
  const [showScanner, setShowScanner] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const { data: trainingStats, isLoading: statsLoading } = useQuery({
    queryKey: ['trainingStats', userId],
    queryFn: () => getUserTrainingStats(userId),
    enabled: !!userId
  });

  const { data: sampleCount } = useQuery({
    queryKey: ['faceSampleCount', userId],
    queryFn: async () => {
      const { count } = await supabase
        .from('face_descriptors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count || 0;
    },
    enabled: !!userId
  });

  const handleStartScan = async () => {
    setIsModelLoading(true);
    try {
      await loadRegistrationModels();
      setIsModelLoading(false);
      setShowScanner(true);
    } catch {
      setIsModelLoading(false);
      toast.error('Failed to load face detection models');
    }
  };

  const handleScanComplete = async (
    averagedDescriptor: Float32Array, 
    primaryImage: string, 
    allDescriptors: Float32Array[]
  ) => {
    setShowScanner(false);
    
    try {
      // Convert primary image to blob
      const response = await fetch(primaryImage);
      const blob = await response.blob();

      // Store each descriptor as a training sample
      let stored = 0;
      for (const descriptor of allDescriptors) {
        const success = await storeFaceSample(
          userId,
          descriptor,
          stored === 0 ? blob : null, // only upload image for first sample
          userName,
          1.0 // registration confidence
        );
        if (success) stored++;
      }

      // Also update the face_descriptor in attendance_records for legacy matching
      const descriptorString = descriptorToString(averagedDescriptor);
      await supabase
        .from('attendance_records')
        .update({ face_descriptor: descriptorString })
        .eq('user_id', userId)
        .in('status', ['registered', 'pending_approval']);

      queryClient.invalidateQueries({ queryKey: ['trainingStats', userId] });
      queryClient.invalidateQueries({ queryKey: ['faceSampleCount', userId] });

      toast.success(`Face data updated! ${stored} new samples stored.`);
    } catch (err) {
      console.error('Re-registration error:', err);
      toast.error('Failed to update face data');
    }
  };

  const handleClearAndRescan = async () => {
    setIsClearing(true);
    try {
      // Delete all existing face descriptors for this user
      const { error } = await supabase
        .from('face_descriptors')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['trainingStats', userId] });
      queryClient.invalidateQueries({ queryKey: ['faceSampleCount', userId] });

      toast.success('Old face data cleared. Starting fresh scan...');
      setIsClearing(false);
      handleStartScan();
    } catch {
      setIsClearing(false);
      toast.error('Failed to clear face data');
    }
  };

  const levelConfig = {
    none: { color: 'text-muted-foreground', bg: 'bg-muted', label: 'Not Set', icon: AlertTriangle },
    basic: { color: 'text-amber', bg: 'bg-amber/10', label: 'Basic', icon: Info },
    moderate: { color: 'text-cyan', bg: 'bg-cyan/10', label: 'Moderate', icon: Scan },
    good: { color: 'text-emerald', bg: 'bg-emerald/10', label: 'Good', icon: CheckCircle2 },
    excellent: { color: 'text-primary', bg: 'bg-primary/10', label: 'Excellent', icon: ShieldCheck },
  };

  const level = trainingStats?.trainingLevel || 'none';
  const config = levelConfig[level];
  const LevelIcon = config.icon;

  if (showScanner) {
    return (
      <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Re-Scan Your Face
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowScanner(false)}>Cancel</Button>
          </div>
          <CardDescription className="text-xs">
            Follow the on-screen guide to capture your face from multiple angles
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Scan3DCapture
            onComplete={handleScanComplete}
            isModelLoading={isModelLoading}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-blue-100 dark:border-blue-900/50 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          Face Recognition Data
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Update your face data for better attendance accuracy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Training level indicator */}
        <div className={`flex items-center gap-3 p-3 rounded-xl ${config.bg}`}>
          <LevelIcon className={`w-5 h-5 ${config.color}`} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
              <Badge variant="secondary" className="text-[10px]">
                {sampleCount || 0} samples
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {level === 'none' && 'No face data registered yet'}
              {level === 'basic' && 'Add more samples for better accuracy'}
              {level === 'moderate' && 'Recognition works, but can be improved'}
              {level === 'good' && 'Good recognition accuracy'}
              {level === 'excellent' && 'Best possible recognition accuracy'}
            </p>
          </div>
        </div>

        {/* Quality bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Recognition Quality</span>
            <span>{Math.min(100, (sampleCount || 0) * 12)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (sampleCount || 0) * 12)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
            />
          </div>
        </div>

        {/* Stats */}
        {trainingStats && trainingStats.sampleCount > 0 && (
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{trainingStats.sampleCount}</p>
              <p className="text-[10px] text-muted-foreground">Face Samples</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">
                {trainingStats.newestSample 
                  ? new Date(trainingStats.newestSample).toLocaleDateString() 
                  : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">Last Updated</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          <Button 
            onClick={handleStartScan}
            disabled={isModelLoading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
          >
            {isModelLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading Models...</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" /> {sampleCount ? 'Add More Samples' : 'Register Face'}</>
            )}
          </Button>

          {(sampleCount || 0) > 0 && (
            <Button 
              variant="outline"
              onClick={handleClearAndRescan}
              disabled={isClearing}
              className="w-full border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              {isClearing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Clearing...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Clear & Re-Register</>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FaceReRegistration;
