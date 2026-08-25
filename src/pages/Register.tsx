import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { registerFace } from '@/services/FaceRecognitionService';
import { storeFaceSample } from '@/services/face-recognition/ProgressiveTrainingService';
import { uploadRegistrationFaceModel } from '@/services/face-recognition/TrainingDataStorageService';
import { loadRegistrationModels } from '@/services/face-recognition/OptimizedRegistrationService';
import { uploadImage } from '@/services/face-recognition/StorageService';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import PageTransition from '@/components/PageTransition';
import Scan3DCapture from '@/components/register/Scan3DCapture';
import AutoCapture10 from '@/components/register/AutoCapture10';
import IDCardAutoFillScanner, { IDCardExtractedFields } from '@/components/register/IDCardAutoFillScanner';
import { 
  User, Mail, Phone, Building2, GraduationCap, Camera, CheckCircle2,
  ArrowRight, ArrowLeft, Sparkles, Shield, Users, Scan, Heart, Bus, Zap, MapPin, History, Play, Trash2
} from 'lucide-react';
import { 
  CLASSES, SECTIONS, ALL_CLASS_SECTIONS, TRANSPORT_MODES, BLOOD_GROUPS 
} from '@/constants/schoolConfig';
import { z } from 'zod';

const registrationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  employeeId: z.string().trim().min(1, 'Admission No. is required').max(50, 'Admission No. is too long'),
  department: z.string().trim().min(1, 'Class-Section is required').max(50, 'Class-Section is too long'),
  parentName: z.string().trim().min(1, 'Parent name is required').max(100, 'Parent name is too long'),
  parentPhone: z.string().trim().min(1, 'Parent phone is required').max(20, 'Parent phone is too long'),
  email: z.union([z.literal(''), z.string().trim().email('Invalid student email').max(255)]),
  parentEmail: z.union([z.literal(''), z.string().trim().email('Invalid parent email').max(255)]),
  phone: z.string().trim().max(20, 'Phone is too long').optional(),
  rollNumber: z.string().trim().max(30, 'Roll number is too long').optional(),
  bloodGroup: z.string().trim().max(10).optional(),
  medicalInfo: z.string().trim().max(500, 'Medical info is too long').optional(),
  transportMode: z.string().trim().max(30).optional(),
  position: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300, 'Address is too long').optional(),
});

const REGISTER_DRAFTS_KEY = 'presence_register_drafts_v1';

const EMPTY_FORM_DATA = {
  name: '',
  email: '',
  phone: '',
  parentName: '',
  parentEmail: '',
  parentPhone: '',
  employeeId: '',
  department: '',
  position: '',
  rollNumber: '',
  bloodGroup: '',
  medicalInfo: '',
  transportMode: '',
  address: '',
};

type RegisterFormData = typeof EMPTY_FORM_DATA;

interface RegistrationDraft {
  id: string;
  formData: RegisterFormData;
  registrationStep: 1 | 2;
  captureMode: 'auto' | '3d';
  status: 'student_info' | 'pending_face_scan';
  updatedAt: string;
}

const getDraftIdentityKey = (draft: Pick<RegistrationDraft, 'id' | 'formData'>) => {
  const employeeId = (draft.formData.employeeId || '').trim().toLowerCase();
  if (employeeId) return `emp:${employeeId}`;
  const name = (draft.formData.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  const parentPhone = (draft.formData.parentPhone || '').replace(/\D/g, '');
  return `tmp:${name || 'student'}:${parentPhone || 'draft'}`;
};

const dedupeDrafts = (input: RegistrationDraft[]) => {
  const sorted = [...input].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const map = new Map<string, RegistrationDraft>();

  for (const draft of sorted) {
    const key = getDraftIdentityKey(draft);
    if (!map.has(key)) {
      map.set(key, draft);
    }
  }

  return Array.from(map.values()).slice(0, 20);
};

const Register = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<RegisterFormData>(EMPTY_FORM_DATA);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null);
  const [allDescriptors, setAllDescriptors] = useState<Float32Array[]>([]);
  const [allFaceImages, setAllFaceImages] = useState<string[]>([]);
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [captureMode, setCaptureMode] = useState<'auto' | '3d'>('auto');
  const [drafts, setDrafts] = useState<RegistrationDraft[]>([]);
  const activeDraftIdRef = useRef<string>(`tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const lastPersistedFingerprintRef = useRef<string>('');

  const getCleanedFormData = () => ({
    name: formData.name.trim(),
    email: formData.email.trim(),
    phone: formData.phone.trim(),
    parentName: formData.parentName.trim(),
    parentEmail: formData.parentEmail.trim(),
    parentPhone: formData.parentPhone.trim(),
    employeeId: formData.employeeId.trim(),
    department: formData.department.trim(),
    position: formData.position.trim(),
    rollNumber: formData.rollNumber.trim(),
    bloodGroup: formData.bloodGroup.trim(),
    medicalInfo: formData.medicalInfo.trim(),
    transportMode: formData.transportMode.trim(),
    address: formData.address.trim(),
  });

  const hasFilledStudentInfo = () => {
    const d = getCleanedFormData();
    return !!(d.name || d.employeeId || d.department || d.parentName || d.parentPhone || d.rollNumber || d.address);
  };

  const draftIdFromData = () => {
    const activeDraftId = activeDraftIdRef.current;
    const employeeId = formData.employeeId.trim();
    const canonicalEmployeeId = employeeId ? `emp-${employeeId.toLowerCase()}` : null;

    if (canonicalEmployeeId && activeDraftId !== canonicalEmployeeId) {
      activeDraftIdRef.current = canonicalEmployeeId;
      return canonicalEmployeeId;
    }

    return activeDraftId;
  };

  const loadDrafts = () => {
    try {
      const raw = localStorage.getItem(REGISTER_DRAFTS_KEY);
      if (!raw) {
        setDrafts([]);
        return;
      }
      const parsed = JSON.parse(raw) as RegistrationDraft[];
      if (!Array.isArray(parsed)) {
        setDrafts([]);
        return;
      }
      setDrafts(
        dedupeDrafts(parsed.filter((d) => d?.id && d?.formData))
      );
    } catch {
      setDrafts([]);
    }
  };

  const persistDraft = (opts?: { forceStep?: 1 | 2 }) => {
    if (isSubmitting) return;
    if (!hasFilledStudentInfo()) return;
    const cleaned = getCleanedFormData();
    const now = new Date().toISOString();
    const step = opts?.forceStep ?? registrationStep;
    const previousActiveDraftId = activeDraftIdRef.current;
    const resolvedDraftId = draftIdFromData();
    const nextDraft: RegistrationDraft = {
      id: resolvedDraftId,
      formData: cleaned,
      registrationStep: step,
      captureMode,
      status: step === 2 ? 'pending_face_scan' : 'student_info',
      updatedAt: now,
    };

    const fingerprint = JSON.stringify({
      id: nextDraft.id,
      formData: nextDraft.formData,
      registrationStep: nextDraft.registrationStep,
      captureMode: nextDraft.captureMode,
      status: nextDraft.status,
    });

    if (lastPersistedFingerprintRef.current === fingerprint) return;

    try {
      const currentRaw = localStorage.getItem(REGISTER_DRAFTS_KEY);
      const current = currentRaw ? (JSON.parse(currentRaw) as RegistrationDraft[]) : [];
      const withUpdated = [
        nextDraft,
        ...(Array.isArray(current) ? current : []).filter(
          (d) => d.id !== nextDraft.id && d.id !== previousActiveDraftId
        ),
      ];
      const merged = dedupeDrafts(withUpdated);
      localStorage.setItem(REGISTER_DRAFTS_KEY, JSON.stringify(merged));
      setDrafts(merged);
      lastPersistedFingerprintRef.current = fingerprint;
    } catch {}
  };

  const clearDraftById = (id: string) => {
    try {
      const currentRaw = localStorage.getItem(REGISTER_DRAFTS_KEY);
      const current = currentRaw ? (JSON.parse(currentRaw) as RegistrationDraft[]) : [];
      const next = (Array.isArray(current) ? current : []).filter((d) => d.id !== id);
      localStorage.setItem(REGISTER_DRAFTS_KEY, JSON.stringify(next));
      setDrafts(next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch {}
  };

  const resumeDraft = (draft: RegistrationDraft) => {
    activeDraftIdRef.current = draft.id;
    lastPersistedFingerprintRef.current = '';
    setFormData({ ...EMPTY_FORM_DATA, ...draft.formData });
    setCaptureMode(draft.captureMode || 'auto');
    setRegistrationStep(draft.registrationStep || 1);
    setFaceCaptured(false);
    setFaceImage(null);
    setFaceDescriptor(null);
    setAllDescriptors([]);
    setAllFaceImages([]);
    toast({
      title: 'Draft resumed',
      description: draft.registrationStep === 2 ? 'Continue from 3D Face Scan.' : 'Continue filling student info.',
    });
  };

  useEffect(() => {
    const init = async () => {
      try {
        setIsModelLoading(true);
        await loadRegistrationModels();
      } catch (error) {
        console.error('Error loading models:', error);
        toast({ title: "Error Loading Models", description: "Please refresh the page.", variant: "destructive" });
      } finally {
        setIsModelLoading(false);
      }
    };
    init();
    loadDrafts();
  }, [toast]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      persistDraft();
    }, 280);
    return () => clearTimeout(timeout);
  }, [formData, registrationStep, captureMode, isSubmitting]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiAngleComplete = (
    averaged: Float32Array,
    primaryImage: string,
    rawDescriptors: Float32Array[],
    rawImages?: string[]
  ) => {
    setFaceDescriptor(averaged);
    setFaceImage(primaryImage);
    setAllDescriptors(rawDescriptors);
    setAllFaceImages(rawImages ?? []);
    setFaceCaptured(true);
    toast({ title: "3D Scan Complete! 🎉", description: `${rawDescriptors.length} angle samples captured for maximum accuracy.` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!faceDescriptor || !faceCaptured || !faceImage) {
      toast({ title: "Missing Face Image", description: "Please complete the face scan", variant: "destructive" });
      return;
    }

    const cleanedData = getCleanedFormData();
    const parsed = registrationSchema.safeParse(cleanedData);
    if (!parsed.success) {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0] || 'Please check form details';
      toast({ title: 'Invalid form data', description: firstError, variant: 'destructive' });
      return;
    }

    const validData = parsed.data;

    setIsSubmitting(true);
    try {
      const userId = uuidv4();

      let idCardPhotoUrl: string | null = null;
      if (faceImage?.startsWith('data:image/')) {
        try {
          const idPhotoRes = await fetch(faceImage);
          const idPhotoBlob = await idPhotoRes.blob();
          const idPhotoFile = new File(
            [idPhotoBlob],
            `id-card_${validData.employeeId || userId}_${Date.now()}.jpg`,
            { type: 'image/jpeg' }
          );
          idCardPhotoUrl = await uploadImage(idPhotoFile, `students/${userId}/${idPhotoFile.name}`);
        } catch (uploadErr) {
          console.warn('ID card photo upload failed, continuing with existing registration flow', uploadErr);
        }
      }

      const faceModelPath = await uploadRegistrationFaceModel({
        studentId: userId,
        employeeId: validData.employeeId,
        category: validData.department,
        captureMode: captureMode === 'auto' ? 'auto-10' : 'scan-3d',
        averagedDescriptor: faceDescriptor,
        descriptors: allDescriptors,
        sampleImages: allFaceImages,
      });

      const response = await fetch(faceImage);
      const imageBlob = await response.blob();
      const registrationData = await registerFace(
        imageBlob, validData.name, validData.employeeId, validData.department,
        validData.position || validData.rollNumber || '', userId, faceDescriptor,
        {
          phone: validData.phone,
          parent_name: validData.parentName,
          parent_email: validData.parentEmail,
          parent_phone: validData.parentPhone,
          student_email: validData.email,
          roll_number: validData.rollNumber,
          blood_group: validData.bloodGroup,
          medical_info: validData.medicalInfo,
          transport_mode: validData.transportMode,
          class_section: validData.department,
          address: validData.address,
        },
        validData.department, // category = class-section
        {
          sample_count: allDescriptors.length,
          capture_mode: captureMode === 'auto' ? 'auto-10' : 'scan-3d',
          storage_model_path: faceModelPath || undefined,
          id_card_photo_url: idCardPhotoUrl || undefined,
        }
      );
      if (registrationData) {
        const descriptorOwnerUserId =
          registrationData.descriptor_user_id ||
          registrationData.registration_user_id ||
          registrationData.user_id ||
          userId;

        // Store ALL 3D scan samples in face_descriptors for multi-angle matching
        if (allDescriptors.length > 0) {
          console.log(`Storing ${allDescriptors.length} 3D scan samples for user ${descriptorOwnerUserId}`);
           for (let i = 0; i < allDescriptors.length; i++) {
             const descriptor = allDescriptors[i];
             const shotImage = allFaceImages[i];
             let shotBlob: Blob | null = null;
             if (shotImage) {
               try {
                 const shotRes = await fetch(shotImage);
                 shotBlob = await shotRes.blob();
               } catch (shotErr) {
                 console.warn(`Could not convert captured shot #${i + 1} to blob`, shotErr);
               }
             }
              await storeFaceSample(descriptorOwnerUserId, descriptor, shotBlob, validData.name, 1.0);
          }
          console.log('All 3D scan samples stored successfully');
        }
        
        toast({
          title: "Registration Successful! 🎉",
          description: `3D face model saved with ${allDescriptors.length} training samples for best accuracy.`,
        });
         const completedDraftId = draftIdFromData();
         clearDraftById(completedDraftId);
         setFormData(EMPTY_FORM_DATA);
         setFaceImage(null);
         setFaceDescriptor(null);
         setAllDescriptors([]);
         setAllFaceImages([]);
         setFaceCaptured(false);
         setRegistrationStep(1);
        activeDraftIdRef.current = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        lastPersistedFingerprintRef.current = '';
      } else throw new Error("Registration failed");
    } catch (error) {
      console.error('Error registering:', error);
      toast({ title: "Registration Failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateStep1 = () => {
    const parsed = registrationSchema.safeParse(getCleanedFormData());
    if (parsed.success) {
      persistDraft({ forceStep: 2 });
      setRegistrationStep(2);
    } else {
      const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0] || 'Please fill in all required fields';
      toast({ title: "Incomplete Information", description: firstError, variant: "destructive" });
    }
  };

  const steps = [
    { number: 1, title: "Student Info", icon: User },
    { number: 2, title: "3D Face Scan", icon: Camera }
  ];

  return (
    <PageTransition>
      <div className="min-h-screen flex neon-liquid-bg">
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(var(--neon-orange)), hsl(var(--neon-pink)), hsl(var(--neon-violet)))' }}>
          <div className="absolute inset-0">
            <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{
              backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
              backgroundSize: '32px 32px'
            }} />
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 8, repeat: Infinity }}
              className="absolute top-1/4 -left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" 
            />
          </div>
          <div className="relative z-10 flex flex-col justify-between p-12 w-full">
            <Link to="/"><Logo className="text-white" /></Link>
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
                  Join the Future of<br />
                  <span className="text-cyan-200">Smart Attendance</span>
                </h1>
                <p className="mt-4 text-lg text-white/80 max-w-md">
                  Register with a guided 3D face scan for maximum recognition accuracy.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Sparkles, text: "3D face scan for 99%+ accuracy" },
                  { icon: Shield, text: "Bank-grade security & privacy" },
                  { icon: Users, text: "Instant attendance via face recognition" }
                ].map((item, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }}
                    className="flex items-center gap-3 text-white/90">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span>{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <p className="text-white/60 text-sm">© 2025 Presence. All rights reserved.</p>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">
          <div className="lg:hidden p-4 border-b border-border/70 liquid-glass-surface">
            <Link to="/"><Logo /></Link>
          </div>
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-16 py-8">
            <div className="w-full max-w-lg mx-auto">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full liquid-glass-surface mb-4">
                  <Scan className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Face Registration</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold">Create your profile</h2>
                <p className="mt-2 text-muted-foreground">Register with a guided 3D face scan</p>
              </motion.div>

              {drafts.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 rounded-xl border border-primary/25 liquid-glass-surface p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <History className="h-4 w-4 text-primary" /> Pending registrations
                    </div>
                    <span className="text-xs text-muted-foreground">Auto-saved in real-time</span>
                  </div>
                  <div className="space-y-2">
                    {drafts.slice(0, 3).map((draft) => (
                      <div key={draft.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-card/80 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{draft.formData.name || 'Unnamed student'}</p>
                          <p className="text-xs text-muted-foreground">
                            {draft.formData.employeeId || 'No ID yet'} · {draft.status === 'pending_face_scan' ? 'Ready for 3D Face Scan' : 'Student Info in progress'}
                          </p>
                        </div>
                        <div className="ml-3 flex items-center gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => resumeDraft(draft)}>
                            <Play className="mr-1 h-3.5 w-3.5" /> Resume
                          </Button>
                          <Button type="button" size="icon" variant="ghost" onClick={() => clearDraftById(draft.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Progress Steps */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-8">
                <div className="flex items-center justify-between relative">
                  {steps.map((step, i) => (
                    <React.Fragment key={step.number}>
                      <div className="flex flex-col items-center z-10">
                        <motion.div animate={{ scale: registrationStep >= step.number ? 1 : 0.9, opacity: registrationStep >= step.number ? 1 : 0.5 }}
                          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                            registrationStep >= step.number ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-muted text-muted-foreground'
                          }`}>
                          {registrationStep > step.number ? <CheckCircle2 className="w-6 h-6" /> : <step.icon className="w-5 h-5" />}
                        </motion.div>
                        <span className={`mt-2 text-sm font-medium ${registrationStep >= step.number ? 'text-foreground' : 'text-muted-foreground'}`}>{step.title}</span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className="flex-1 mx-4 relative">
                          <div className="absolute top-6 left-0 right-0 h-0.5 bg-muted" />
                          <motion.div initial={{ width: 0 }} animate={{ width: registrationStep > 1 ? '100%' : '0%' }}
                            className="absolute top-6 left-0 h-0.5 bg-gradient-to-r from-blue-600 to-blue-500 transition-all duration-500" />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </motion.div>

              <form onSubmit={handleSubmit}>
                <AnimatePresence mode="wait">
                  {registrationStep === 1 ? (
                    <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }} className="space-y-5">
                      <IDCardAutoFillScanner
                        onExtracted={(f: IDCardExtractedFields) => {
                          setFormData((prev) => ({
                            ...prev,
                            name: f.name || prev.name,
                            employeeId: f.employee_id || prev.employeeId,
                            rollNumber: f.roll_number || prev.rollNumber,
                            department: f.department || prev.department,
                            email: f.email || prev.email,
                            phone: f.phone || prev.phone,
                            parentName: f.parent_name || prev.parentName,
                            parentPhone: f.parent_phone || prev.parentPhone,
                            parentEmail: f.parent_email || prev.parentEmail,
                            bloodGroup: f.blood_group || prev.bloodGroup,
                            transportMode: f.transport_mode || prev.transportMode,
                            address: f.address || prev.address,
                          }));

                          if (f.student_photo_data_url) {
                            setFaceImage(f.student_photo_data_url);
                            setFaceCaptured(false);
                            toast({
                              title: 'ID photo extracted',
                              description: 'Student photo captured from ID card. Continue to 3D face scan for full training.',
                            });
                          }
                        }}
                      />
                      {/* Student Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="flex items-center gap-2"><User className="w-4 h-4 text-blue-500" />Full Name *</Label>
                          <Input id="name" name="name" value={formData.name} onChange={handleInputChange} placeholder="Student name" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="employeeId" className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-blue-500" />Admission No. *</Label>
                          <Input id="employeeId" name="employeeId" value={formData.employeeId} onChange={handleInputChange} placeholder="ADM-12345" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" required />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-500" />Class-Section *</Label>
                          <Select value={formData.department} onValueChange={v => handleSelectChange('department', v)}>
                            <SelectTrigger className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900">
                              <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                            <SelectContent>
                              {CLASSES.flatMap(cls => [
                                <SelectItem key={`label_${cls}`} value={`__label_${cls}`} disabled className="font-bold text-xs text-muted-foreground">
                                  — Class {cls} —
                                </SelectItem>,
                                ...SECTIONS.map(sec => (
                                  <SelectItem key={`${cls}-${sec}`} value={`${cls}-${sec}`}>
                                    Class {cls} - Section {sec}
                                  </SelectItem>
                                ))
                              ])}
                              <SelectItem value="Teacher">Teacher / Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rollNumber">Roll Number</Label>
                          <Input id="rollNumber" name="rollNumber" value={formData.rollNumber} onChange={handleInputChange} placeholder="e.g. 01" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2"><Heart className="w-4 h-4 text-blue-500" />Blood Group</Label>
                          <Select value={formData.bloodGroup} onValueChange={v => handleSelectChange('bloodGroup', v)}>
                            <SelectTrigger className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {BLOOD_GROUPS.map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2"><Bus className="w-4 h-4 text-blue-500" />Transport</Label>
                          <Select value={formData.transportMode} onValueChange={v => handleSelectChange('transportMode', v)}>
                            <SelectTrigger className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {TRANSPORT_MODES.map(tm => <SelectItem key={tm} value={tm}>{tm}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" />Email (optional)</Label>
                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="student@school.edu" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="address" className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-500" />Address</Label>
                        <textarea
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={handleInputChange}
                          placeholder="House no., street, city, state, PIN"
                          rows={2}
                          className="w-full rounded-md border border-blue-100 dark:border-blue-900 bg-white/50 dark:bg-slate-800/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Parent/Guardian */}
                      <div className="relative py-3">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-blue-100 dark:border-blue-900" /></div>
                        <div className="relative flex justify-center">
                          <span className="px-3 bg-gradient-to-r from-slate-50 via-blue-50/30 to-white dark:from-slate-950 dark:via-blue-950/30 dark:to-slate-900 text-sm text-muted-foreground">Parent/Guardian Info</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="parentName">Parent Name *</Label>
                          <Input id="parentName" name="parentName" value={formData.parentName} onChange={handleInputChange} placeholder="Parent's name" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="parentPhone" className="flex items-center gap-2"><Phone className="w-4 h-4 text-blue-500" />Parent Phone *</Label>
                          <Input id="parentPhone" name="parentPhone" type="tel" value={formData.parentPhone} onChange={handleInputChange} placeholder="+91 98765 43210" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" required />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="parentEmail">Parent Email</Label>
                        <Input id="parentEmail" name="parentEmail" type="email" value={formData.parentEmail} onChange={handleInputChange} placeholder="parent@email.com" className="h-11 bg-white/50 dark:bg-slate-800/50 border-blue-100 dark:border-blue-900" />
                      </div>

                      <Button type="button" onClick={validateStep1} className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25">
                        Continue to Face Scan <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-6">
                      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-blue-500 p-1 shadow-xl shadow-blue-500/20">
                        <div className="bg-background rounded-xl overflow-hidden">
                          <div className="p-4 bg-gradient-to-r from-blue-600 to-blue-500">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <Camera className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-white">3D Face Scanner</h3>
                                <p className="text-sm text-blue-100">Continuous 3D depth scan of your face</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-4">
                            {faceCaptured && faceImage ? (
                              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-4">
                                <div className="relative inline-block">
                                  <img src={faceImage} alt="Captured" className="w-48 h-48 rounded-full object-cover mx-auto border-4 border-blue-500 shadow-lg" style={{ transform: 'scaleX(-1)' }} />
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "tween" }}
                                    className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                                    <CheckCircle2 className="w-7 h-7 text-white" />
                                  </motion.div>
                                </div>
                                <div>
                                  <p className="font-semibold text-lg text-green-600 dark:text-green-400">3D Scan Complete!</p>
                                <p className="text-sm text-muted-foreground">{allDescriptors.length} samples saved for high-accuracy face model</p>
                                </div>
                                <Button type="button" variant="outline" onClick={() => { setFaceCaptured(false); setFaceImage(null); setFaceDescriptor(null); }}>
                                  <Camera className="w-4 h-4 mr-2" />Retake Scan
                                </Button>
                              </motion.div>
                            ) : (
                              <div className="space-y-3">
                                {/* Mode toggle */}
                                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                                  <button
                                    type="button"
                                    onClick={() => setCaptureMode('auto')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                      captureMode === 'auto'
                                        ? 'bg-background shadow-sm text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    <Zap className="h-3.5 w-3.5" /> Auto (10 photos · 5s)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCaptureMode('3d')}
                                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                                      captureMode === '3d'
                                        ? 'bg-background shadow-sm text-primary'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    <Scan className="h-3.5 w-3.5" /> 3D Scan (guided)
                                  </button>
                                </div>
                                {captureMode === 'auto' ? (
                                  <AutoCapture10 onComplete={handleMultiAngleComplete} isModelLoading={isModelLoading} />
                                ) : (
                                  <Scan3DCapture onComplete={handleMultiAngleComplete} isModelLoading={isModelLoading} />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <Button type="button" variant="outline" onClick={() => setRegistrationStep(1)} className="flex-1 h-12 border-blue-200 dark:border-blue-800">
                          <ArrowLeft className="mr-2 h-4 w-4" />Back
                        </Button>
                        <Button type="submit" disabled={!faceCaptured || isSubmitting} className="flex-1 h-12 text-base bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg shadow-blue-500/25 disabled:opacity-50">
                          {isSubmitting ? (
                            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Registering...</>
                          ) : (
                            <>Complete Registration <CheckCircle2 className="ml-2 h-5 w-5" /></>
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </form>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400">Sign in</Link>
              </motion.p>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default Register;
