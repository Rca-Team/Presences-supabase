import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchTeacherCategories } from '@/utils/teacherAccess';
import { CLASSES, SECTIONS } from '@/constants/schoolConfig';
import {
  FileText,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Users,
  Search,
  ShieldAlert,
  ArrowRight,
  School,
  Check,
  RefreshCw,
} from 'lucide-react';

export interface ExtractedStudentCard {
  name: string;
  employee_id: string;
  student_id_kv?: string;
  class: string;
  section: string;
  department: string;
  roll_number?: string;
  father_name?: string;
  mother_name?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  student_email?: string;
  phone?: string;
  blood_group?: string;
  date_of_birth?: string;
  pen_number?: string;
  address?: string;
  barcode?: string;
  has_photo?: boolean;
}

interface ClassPDFIDCardImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImportDrafts: (students: ExtractedStudentCard[], batchName: string) => void;
  initialClass?: string;
}

export const ClassPDFIDCardImporter: React.FC<ClassPDFIDCardImporterProps> = ({
  isOpen,
  onClose,
  onImportDrafts,
  initialClass,
}) => {
  const { toast } = useToast();
  const { isAdmin, isPrincipal, isTeacher, userId } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>(initialClass || '');
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionStage, setExtractionStage] = useState('');
  const [extractedStudents, setExtractedStudents] = useState<ExtractedStudentCard[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');

  // Load teacher assigned classes
  useEffect(() => {
    if (!userId) return;
    const loadAssignments = async () => {
      try {
        const cats = await fetchTeacherCategories(userId);
        setTeacherClasses(cats);
        if (!selectedClass && cats.length > 0) {
          setSelectedClass(cats[0]);
        }
      } catch (err) {
        console.warn('Could not load teacher classes:', err);
      }
    };
    loadAssignments();
  }, [userId]);

  // Sync initial class
  useEffect(() => {
    if (initialClass) setSelectedClass(initialClass);
  }, [initialClass]);

  const isAdminOrPrincipal = isAdmin || isPrincipal;
  const isAuthorized = isAdminOrPrincipal || isTeacher;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.pdf') && !selected.type.includes('pdf')) {
      toast({
        title: 'PDF File Required',
        description: 'Please upload a PDF document containing student ID cards.',
        variant: 'destructive',
      });
      return;
    }

    setFile(selected);
    setExtractedStudents([]);
    setSelectedIndices(new Set());
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleStartExtraction = async () => {
    if (!file) {
      toast({ title: 'No File Selected', description: 'Please choose an ID cards PDF file first.' });
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(15);
    setExtractionStage('Reading PDF document...');

    try {
      const base64Data = await fileToBase64(file);
      setExtractionProgress(40);
      setExtractionStage('Gemini AI analyzing PM Shri KV ID cards across all pages...');

      const targetCategory = selectedClass && selectedClass !== 'auto' ? selectedClass : undefined;

      const { data, error } = await supabase.functions.invoke('extract-pdf-users', {
        body: {
          fileData: base64Data,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          targetCategory,
        },
      });

      if (error) {
        let detailedMsg = error.message;
        if ((error as any).context && typeof (error as any).context.json === 'function') {
          try {
            const errBody = await (error as any).context.json();
            if (errBody?.error) detailedMsg = errBody.error;
            else if (errBody?.message) detailedMsg = errBody.message;
          } catch {}
        }
        throw new Error(detailedMsg);
      }

      const users: ExtractedStudentCard[] = data?.users || [];
      setExtractionProgress(90);

      if (users.length === 0) {
        toast({
          title: 'No Students Found',
          description: data?.reason || 'Could not find any readable ID cards in the PDF. Please ensure cards are clear.',
          variant: 'destructive',
        });
        setIsExtracting(false);
        return;
      }

      setExtractedStudents(users);
      setSelectedIndices(new Set(users.map((_, i) => i)));
      setExtractionProgress(100);
      setExtractionStage(`Successfully extracted ${users.length} student ID cards!`);

      toast({
        title: `Extracted ${users.length} Students! 🎉`,
        description: `All student cards parsed from ${file.name}. Review below and save to scan queue.`,
      });
    } catch (err: any) {
      console.error('PDF extraction failed:', err);
      let errMsg = err.message || 'Error processing the PDF. Please verify your connection.';
      if (err?.context && typeof err.context.json === 'function') {
        try {
          const body = await err.context.json();
          if (body?.error) errMsg = body.error;
          else if (body?.message) errMsg = body.message;
        } catch {}
      }
      toast({
        title: 'Extraction Failed',
        description: errMsg,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleSelectStudent = (index: number) => {
    const updated = new Set(selectedIndices);
    if (updated.has(index)) updated.delete(index);
    else updated.add(index);
    setSelectedIndices(updated);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === extractedStudents.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(extractedStudents.map((_, i) => i)));
    }
  };

  const updateStudentField = (index: number, field: keyof ExtractedStudentCard, val: string) => {
    setExtractedStudents((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const removeStudentRow = (index: number) => {
    setExtractedStudents((prev) => prev.filter((_, i) => i !== index));
    const updated = new Set<number>();
    selectedIndices.forEach((i) => {
      if (i < index) updated.add(i);
      else if (i > index) updated.add(i - 1);
    });
    setSelectedIndices(updated);
  };

  const handleConfirmImport = () => {
    const studentsToImport = extractedStudents.filter((_, i) => selectedIndices.has(i));
    if (studentsToImport.length === 0) {
      toast({ title: 'No Students Selected', description: 'Please select at least 1 student to import.' });
      return;
    }

    const batchClass = selectedClass && selectedClass !== 'auto'
      ? selectedClass
      : studentsToImport[0]?.department || 'Whole Class';
    const batchName = `Class ${batchClass} ID Cards (${studentsToImport.length} students)`;

    onImportDrafts(studentsToImport, batchName);

    toast({
      title: 'Imported to Draft Queue! 🚀',
      description: `${studentsToImport.length} students are ready in your scan queue. Select any student to capture their face!`,
    });

    onClose();
  };

  const filteredStudents = extractedStudents.filter((s) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.employee_id.toLowerCase().includes(q) ||
      (s.roll_number && s.roll_number.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden border-blue-500/20 shadow-2xl">
        <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-transparent border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                Class ID Cards PDF Importer
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200">
                  <Sparkles className="w-3 h-3 mr-1" /> PM Shri KV Layout
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Upload whole-class identity cards PDF to extract all student details into an openable draft scan queue.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isAuthorized ? (
          <div className="p-12 text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
            <h3 className="text-lg font-semibold">Teacher / Admin Access Required</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Whole-class bulk PDF extraction is restricted to verified class teachers and administrators to protect student privacy.
            </p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top configuration row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/40 p-4 rounded-2xl border border-border/60">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-blue-500" />
                  Target Class & Section
                </Label>
                {isTeacher && !isAdminOrPrincipal ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedClass}
                      onValueChange={setSelectedClass}
                      disabled={teacherClasses.length <= 1}
                    >
                      <SelectTrigger className="h-10 bg-background">
                        <SelectValue placeholder="Select assigned class" />
                      </SelectTrigger>
                      <SelectContent>
                        {teacherClasses.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            Class {cat} (Class Teacher)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-xs">
                      Class In-Charge
                    </Badge>
                  </div>
                ) : (
                  <Select value={selectedClass || 'auto'} onValueChange={setSelectedClass}>
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue placeholder="Select class (or auto-detect)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect from ID cards</SelectItem>
                      {CLASSES.flatMap((cls) =>
                        SECTIONS.map((sec) => (
                          <SelectItem key={`${cls}-${sec}`} value={`${cls}-${sec}`}>
                            Class {cls}-{sec}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* PDF Picker */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-blue-500" />
                  Select Class ID Cards PDF
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1 justify-start truncate bg-background"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="w-4 h-4 mr-2 text-blue-500 shrink-0" />
                    <span className="truncate">{file ? file.name : 'Choose class PDF file...'}</span>
                  </Button>
                  {file && (
                    <Button
                      type="button"
                      disabled={isExtracting}
                      className="h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
                      onClick={handleStartExtraction}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Reading...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-1.5" />
                          Extract
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Extraction Progress Indicator */}
            {isExtracting && (
              <div className="space-y-2 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> {extractionStage}
                  </span>
                  <span className="font-mono text-muted-foreground">{extractionProgress}%</span>
                </div>
                <Progress value={extractionProgress} className="h-2 bg-blue-100 dark:bg-blue-950" />
              </div>
            )}

            {/* Extracted Roster Review Table */}
            {extractedStudents.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <h4 className="text-sm font-bold">
                        Extracted Student Roster ({extractedStudents.length} Students)
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {selectedIndices.size} selected for import into scan queue
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative w-48 sm:w-56">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Filter name or ID..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="h-8 pl-8 text-xs bg-background"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={toggleSelectAll}
                    >
                      {selectedIndices.size === extractedStudents.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </div>

                <div className="border border-border/80 rounded-2xl overflow-hidden bg-card">
                  <ScrollArea className="h-72">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/70 text-muted-foreground sticky top-0 border-b border-border/80">
                        <tr>
                          <th className="py-2.5 px-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={selectedIndices.size === extractedStudents.length && extractedStudents.length > 0}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300 text-blue-600"
                            />
                          </th>
                          <th className="py-2.5 px-3 text-left">Student Name</th>
                          <th className="py-2.5 px-3 text-left">Admn No.</th>
                          <th className="py-2.5 px-3 text-left">Class</th>
                          <th className="py-2.5 px-3 text-left">Roll No.</th>
                          <th className="py-2.5 px-3 text-left">Father/Mother Phone</th>
                          <th className="py-2.5 px-3 text-left">Blood</th>
                          <th className="py-2.5 px-3 text-left">Address</th>
                          <th className="py-2.5 px-3 text-center w-10">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredStudents.map((st, idx) => {
                          const originalIdx = extractedStudents.indexOf(st);
                          const isSelected = selectedIndices.has(originalIdx);

                          return (
                            <tr
                              key={originalIdx}
                              className={`transition-colors ${
                                isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : 'opacity-60'
                              } hover:bg-muted/40`}
                            >
                              <td className="py-2 px-3 text-left">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectStudent(originalIdx)}
                                  className="rounded border-gray-300 text-blue-600"
                                />
                              </td>
                              <td className="py-2 px-3 font-semibold text-foreground">
                                <Input
                                  value={st.name}
                                  onChange={(e) => updateStudentField(originalIdx, 'name', e.target.value)}
                                  className="h-7 text-xs bg-transparent border-transparent hover:border-border focus:border-blue-500 font-semibold"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  value={st.employee_id}
                                  onChange={(e) => updateStudentField(originalIdx, 'employee_id', e.target.value)}
                                  className="h-7 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-blue-500 w-24"
                                />
                              </td>
                              <td className="py-2 px-3">
                                <Badge variant="outline" className="font-mono text-[10px] bg-background">
                                  {st.department || `${st.class}-${st.section}`}
                                </Badge>
                              </td>
                              <td className="py-2 px-3">
                                <Input
                                  value={st.roll_number || ''}
                                  placeholder="Roll"
                                  onChange={(e) => updateStudentField(originalIdx, 'roll_number', e.target.value)}
                                  className="h-7 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-blue-500 w-16"
                                />
                              </td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">
                                {st.parent_phone || '—'}
                              </td>
                              <td className="py-2 px-3">
                                <Badge variant="secondary" className="text-[10px]">
                                  {st.blood_group || '—'}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 max-w-[180px] truncate text-muted-foreground" title={st.address}>
                                {st.address || '—'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-rose-500"
                                  onClick={() => removeStudentRow(originalIdx)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        {isAuthorized && (
          <div className="p-4 bg-muted/30 border-t border-border/60 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {extractedStudents.length > 0 ? (
                <span>
                  <strong>{selectedIndices.size}</strong> of {extractedStudents.length} students selected
                </span>
              ) : (
                <span>Select a PDF document to begin extraction</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              {extractedStudents.length > 0 && (
                <Button
                  type="button"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25"
                  onClick={handleConfirmImport}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Save as Openable Drafts ({selectedIndices.size})
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClassPDFIDCardImporter;
