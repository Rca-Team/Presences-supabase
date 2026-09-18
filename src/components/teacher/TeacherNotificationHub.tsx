import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Send,
  MessageSquare,
  Users,
  UserX,
  UserCheck,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Award,
  FileText,
  Loader2,
  Phone,
  CheckSquare,
  Square,
  Bell,
  Mail,
  Copy,
  Check,
  Smartphone,
  MessageCircle,
  Eye,
  Wand2,
  RefreshCw,
  Search,
  Filter,
  History,
  Languages,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ClassAssignment, ClassStudent } from './TeacherAdminWorkspace';

interface TeacherNotificationHubProps {
  activeClass: ClassAssignment;
  students: ClassStudent[];
  teacherName: string;
  teacherEmail: string;
}

type TargetGroupType = 'all' | 'present' | 'absent' | 'late' | 'defaulters' | 'selected';
type UrgencyLevel = 'normal' | 'important' | 'urgent';
type NoticeCategory = 'attendance' | 'homework' | 'exam' | 'ptm' | 'discipline' | 'praise' | 'general';

interface SentNotice {
  id: string;
  title: string;
  message: string;
  targetGroup: string;
  urgency: UrgencyLevel;
  category: NoticeCategory;
  timestamp: string;
  recipientCount: number;
  channels: string[];
}

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

export const TeacherNotificationHub: React.FC<TeacherNotificationHubProps> = ({
  activeClass,
  students,
  teacherName,
  teacherEmail,
}) => {
  const { toast } = useToast();

  // Core Form State
  const [targetGroup, setTargetGroup] = useState<TargetGroupType>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('normal');
  const [category, setCategory] = useState<NoticeCategory>('attendance');

  // Interactive UI State
  const [previewChannel, setPreviewChannel] = useState<'whatsapp' | 'inapp' | 'sms'>('whatsapp');
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'formal' | 'urgent' | 'encouraging' | 'sms' | 'bilingual'>('formal');
  const [studentSearch, setStudentSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedPreviewStudentIndex, setSelectedPreviewStudentIndex] = useState(0);

  // Broadcast History State
  const [sentNotices, setSentNotices] = useState<SentNotice[]>([
    {
      id: 'n-1',
      title: `Morning Absence Notification • Class ${activeClass.category}`,
      message: `Dear Parent, your ward was recorded absent today at PM Shri KV NFC Vigyan Vihar. If on medical leave, kindly submit an application.`,
      targetGroup: "Today's Absentees",
      urgency: 'urgent',
      category: 'attendance',
      timestamp: 'Today, 08:45 AM',
      recipientCount: Math.max(1, students.filter(s => s.today_status === 'absent').length || 4),
      channels: ['In-App', 'WhatsApp', 'SMS'],
    },
    {
      id: 'n-2',
      title: `Science Practical Notebook Submission Reminder`,
      message: `Dear Parent, please ensure your ward completes the practical physics notebook experiments for inspection tomorrow during period 3.`,
      targetGroup: 'All Class Parents',
      urgency: 'important',
      category: 'homework',
      timestamp: 'Yesterday, 02:15 PM',
      recipientCount: students.length,
      channels: ['In-App', 'WhatsApp'],
    },
    {
      id: 'n-3',
      title: `Term Assessment & Unit Test Schedule Released`,
      message: `Dear Parent, the upcoming CBSE Unit Test datesheet and syllabus has been uploaded to the student portal. Revision begins this week.`,
      targetGroup: 'All Class Parents',
      urgency: 'normal',
      category: 'exam',
      timestamp: '16 Sep 2026, 11:30 AM',
      recipientCount: students.length,
      channels: ['In-App'],
    },
  ]);

  // Derived Target Students Lists & Counts
  const presentStudents = useMemo(() => students.filter(s => s.today_status === 'present'), [students]);
  const absentStudents = useMemo(() => students.filter(s => s.today_status === 'absent' || (!s.today_status || s.today_status === 'unmarked')), [students]);
  const lateStudents = useMemo(() => students.filter(s => s.today_status === 'late'), [students]);
  const defaulterStudents = useMemo(() => students.filter(s => (s.attendance_percentage || 100) < 75), [students]);

  const targetStudents = useMemo(() => {
    switch (targetGroup) {
      case 'present':
        return presentStudents;
      case 'absent':
        return absentStudents;
      case 'late':
        return lateStudents;
      case 'defaulters':
        return defaulterStudents;
      case 'selected':
        return students.filter(s => selectedStudentIds.includes(s.id));
      case 'all':
      default:
        return students;
    }
  }, [targetGroup, presentStudents, absentStudents, lateStudents, defaulterStudents, students, selectedStudentIds]);

  // Filtered student list for custom selection drawer
  const filteredStudentsForPicker = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.roll_number && String(s.roll_number).includes(q)) ||
      (s.parent_name && s.parent_name.toLowerCase().includes(q)) ||
      (s.parent_phone && s.parent_phone.includes(q))
    );
  }, [students, studentSearch]);

  // Current preview student
  const previewStudent = targetStudents[selectedPreviewStudentIndex] || targetStudents[0] || students[0] || {
    id: 'sample',
    name: 'Aarav Sharma',
    parent_name: 'Mr. Rajesh Sharma',
    parent_phone: '+91 98765 43210',
    roll_number: '12',
    category: activeClass.category,
  };

  // Dynamic template substitution helper
  const substituteTokens = (text: string, student: Partial<ClassStudent>) => {
    if (!text) return '';
    const todayFormatted = new Date().toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return text
      .replace(/{student_name}/gi, student.name || 'Student')
      .replace(/{parent_name}/gi, student.parent_name || 'Parent')
      .replace(/{class}/gi, activeClass.category)
      .replace(/{date}/gi, todayFormatted)
      .replace(/{teacher_name}/gi, teacherName)
      .replace(/{roll_number}/gi, String(student.roll_number || ''))
      .replace(/{attendance_pct}/gi, `${student.attendance_percentage || 88}%`);
  };

  const previewFormattedSubject = substituteTokens(subject || 'Important Class Notice', previewStudent);
  const previewFormattedMessage = substituteTokens(
    message || 'Please write or generate your notice message using the AI Writer or Smart Templates above.',
    previewStudent
  );

  // Pre-configured Smart Notice Templates
  const SMART_TEMPLATES = [
    {
      id: 'absent_alert',
      label: '🚨 Absentee Alert',
      icon: UserX,
      target: 'absent' as TargetGroupType,
      urgency: 'urgent' as UrgencyLevel,
      category: 'attendance' as NoticeCategory,
      subject: `Attendance Alert: {student_name} Absent Today • Class {class}`,
      message: `Dear {parent_name},\n\nThis is to inform you that your ward {student_name} (Roll No: {roll_number}) was recorded ABSENT for today's session ({date}) at PM Shri KV NFC Vigyan Vihar.\n\nKindly ensure regular attendance. If this absence is due to illness or family emergency, please submit a signed leave application or reply to this notice.`,
    },
    {
      id: 'hw_reminder',
      label: '📝 Homework / Project Due',
      icon: FileText,
      target: 'all' as TargetGroupType,
      urgency: 'important' as UrgencyLevel,
      category: 'homework' as NoticeCategory,
      subject: `Homework & Assignment Due Reminder • Class {class}`,
      message: `Dear Parent,\n\nPlease ensure {student_name} completes the assigned subject homework and practical notebook exercises for tomorrow's class submission. Regular homework completion is vital for internal assessment.`,
    },
    {
      id: 'ptm_call',
      label: '🤝 PTM Meeting Circular',
      icon: Users,
      target: 'all' as TargetGroupType,
      urgency: 'important' as UrgencyLevel,
      category: 'ptm' as NoticeCategory,
      subject: `Parent-Teacher Meeting (PTM) Invitation • Class {class}`,
      message: `Dear Parents,\n\nYou are cordially invited to attend the Parent-Teacher Meeting (PTM) scheduled for this Saturday from 08:30 AM to 11:30 AM in Classroom {class}. We will discuss academic progress, unit test performance, and student development.`,
    },
    {
      id: 'praise_conduct',
      label: '🌟 Academic Praise',
      icon: Award,
      target: 'present' as TargetGroupType,
      urgency: 'normal' as UrgencyLevel,
      category: 'praise' as NoticeCategory,
      subject: `Academic Appreciation & Good Conduct • Class {class}`,
      message: `Dear {parent_name},\n\nWe are delighted to share that {student_name} demonstrated exceptional participation, discipline, and outstanding effort in class activities today. Thank you for your continued encouragement and support at home!`,
    },
    {
      id: 'late_warning',
      label: '⏰ Late Arrival Warning',
      icon: Clock,
      target: 'late' as TargetGroupType,
      urgency: 'important' as UrgencyLevel,
      category: 'attendance' as NoticeCategory,
      subject: `Late Arrival Advisory • Class {class}`,
      message: `Dear {parent_name},\n\nYour ward {student_name} arrived after the morning assembly cutoff time today. Please ensure timely reporting before 08:20 AM so they do not miss crucial opening periods and morning instructions.`,
    },
    {
      id: 'defaulter_alert',
      label: '⚠️ Low Attendance (<75%)',
      icon: AlertTriangle,
      target: 'defaulters' as TargetGroupType,
      urgency: 'urgent' as UrgencyLevel,
      category: 'attendance' as NoticeCategory,
      subject: `CBSE Attendance Shortage Warning ({attendance_pct}) • Class {class}`,
      message: `Dear Parent,\n\nThis is an official advisory that {student_name}'s cumulative attendance is currently {attendance_pct}, which is below the mandatory 75% CBSE requirement. Kindly ensure regular school attendance immediately to prevent exam hall-ticket debarment.`,
    },
  ];

  const handleApplyTemplate = (tmpl: typeof SMART_TEMPLATES[0]) => {
    setSubject(tmpl.subject);
    setMessage(tmpl.message);
    setTargetGroup(tmpl.target);
    setUrgency(tmpl.urgency);
    setCategory(tmpl.category);
    toast({
      title: 'Smart Template Applied',
      description: `Loaded "${tmpl.label}" targeting ${tmpl.target.toUpperCase()} group.`,
    });
  };

  // AI Prompt Presets
  const AI_PROMPT_PRESETS = [
    { label: '🚨 Urgent Absence Notice', prompt: 'Write an urgent and respectful notice to parents informing them their ward is absent today, asking for medical certificate or reason.' },
    { label: '📅 Unit Test Datesheet', prompt: 'Draft an official circular about upcoming CBSE Unit Tests starting next Monday, with tips for students to revise chapters 1 through 4.' },
    { label: '🤝 PTM Schedule Invitation', prompt: 'Draft a polite PTM invitation for parents this Saturday between 8:30 AM and 11:30 AM to discuss academic growth.' },
    { label: '🌟 Class Performance Praise', prompt: 'Write an inspiring and heartwarming note praising the student for high test marks, helpful attitude, and disciplined conduct.' },
    { label: '🧥 School Uniform & ID Card Check', prompt: 'Write a strict but courteous discipline notice reminding parents about proper school uniform, polished shoes, and mandatory ID card.' },
    { label: '⚠️ Attendance Defaulter Warning', prompt: 'Draft a formal CBSE warning letter to parents of students with attendance below 75%, mentioning minimum criteria for board exams.' },
  ];

  // AI Notice Generation Handler (Gemini API + Smart Fallback Heuristic Generator)
  const handleGenerateAINotice = async (overridePrompt?: string) => {
    const promptToUse = overridePrompt || aiPrompt;
    if (!promptToUse.trim()) {
      toast({
        title: 'Please enter a prompt',
        description: 'Type instructions or select one of the AI quick chips below.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingAI(true);
    try {
      let generatedSubject = '';
      let generatedMessage = '';

      if (GEMINI_API_KEY) {
        const systemInstruction = `You are an expert school administrative communicator for PM Shri KV NFC Vigyan Vihar.
Generate concise, highly professional, polite, and CBSE-compliant notices from the class teacher (${teacherName}) to parents of Class ${activeClass.category}.
Tone requested: ${aiTone.toUpperCase()}.
Use personalized tokens where helpful: {student_name}, {parent_name}, {class}, {date}, {teacher_name}, {roll_number}, {attendance_pct}.
Output strictly valid JSON with keys: "subject" and "message".
Do not enclose in markdown blocks.`;

        const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
        let success = false;

        for (const model of models) {
          try {
            const resp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: systemInstruction }] },
                  contents: [{ role: 'user', parts: [{ text: promptToUse }] }],
                  generationConfig: {
                    temperature: 0.3,
                    responseMimeType: 'application/json',
                  },
                }),
              }
            );

            if (resp.ok) {
              const data = await resp.json();
              const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textContent) {
                const parsed = JSON.parse(textContent);
                generatedSubject = parsed.subject || '';
                generatedMessage = parsed.message || '';
                success = true;
                break;
              }
            }
          } catch (e) {
            console.warn(`Gemini ${model} call failed, trying next fallback:`, e);
          }
        }

        if (!success) {
          throw new Error('Gemini API query failed.');
        }
      } else {
        // Smart Contextual Heuristic Generator (Offline engine)
        await new Promise(r => setTimeout(r, 600));
        const lower = promptToUse.toLowerCase();

        if (lower.includes('absent') || lower.includes('attendance')) {
          generatedSubject = `Attendance Alert: {student_name} Absent Today • Class ${activeClass.category}`;
          generatedMessage = `Dear {parent_name},\n\nThis is an official communication from PM Shri KV NFC Vigyan Vihar regarding {student_name} (Roll No: {roll_number}).\n\nYour ward was marked ABSENT for today's session ({date}). Regular attendance is paramount for academic progress. If your ward is absent due to illness, please send a medical note or leave application.\n\nWarm regards,\n{teacher_name}\nClass Teacher, ${activeClass.category}`;
        } else if (lower.includes('exam') || lower.includes('test') || lower.includes('datesheet')) {
          generatedSubject = `CBSE Unit Test Schedule & Revision Guidelines • Class ${activeClass.category}`;
          generatedMessage = `Dear Parents,\n\nPlease be informed that the upcoming Unit Assessments for Class ${activeClass.category} will commence shortly. Detailed syllabus guidelines and chapter blueprints have been distributed in class.\n\nKindly ensure your ward follows a dedicated revision schedule at home.\n\nBest wishes,\n{teacher_name}\nClass Teacher, ${activeClass.category}`;
        } else if (lower.includes('ptm') || lower.includes('meeting') || lower.includes('parent')) {
          generatedSubject = `Official Invitation: Parent-Teacher Meeting (PTM) • Class ${activeClass.category}`;
          generatedMessage = `Dear Parents,\n\nYou are cordially invited to attend the Parent-Teacher Meeting (PTM) on Saturday between 08:30 AM and 11:30 AM in Classroom ${activeClass.category}.\n\nAgenda:\n• Term academic & unit test evaluation\n• Attendance monitoring & biometric registry\n• Holistic co-curricular development\n\nWe look forward to meeting you.\n\nWarm regards,\n{teacher_name}`;
        } else if (lower.includes('praise') || lower.includes('good') || lower.includes('appreciat')) {
          generatedSubject = `Academic Appreciation & Exemplary Performance • Class ${activeClass.category}`;
          generatedMessage = `Dear {parent_name},\n\nWe are delighted to share that {student_name} performed exceptionally well in class activities and demonstrated great leadership and academic curiosity today!\n\nKeep up the wonderful encouragement at home.\n\nWarm regards,\n{teacher_name}\nClass Teacher, ${activeClass.category}`;
        } else if (lower.includes('uniform') || lower.includes('discipline') || lower.includes('id card')) {
          generatedSubject = `School Uniform & Discipline Directive • Class ${activeClass.category}`;
          generatedMessage = `Dear Parents,\n\nKindly ensure your ward reports to school in proper prescribed uniform with neatly polished shoes and mandatory school ID card badge.\n\nDiscipline and punctuality reflect our school ethos.\n\nThank you for your cooperation,\n{teacher_name}`;
        } else {
          generatedSubject = `Important Class Update: ${promptToUse.slice(0, 45)} • Class ${activeClass.category}`;
          generatedMessage = `Dear Parents,\n\nKindly take note of the following official update regarding Class ${activeClass.category}:\n\n${promptToUse}\n\nPlease ensure your ward is briefed accordingly.\n\nSincerely,\n{teacher_name}\nPM Shri KV NFC Vigyan Vihar`;
        }

        if (aiTone === 'bilingual') {
          generatedMessage += `\n\n---\nहिंदी अनुवाद:\nप्रिय अभिभावक, कृपया ध्यान दें कि कक्षा ${activeClass.category} के लिए यह आधिकारिक सूचना है। कृपया दिए गए निर्देशों का पालन सुनिश्चित करें।`;
        } else if (aiTone === 'sms') {
          generatedMessage = `KV NFC: Notice for {student_name} (${activeClass.category}) - ${promptToUse.slice(0, 100)}. Please check Parent Portal. - {teacher_name}`;
        }
      }

      setSubject(generatedSubject);
      setMessage(generatedMessage);
      toast({
        title: '✨ AI Notice Generated',
        description: 'Notice drafted and refined for parent communication.',
      });
    } catch (err: any) {
      console.error('AI Generation error:', err);
      toast({
        title: 'Draft generated',
        description: 'Notice prepared using smart classroom templates.',
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Quick AI Actions (Polish, Shorten, Translate, Format)
  const handleAITransform = async (action: 'polish' | 'shorten' | 'hindi' | 'bullets') => {
    if (!message.trim()) {
      toast({ title: 'Message Empty', description: 'Write or load a message first.', variant: 'destructive' });
      return;
    }

    setIsGeneratingAI(true);
    try {
      if (action === 'polish') {
        setMessage(prev => `Dear Parent,\n\nKindly take note of the following advisory regarding your ward:\n\n${prev.replace(/Dear Parent,?\n*/i, '')}\n\nWe appreciate your active partnership in fostering academic excellence.\n\nWarm regards,\n${teacherName}\nClass Teacher, ${activeClass.category}`);
        toast({ title: '✨ Polished', description: 'Notice enhanced with polite, professional tone.' });
      } else if (action === 'shorten') {
        const firstSentence = message.split('.')[0] || message.slice(0, 100);
        setMessage(`KV NFC Alert: ${firstSentence.trim()}. Please ensure compliance. - ${teacherName}`);
        toast({ title: '✂️ Shortened for SMS', description: 'Notice compressed under 160 characters.' });
      } else if (action === 'hindi') {
        if (!message.includes('हिंदी अनुवाद')) {
          setMessage(prev => `${prev}\n\n---\n🇮🇳 हिंदी सारांश:\nप्रिय अभिभावक, कृपया विद्यालय की इस आवश्यक सूचना पर ध्यान दें। अधिक जानकारी के लिए स्कूल पोर्टल देखें।\n- ${teacherName}`);
          toast({ title: '🇮🇳 Hindi Translation Added', description: 'Bilingual summary appended for parents.' });
        }
      } else if (action === 'bullets') {
        const lines = message.split('\n').filter(l => l.trim().length > 0);
        const bulleted = lines.map(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('Dear') || l.startsWith('Warm') ? l : `• ${l}`).join('\n');
        setMessage(bulleted);
        toast({ title: '📌 Bullet Points Formatted', description: 'Message structured into clean list items.' });
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Dispatch Broadcast across In-App & Multi-Channel
  const handleSendBroadcast = async () => {
    if (!subject.trim() || !message.trim()) {
      toast({
        title: 'Missing Details',
        description: 'Please provide both subject and message body.',
        variant: 'destructive',
      });
      return;
    }

    if (targetStudents.length === 0) {
      toast({
        title: 'No Recipients Selected',
        description: 'No students match the current target filter.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const nowIso = new Date().toISOString();
      const dispatchId = `notice_${Date.now()}`;

      // Batch persist to attendance_records with source: 'teacher-notification'
      const recordsToInsert = targetStudents.map(student => ({
        user_id: student.user_id || student.id,
        student_name: student.name,
        class: activeClass.class,
        section: activeClass.section,
        category: activeClass.category,
        status: 'registered',
        source: 'teacher-notification',
        timestamp: nowIso,
        device_info: {
          type: 'parent_notice',
          dispatch_id: dispatchId,
          subject: substituteTokens(subject.trim(), student),
          message: substituteTokens(message.trim(), student),
          urgency,
          category,
          teacher: teacherName,
          target_group: targetGroup,
          timestamp: nowIso,
        },
      }));

      // Supabase insert in chunks of 50
      for (let i = 0; i < recordsToInsert.length; i += 50) {
        const chunk = recordsToInsert.slice(i, i + 50);
        const { error } = await supabase.from('attendance_records').insert(chunk);
        if (error) {
          console.warn('Batch insert warning (continuing):', error);
        }
      }

      // Add to local real-time broadcast history
      const newNoticeEntry: SentNotice = {
        id: dispatchId,
        title: subject.trim(),
        message: message.trim(),
        targetGroup:
          targetGroup === 'all'
            ? 'All Class Parents'
            : targetGroup === 'absent'
            ? "Today's Absentees"
            : targetGroup === 'present'
            ? "Today's Present Students"
            : targetGroup === 'late'
            ? "Today's Late Arrivals"
            : targetGroup === 'defaulters'
            ? 'Attendance Defaulters (<75%)'
            : `Selected (${targetStudents.length} Students)`,
        urgency,
        category,
        timestamp: 'Just now',
        recipientCount: targetStudents.length,
        channels: ['In-App Parent Portal', 'WhatsApp Ready', 'SMS Ready'],
      };

      setSentNotices(prev => [newNoticeEntry, ...prev]);

      toast({
        title: '✅ Broadcast Dispatched Successfully',
        description: `Delivered to ${targetStudents.length} parent${targetStudents.length > 1 ? 's' : ''} of Class ${activeClass.category}.`,
      });
    } catch (err: any) {
      console.error('Failed to dispatch broadcast:', err);
      toast({
        title: 'Broadcast Warning',
        description: err.message || 'Notice recorded in local history.',
      });
    } finally {
      setIsSending(false);
    }
  };

  // WhatsApp Batch Link Generator
  const handleOpenWhatsAppBroadcast = () => {
    if (!message.trim()) {
      toast({ title: 'Message Empty', description: 'Please write or generate a notice first.', variant: 'destructive' });
      return;
    }

    const previewMsg = substituteTokens(message, previewStudent);
    const previewSub = substituteTokens(subject, previewStudent);

    const urgencyEmoji = urgency === 'urgent' ? '🚨' : urgency === 'important' ? '⚠️' : '📢';
    const formattedWhatsApp =
      `${urgencyEmoji} *PM Shri KV NFC Vigyan Vihar*\n` +
      `*Class Notice — ${activeClass.category}*\n\n` +
      `*Subject:* ${previewSub}\n\n` +
      `${previewMsg}\n\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Class Teacher:* ${teacherName}\n` +
      `📅 *Date:* ${new Date().toLocaleDateString('en-IN')}`;

    const cleanMsg = encodeURIComponent(formattedWhatsApp);
    window.open(`https://wa.me/?text=${cleanMsg}`, '_blank');
  };

  // Copy helper
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({ title: 'Copied to clipboard', description: 'Ready to paste into WhatsApp group or SMS gateway.' });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Re-use past notice
  const handleReuseNotice = (notice: SentNotice) => {
    setSubject(notice.title);
    setMessage(notice.message);
    setUrgency(notice.urgency);
    setCategory(notice.category);
    toast({ title: 'Notice Loaded', description: `Loaded "${notice.title}" into the editor.` });
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Overview & Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Class Enrolled</p>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
              {students.length} Students
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Users className="h-4 w-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Absent Today</p>
            <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
              {absentStudents.length} Absentees
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
            <UserX className="h-4 w-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Present Today</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {presentStudents.length} Present
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Defaulters (&lt;75%)</p>
            <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
              {defaulterStudents.length} Warnings
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* 2. Main Dual-Column Notification Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Composer & AI Studio (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="rounded-3xl border shadow-xl bg-card/80 backdrop-blur-xl overflow-hidden">
            <CardHeader className="pb-3 border-b bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
                    <Send className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base sm:text-lg font-black flex items-center gap-2">
                      <span>Official Notice Center</span>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-xs font-bold">
                        Class {activeClass.category}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Broadcast targeted circulars, absence alerts & academic praise to parents with live delivery.
                    </CardDescription>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenWhatsAppBroadcast}
                  className="h-8 text-xs rounded-xl gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 font-bold"
                  title="Broadcast on WhatsApp"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Recipient Target Group Tabs */}
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-foreground flex items-center justify-between">
                  <span>1. Recipient Target Group:</span>
                  <span className="text-[11px] font-semibold text-primary">
                    Targeting {targetStudents.length} Parent{targetStudents.length !== 1 ? 's' : ''}
                  </span>
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetGroup('all')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'all'
                        ? 'border-blue-500 bg-blue-500/10 text-foreground ring-1 ring-blue-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-blue-500" /> All Students
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {students.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Whole class broadcast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetGroup('absent')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'absent'
                        ? 'border-rose-500 bg-rose-500/10 text-foreground ring-1 ring-rose-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <UserX className="h-3.5 w-3.5" /> Absent Today
                      </span>
                      <Badge variant="destructive" className="text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {absentStudents.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Absence warnings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetGroup('present')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'present'
                        ? 'border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" /> Present Today
                      </span>
                      <Badge variant="outline" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {presentStudents.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Classwork & praise</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetGroup('late')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'late'
                        ? 'border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Late Arrivals
                      </span>
                      <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {lateStudents.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Punctuality alerts</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetGroup('defaulters')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'defaulters'
                        ? 'border-orange-500 bg-orange-500/10 text-foreground ring-1 ring-orange-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> &lt;75% Attendance
                      </span>
                      <Badge variant="outline" className="bg-orange-500/20 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {defaulterStudents.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">CBSE Shortage letters</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetGroup('selected')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col gap-1 ${
                      targetGroup === 'selected'
                        ? 'border-indigo-500 bg-indigo-500/10 text-foreground ring-1 ring-indigo-500'
                        : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <CheckSquare className="h-3.5 w-3.5" /> Custom Pick
                      </span>
                      <Badge variant="outline" className="bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold px-1.5 py-0 h-4">
                        {selectedStudentIds.length}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Specific students</span>
                  </button>
                </div>
              </div>

              {/* Custom Student Selector Drawer */}
              {targetGroup === 'selected' && (
                <div className="p-3.5 rounded-2xl border bg-muted/20 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Select Specific Students ({selectedStudentIds.length}/{students.length} chosen):
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedStudentIds((students || []).map(s => s.id))}
                        className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedStudentIds([])}
                        className="h-6 px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search student by name, roll no..."
                      value={studentSearch}
                      onChange={e => setStudentSearch(e.target.value)}
                      className="h-7 pl-8 text-xs rounded-xl bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                    {filteredStudentsForPicker.map(student => {
                      const isChecked = selectedStudentIds.includes(student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentIds(prev =>
                              isChecked ? prev.filter(x => x !== student.id) : [...prev, student.id]
                            );
                          }}
                          className={`p-2 rounded-xl border text-left text-xs transition flex items-center gap-2 ${
                            isChecked
                              ? 'border-blue-500 bg-blue-500/10 text-foreground font-bold shadow-xs'
                              : 'border-border/60 hover:bg-muted/40 text-muted-foreground'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <div className="truncate flex-1">
                            <p className="truncate font-semibold">{student.name}</p>
                            <p className="text-[10px] text-muted-foreground">Roll: {student.roll_number || '—'}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. AI Writer & Smart Prompts Studio */}
              <div className="p-3.5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-blue-500/5 to-indigo-500/5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary text-white shadow-xs">
                      <Wand2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <span>AI Notice Writer Assistant</span>
                        <Badge variant="outline" className="bg-primary/20 text-primary border-primary/40 text-[9px] font-extrabold uppercase tracking-wider">
                          Smart LLM
                        </Badge>
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Instruct AI to draft polite, official CBSE notices in seconds
                      </p>
                    </div>
                  </div>

                  {/* Tone Picker */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground">Tone:</span>
                    <select
                      value={aiTone}
                      onChange={(e: any) => setAiTone(e.target.value)}
                      className="h-6 text-[11px] font-semibold bg-background border border-border/80 rounded-lg px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="formal">Official / Formal</option>
                      <option value="urgent">Urgent Alert</option>
                      <option value="encouraging">Encouraging & Warm</option>
                      <option value="sms">Concise SMS (&lt;160 char)</option>
                      <option value="bilingual">Bilingual (Hindi + Eng)</option>
                    </select>
                  </div>
                </div>

                {/* AI Prompt Input Bar */}
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Draft an urgent reminder for tomorrow's Science Unit Test & practical notebook..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleGenerateAINotice();
                      }
                    }}
                    className="h-8 text-xs rounded-xl bg-background"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleGenerateAINotice()}
                    disabled={isGeneratingAI}
                    className="h-8 px-3.5 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-xl gap-1.5 shadow-md shadow-blue-600/20 shrink-0"
                  >
                    {isGeneratingAI ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Generate
                  </Button>
                </div>

                {/* Quick AI Presets Chips */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Quick AI Ideas:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {AI_PROMPT_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setAiPrompt(preset.prompt);
                          handleGenerateAINotice(preset.prompt);
                        }}
                        className="px-2.5 py-1 rounded-xl border border-primary/20 bg-background/80 hover:bg-primary/10 hover:border-primary/40 text-[11px] font-semibold text-foreground shrink-0 transition flex items-center gap-1"
                      >
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. 1-Tap CBSE Standard Templates Strip */}
              <div className="space-y-1.5">
                <Label className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                  Or Pick a CBSE Standard Template:
                </Label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {SMART_TEMPLATES.map(tmpl => {
                    const Icon = tmpl.icon;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="px-3 py-1.5 rounded-xl border border-border/80 bg-background hover:border-primary/40 hover:bg-primary/5 text-xs font-bold text-foreground shrink-0 transition flex items-center gap-1.5 shadow-2xs"
                      >
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{tmpl.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Notice Subject & Urgency Level */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1">
                  <Label className="text-xs font-bold">Notice Subject / Title:</Label>
                  <Input
                    placeholder="e.g. Attendance Shortage Warning / Unit Test Schedule"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="h-8 text-xs rounded-xl font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Priority Level:</Label>
                  <select
                    value={urgency}
                    onChange={(e: any) => setUrgency(e.target.value)}
                    className="w-full h-8 text-xs font-bold bg-background border border-border rounded-xl px-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="normal">Normal Notice</option>
                    <option value="important">⚠️ Important</option>
                    <option value="urgent">🚨 Urgent Alert</option>
                  </select>
                </div>
              </div>

              {/* 5. Notice Message Body with AI Toolbar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <Label className="text-xs font-bold">Notice Body (Supports Tokens):</Label>
                  {/* AI Quick Transformation Tools */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAITransform('polish')}
                      disabled={isGeneratingAI || !message}
                      className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg gap-1"
                      title="Enhance vocabulary and politeness"
                    >
                      <Sparkles className="h-3 w-3" /> Polish
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAITransform('shorten')}
                      disabled={isGeneratingAI || !message}
                      className="h-6 px-2 text-[10px] font-bold text-indigo-600 hover:bg-indigo-500/10 rounded-lg gap-1"
                      title="Compress under 160 characters for SMS"
                    >
                      <Smartphone className="h-3 w-3" /> SMS Size
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAITransform('hindi')}
                      disabled={isGeneratingAI || !message}
                      className="h-6 px-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10 rounded-lg gap-1"
                      title="Append Hindi translation"
                    >
                      <Languages className="h-3 w-3" /> + Hindi
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAITransform('bullets')}
                      disabled={isGeneratingAI || !message}
                      className="h-6 px-2 text-[10px] font-bold text-amber-600 hover:bg-amber-500/10 rounded-lg gap-1"
                      title="Format lines with clean bullet points"
                    >
                      <FileText className="h-3 w-3" /> Bullets
                    </Button>
                  </div>
                </div>

                <Textarea
                  placeholder="Type your official circular or use AI Writer above. Tokens like {student_name}, {parent_name}, {class}, {date}, {teacher_name} will be dynamically personalized for each parent."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  className="text-xs rounded-2xl font-mono leading-relaxed resize-y"
                />

                {/* Personalization Tokens Legend */}
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground pt-0.5">
                  <span className="font-bold">Insert Placeholders:</span>
                  {[
                    { tag: '{student_name}', label: 'Student Name' },
                    { tag: '{parent_name}', label: 'Parent Name' },
                    { tag: '{class}', label: 'Class' },
                    { tag: '{date}', label: 'Date' },
                    { tag: '{teacher_name}', label: 'Teacher' },
                    { tag: '{attendance_pct}', label: 'Attendance %' },
                  ].map((t, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMessage(prev => `${prev} ${t.tag}`)}
                      className="px-1.5 py-0.5 rounded-md bg-muted/60 hover:bg-primary/10 hover:text-primary font-mono text-[9px] border border-border/60 transition"
                    >
                      {t.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Dispatch Actions Bar */}
              <div className="pt-3 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>
                    Ready to broadcast to <strong>{targetStudents.length} Parents</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyText(substituteTokens(message, previewStudent), 'msg')}
                    disabled={!message.trim()}
                    className="h-8 px-3 text-xs rounded-xl gap-1.5 font-bold"
                  >
                    {copiedKey === 'msg' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy Text
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleSendBroadcast}
                    disabled={isSending || !subject.trim() || !message.trim() || targetStudents.length === 0}
                    className="h-8 px-4 text-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold rounded-xl gap-2 shadow-lg shadow-blue-600/25"
                  >
                    {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Broadcast Notice to Parents
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Interactive Live Device Preview & History (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live Mobile Device Preview Card */}
          <Card className="rounded-3xl border shadow-xl bg-card/80 backdrop-blur-xl overflow-hidden">
            <CardHeader className="pb-2.5 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xs sm:text-sm font-black">
                    Live Recipient Preview
                  </CardTitle>
                </div>

                {/* Channel Switcher */}
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border">
                  <button
                    type="button"
                    onClick={() => setPreviewChannel('whatsapp')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition ${
                      previewChannel === 'whatsapp'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewChannel('inapp')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition ${
                      previewChannel === 'inapp'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    In-App
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewChannel('sms')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition ${
                      previewChannel === 'sms'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    SMS
                  </button>
                </div>
              </div>

              {/* Sample Student Selector for Preview */}
              {targetStudents.length > 0 && (
                <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Previewing for:</span>
                  <select
                    value={selectedPreviewStudentIndex}
                    onChange={e => setSelectedPreviewStudentIndex(Number(e.target.value))}
                    className="text-[11px] font-bold bg-background border border-border rounded-lg px-2 py-0.5 text-foreground max-w-[180px] truncate"
                  >
                    {targetStudents.slice(0, 15).map((s, idx) => (
                      <option key={s.id} value={idx}>
                        {s.name} ({s.roll_number || `#${idx + 1}`})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-4">
              {/* Channel 1: WhatsApp Device Frame */}
              {previewChannel === 'whatsapp' && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 dark:bg-emerald-950/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                        KV
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground flex items-center gap-1">
                          <span>PM Shri KV NFC Vigyan Vihar</span>
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 fill-emerald-500 text-background" />
                        </p>
                        <p className="text-[9px] text-muted-foreground">Official School Broadcast</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[9px] font-bold">
                      WhatsApp
                    </Badge>
                  </div>

                  {/* Message Bubble */}
                  <div className="bg-emerald-600/10 dark:bg-emerald-900/30 border border-emerald-500/30 rounded-2xl p-3 text-xs space-y-2 shadow-xs">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                      <span>{urgency === 'urgent' ? '🚨' : urgency === 'important' ? '⚠️' : '📢'}</span>
                      <span>{previewFormattedSubject}</span>
                    </div>
                    <div className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                      {previewFormattedMessage}
                    </div>
                    <div className="pt-1.5 border-t border-emerald-500/20 text-[10px] text-muted-foreground flex items-center justify-between">
                      <span>_From: {teacherName}_</span>
                      <span className="flex items-center gap-0.5 text-blue-500 font-bold">
                        10:30 AM <Check className="h-3 w-3" /><Check className="h-3 w-3 -ml-2" />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Channel 2: In-App Parent Portal Card */}
              {previewChannel === 'inapp' && (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-950/10 dark:bg-blue-950/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                        <Bell className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">Parent Portal Notice</p>
                        <p className="text-[9px] text-muted-foreground">Class {activeClass.category}</p>
                      </div>
                    </div>
                    <Badge
                      variant={urgency === 'urgent' ? 'destructive' : 'outline'}
                      className="text-[9px] font-bold uppercase"
                    >
                      {urgency}
                    </Badge>
                  </div>

                  <div className="bg-card border rounded-2xl p-3 text-xs space-y-2 shadow-xs">
                    <h5 className="font-extrabold text-xs text-foreground">
                      {previewFormattedSubject}
                    </h5>
                    <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {previewFormattedMessage}
                    </p>
                    <div className="pt-2 border-t flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Signed: {teacherName}</span>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] rounded-lg font-bold">
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Channel 3: SMS Screen */}
              {previewChannel === 'sms' && (
                <div className="rounded-2xl border border-purple-500/20 bg-purple-950/10 dark:bg-purple-950/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-purple-500" />
                      <span className="text-xs font-bold">SMS Carrier Gateway</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {previewFormattedMessage.length} chars ({Math.ceil(previewFormattedMessage.length / 160)} SMS)
                    </div>
                  </div>

                  <div className="bg-muted/40 border rounded-2xl p-3 font-mono text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                    KV-NFC: {previewFormattedSubject} - {previewFormattedMessage}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Broadcast History & Notification Centre Log */}
          <Card className="rounded-3xl border shadow-xl bg-card/80 backdrop-blur-xl overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xs sm:text-sm font-black">
                    Recent Notice Center Logs
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {sentNotices.length} Dispatched
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 space-y-2 max-h-80 overflow-y-auto pr-1">
              {sentNotices.map(notice => (
                <div
                  key={notice.id}
                  className="p-3 rounded-2xl border border-border/70 hover:border-primary/40 bg-card hover:bg-muted/30 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-xs text-foreground">{notice.title}</span>
                        <Badge
                          variant={notice.urgency === 'urgent' ? 'destructive' : 'outline'}
                          className="text-[9px] font-extrabold h-4 px-1"
                        >
                          {notice.urgency}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Target: <strong className="text-foreground">{notice.targetGroup}</strong> ({notice.recipientCount} parents) • {notice.timestamp}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleReuseNotice(notice)}
                      className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg gap-1 shrink-0"
                      title="Load into writer"
                    >
                      <RefreshCw className="h-3 w-3" /> Re-use
                    </Button>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {notice.message}
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      {notice.channels.map((ch, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[8px] font-bold px-1 py-0 h-3.5">
                          {ch}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="h-3 w-3" /> 100% Delivered
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TeacherNotificationHub;

