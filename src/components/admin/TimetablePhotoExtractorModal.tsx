import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UploadCloud,
  Camera,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Save,
  RotateCw,
  RefreshCw,
  X,
  Layers,
  GraduationCap,
  CalendarDays,
  FileImage,
  Key,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  extractTimetableFromImage,
  ExtractedTimetableResult,
  ExtractedSlot,
  getSubjectTheme,
} from '@/utils/timetableExtractor';

interface Teacher {
  id: string;
  name: string;
  specialization?: string;
}

interface Subject {
  id: string;
  name: string;
  short_name?: string | null;
}

interface TimetablePhotoExtractorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCategory: string;
  knownSubjects: Subject[];
  knownTeachers: Teacher[];
  onApply: (result: ExtractedTimetableResult, autoSaveToCloud?: boolean) => Promise<void> | void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TimetablePhotoExtractorModal({
  open,
  onOpenChange,
  selectedCategory,
  knownSubjects,
  knownTeachers,
  onApply,
}: TimetablePhotoExtractorModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStep, setExtractionStep] = useState<string>('');
  const [extractedResult, setExtractedResult] = useState<ExtractedTimetableResult | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);

  // Editable slots map for fine-tuning
  const [editableSlots, setEditableSlots] = useState<Record<string, ExtractedSlot>>({});

  const slotKey = (dayNum: number, pNum: number) => `${dayNum}-${pNum}`;

  // Handle image upload from file or camera
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid File', description: 'Please select a valid image file (JPG, PNG, WEBP).', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
        setExtractedResult(null);
        setEditableSlots({});
      }
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Run AI Extraction
  const handleStartExtraction = async () => {
    if (!imagePreview) return;
    setIsExtracting(true);
    setExtractionStep('1. Scanning timetable image layout & grid lines...');

    try {
      if (apiKey) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
      }

      await new Promise((r) => setTimeout(r, 600));
      setExtractionStep('2. Extracting period timings, days & subject abbreviations...');

      await new Promise((r) => setTimeout(r, 600));
      setExtractionStep('3. Auto-matching & assigning faculty teachers per subject...');

      const result = await extractTimetableFromImage({
        fileData: imagePreview,
        className: selectedCategory.split('-')[0],
        section: selectedCategory.split('-')[1] || 'A',
        knownSubjects,
        knownTeachers,
        geminiApiKey: apiKey.trim() || undefined,
      });

      setExtractionStep('4. Finalizing timetable schedule...');
      await new Promise((r) => setTimeout(r, 400));

      setExtractedResult(result);

      // Build editable slots map
      const slotMap: Record<string, ExtractedSlot> = {};
      result.slots.forEach((s) => {
        slotMap[slotKey(s.dayNumber, s.period_number)] = s;
      });
      setEditableSlots(slotMap);

      toast({
        title: '✨ Timetable Extracted Successfully',
        description: `Identified ${result.slots.length} schedule slots with faculty assignments.`,
      });
    } catch (err: any) {
      console.error('Timetable extraction failed:', err);
      toast({
        title: 'Extraction Error',
        description: err?.message || 'Could not parse timetable. Ensure image is clear or configure API key.',
        variant: 'destructive',
      });
      setShowKeyInput(true);
    } finally {
      setIsExtracting(false);
      setExtractionStep('');
    }
  };

  // Update a slot during review
  const updateSlot = (dayNum: number, pNum: number, patch: Partial<ExtractedSlot>) => {
    const key = slotKey(dayNum, pNum);
    const existing = editableSlots[key] || {
      day: DAYS[dayNum - 1] || 'Monday',
      dayNumber: dayNum,
      period_number: pNum,
      subject: 'General Study',
    };

    const updated = { ...existing, ...patch };

    // If subjectId changed, auto-update subject name & teacher
    if (patch.subjectId) {
      const subj = knownSubjects.find((s) => s.id === patch.subjectId);
      if (subj) {
        updated.subject = subj.name;
        updated.subject_short = subj.short_name || subj.name;
      }
    }

    // If teacherId changed, update teacher name
    if (patch.teacherId) {
      const t = knownTeachers.find((tch) => tch.id === patch.teacherId);
      if (t) updated.teacher = t.name;
    }

    setEditableSlots((prev) => ({
      ...prev,
      [key]: updated,
    }));
  };

  // Apply to TimetableManager
  const handleApplyAndClose = async (autoSave: boolean) => {
    if (!extractedResult) return;
    if (autoSave) setIsSavingCloud(true);

    try {
      const finalSlots = Object.values(editableSlots);
      const finalResult: ExtractedTimetableResult = {
        ...extractedResult,
        slots: finalSlots,
      };

      await onApply(finalResult, autoSave);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Application failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Compute total unique periods in extracted result
  const maxPeriodNum = Math.max(
    8,
    ...(extractedResult?.periods.map((p) => p.period_number) || [8]),
    ...Object.values(editableSlots).map((s) => s.period_number)
  );
  const periodNumbers = Array.from({ length: Math.min(maxPeriodNum, 9) }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-3xl border border-white/20 bg-background/95 p-0 backdrop-blur-2xl overflow-hidden shadow-2xl">
        <DialogHeader className="p-5 border-b border-border/40 bg-card/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-primary to-purple-600 text-white shadow-md shadow-primary/20">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  AI Timetable Photo Scanner
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] uppercase font-mono">
                    Class {selectedCategory}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Upload a photo of your school timetable — AI extracts periods, subjects, and assigns subject teachers automatically.
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-xs text-muted-foreground hover:text-primary gap-1"
            >
              <Key className="h-3.5 w-3.5" /> {showKeyInput ? 'Hide Key' : 'API Key'}
            </Button>
          </div>

          {showKeyInput && (
            <div className="mt-3 p-3 rounded-2xl border bg-muted/30 flex items-center gap-2 animate-in fade-in">
              <Key className="h-4 w-4 text-primary shrink-0" />
              <Input
                type="password"
                placeholder="Custom Google Gemini API Key (optional)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <Button size="sm" variant="secondary" className="h-8 text-xs shrink-0" onClick={() => setShowKeyInput(false)}>
                Save Key
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {!imagePreview ? (
            /* 1. Upload Dropzone Stage */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-primary/30 rounded-3xl p-10 flex flex-col items-center justify-center text-center bg-card/40 hover:bg-card/70 hover:border-primary transition-all duration-300 group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="p-4 rounded-3xl bg-primary/10 text-primary group-hover:scale-110 transition-transform mb-4 shadow-inner">
                <UploadCloud className="h-10 w-10" />
              </div>
              <h3 className="font-extrabold text-base text-foreground">Upload Timetable Photo or Document</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Supports printed charts, whiteboard snapshots, phone camera photos, or PDF screenshots.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="default"
                  className="rounded-2xl font-bold gap-2 text-xs shadow-md shadow-primary/25"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <FileImage className="h-4 w-4" /> Browse Photo
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl font-bold gap-2 text-xs border-border/70 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                >
                  <Camera className="h-4 w-4" /> Take Photo
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : !extractedResult ? (
            /* 2. Image Preview & Run Extraction Stage */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-6 relative aspect-video md:aspect-[4/3] rounded-3xl overflow-hidden border bg-black/80 shadow-xl">
                <img src={imagePreview} alt="Timetable preview" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setImagePreview(null)}
                  className="absolute top-3 right-3 rounded-full bg-black/70 p-1.5 text-white hover:bg-destructive hover:text-white transition backdrop-blur-md"
                  title="Remove Image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="md:col-span-6 space-y-4">
                <div className="p-5 rounded-3xl border bg-card/60 backdrop-blur-md space-y-3">
                  <h4 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Ready for AI Extraction
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AI will scan this image to identify Roman/English period numbers (I-VIII), weekdays (Monday-Saturday), subjects, and auto-map qualified teachers for class <strong>{selectedCategory}</strong>.
                  </p>

                  {isExtracting ? (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" /> {extractionStep}
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary animate-[pulse_1s_infinite] w-3/4 rounded-full" />
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={handleStartExtraction}
                      disabled={isExtracting}
                      className="w-full rounded-2xl font-extrabold gap-2 shadow-lg shadow-primary/25 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700"
                    >
                      <Wand2 className="h-4 w-4" /> Analyze & Extract Schedule Now
                    </Button>
                  )}
                </div>

                <div className="flex justify-between items-center px-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setImagePreview(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Select Another Image
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* 3. Review & Verification Matrix Stage */
            <div className="space-y-5">
              {/* Header Details Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border bg-card/60 backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">
                      Class: {extractedResult.class_label || selectedCategory}
                    </span>
                  </div>
                  {extractedResult.class_teacher && (
                    <Badge variant="secondary" className="text-xs font-semibold">
                      Class Teacher: {extractedResult.class_teacher}
                    </Badge>
                  )}
                  {extractedResult.co_class_teacher && (
                    <Badge variant="outline" className="text-xs">
                      Co-Class Teacher: {extractedResult.co_class_teacher}
                    </Badge>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExtractedResult(null)}
                  className="text-xs rounded-xl gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Re-scan
                </Button>
              </div>

              {/* Grid Preview Table */}
              <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card/40 shadow-inner">
                <table className="w-full border-collapse text-xs text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground font-bold">
                      <th className="p-3 w-28 text-center">Day</th>
                      {periodNumbers.map((pNum) => (
                        <th key={pNum} className="p-2.5 text-center font-extrabold border-l border-border/40 min-w-[120px]">
                          Period {pNum}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((dayName, dayIdx) => {
                      const dayNum = dayIdx + 1;
                      return (
                        <tr key={dayName} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-bold text-foreground bg-muted/30 text-center">{dayName}</td>
                          {periodNumbers.map((pNum) => {
                            const slot = editableSlots[slotKey(dayNum, pNum)];
                            const theme = getSubjectTheme(slot?.subject);

                            return (
                              <td key={pNum} className="p-1.5 border-l border-border/30 align-top">
                                {slot ? (
                                  <div
                                    className={cn(
                                      'p-2 rounded-xl border transition-all flex flex-col justify-between gap-1 shadow-xs',
                                      theme.bg,
                                      theme.border
                                    )}
                                  >
                                    {/* Subject Select */}
                                    <Select
                                      value={slot.subjectId || slot.subject}
                                      onValueChange={(val) => {
                                        const subj = knownSubjects.find((s) => s.id === val || s.name === val);
                                        updateSlot(dayNum, pNum, {
                                          subjectId: subj?.id || val,
                                          subject: subj?.name || val,
                                        });
                                      }}
                                    >
                                      <SelectTrigger className="h-6 text-[10px] font-bold p-1 bg-background/80 border-0 shadow-none">
                                        <SelectValue placeholder={slot.subject_short || slot.subject} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {knownSubjects.map((s) => (
                                          <SelectItem key={s.id} value={s.id} className="text-xs">
                                            {s.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    {/* Teacher Select */}
                                    <Select
                                      value={slot.teacherId || ''}
                                      onValueChange={(tId) => updateSlot(dayNum, pNum, { teacherId: tId })}
                                    >
                                      <SelectTrigger className="h-5 text-[9px] font-medium p-1 bg-background/60 border-0 text-muted-foreground">
                                        <SelectValue placeholder={slot.teacher || 'Assign Teacher'} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {knownTeachers.map((t) => (
                                          <SelectItem key={t.id} value={t.id} className="text-xs">
                                            {t.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSlot(dayNum, pNum, {
                                        subject: 'General Study',
                                        subjectId: knownSubjects[0]?.id,
                                        teacherId: knownTeachers[0]?.id,
                                      })
                                    }
                                    className="h-14 w-full rounded-xl border border-dashed border-border/40 hover:border-primary/50 text-[10px] text-muted-foreground flex items-center justify-center transition"
                                  >
                                    + Slot
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {extractedResult && (
          <div className="p-5 border-t border-border/40 bg-card/60 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs rounded-xl font-semibold"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleApplyAndClose(false)}
                className="text-xs font-bold rounded-xl gap-1.5"
              >
                <Layers className="h-3.5 w-3.5 text-primary" /> Apply to Grid
              </Button>

              <Button
                size="sm"
                onClick={() => handleApplyAndClose(true)}
                disabled={isSavingCloud}
                className="text-xs font-bold rounded-xl gap-1.5 shadow-md shadow-primary/20"
              >
                {isSavingCloud ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Apply & Save to Cloud
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
