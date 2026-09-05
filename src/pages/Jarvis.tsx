import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { JarvisHUD } from "@/components/jarvis/JarvisHUD";
import { JarvisAuditTable } from "@/components/jarvis/JarvisAuditTable";
import { jarvisAudit, AuditSummaryResult } from "@/services/jarvis/JarvisAuditService";
import { jarvisAI, JarvisAnalysisResponse } from "@/services/jarvis/JarvisAIService";
import { jarvisVoice } from "@/services/jarvis/JarvisVoiceService";
import { presencesDataContext } from "@/services/jarvis/PresencesDataContext";
import { jarvisSupabase, JarvisStudentAudit, JarvisSystemLog } from "@/integrations/jarvis/supabaseClient";
import {
  ShieldCheck,
  Cpu,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  RefreshCw,
  ArrowLeft,
  Terminal,
  Activity,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Download,
  Wrench,
  Trash2,
  Fingerprint,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Jarvis() {
  const { toast } = useToast();

  const notify = {
    info: (msg: string) => toast({ title: "J.A.R.V.I.S.", description: msg }),
    success: (msg: string) => toast({ title: "System Updated", description: msg }),
    error: (msg: string) => toast({ title: "System Alert", description: msg, variant: "destructive" }),
  };

  const [isScanning, setIsScanning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);

  const [auditSummary, setAuditSummary] = useState<AuditSummaryResult | null>(null);
  const [analysis, setAnalysis] = useState<JarvisAnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"audits" | "recommendations" | "telemetry">("audits");
  const [isHealing, setIsHealing] = useState(false);
  const [healingProgress, setHealingProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  // Chat / Command input
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "jarvis"; text: string; time: string }>>([
    {
      sender: "jarvis",
      text: "Good day, Sir. I am online and standing by. You may initiate an automated diagnostic sweep or issue any query regarding student records, face biometric coverage, or system telemetry.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [recentLogs, setRecentLogs] = useState<JarvisSystemLog[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const micControllerRef = useRef<{ stop: () => void } | null>(null);

  // Load any prior diagnostics or audits on initial mount
  useEffect(() => {
    jarvisVoice.playChime("boot");
    loadPriorSnapshot();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const loadPriorSnapshot = async () => {
    try {
      // Query baseline telemetry from older Presences database
      const liveSnapshot = await presencesDataContext.getLiveSnapshot();

      const { data: audits } = await jarvisSupabase
        .from("jarvis_student_audits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      const { data: logs } = await jarvisSupabase
        .from("jarvis_system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (logs) setRecentLogs(logs);

      if (audits && audits.length > 0) {
        setAuditSummary({
          totalStudentsChecked: liveSnapshot.totalStudents > 0 ? liveSnapshot.totalStudents : audits.length,
          missingPhotos: audits.filter((a) => a.issue_type === "missing_photo").length,
          missingFaceDescriptors: audits.filter((a) => a.issue_type === "missing_descriptor").length,
          missingParentContacts: audits.filter((a) => a.issue_type === "missing_parent_contact").length,
          missingClassOrSection: audits.filter((a) => a.issue_type === "unassigned_section").length,
          duplicateIdentifiers: audits.filter((a) => a.issue_type === "duplicate_identifier").length,
          systemErrorsFound: logs?.length || 0,
          studentAudits: audits,
          systemLogs: logs || [],
        });
      } else if (liveSnapshot.totalStudents > 0) {
        setAuditSummary({
          totalStudentsChecked: liveSnapshot.totalStudents,
          missingPhotos: liveSnapshot.missingPhotosCount,
          missingFaceDescriptors: liveSnapshot.missingBiometricsCount,
          missingParentContacts: liveSnapshot.missingParentContactsCount,
          missingClassOrSection: 0,
          duplicateIdentifiers: 0,
          systemErrorsFound: logs?.length || 0,
          studentAudits: [],
          systemLogs: logs || [],
        });
      }
    } catch (e) {
      console.warn("Snapshot load non-critical error:", e);
    }
  };

  // Run On-Demand Diagnostic Sweep
  const handleRunDiagnosticSweep = async () => {
    if (isScanning) return;
    setIsScanning(true);
    jarvisVoice.playChime("scan");
    notify.info("JARVIS: Diagnostic sweep initialized across campus registry.");

    try {
      // 1. Audit student details, biometrics, and error logs
      const summary = await jarvisAudit.runFullAudit();
      setAuditSummary(summary);

      // 2. Synthesize with Gemini AI
      const aiResponse = await jarvisAI.analyzeAuditReport(summary);
      setAnalysis(aiResponse);
      setHealthScore(aiResponse.healthScore);

      // 3. Add to chat history
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "jarvis",
          text: aiResponse.spokenSummary,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      // 4. Voice the response
      setIsSpeaking(true);
      await jarvisVoice.speak(aiResponse.spokenSummary, () => setIsSpeaking(false));

      notify.success("Diagnostic sweep complete. Operational status updated.");
    } catch (err: any) {
      console.error("Diagnostic error:", err);
      notify.error("Diagnostic encounter: " + (err?.message || "Unknown error"));
    } finally {
      setIsScanning(false);
    }
  };

  // Voice Interaction (Speech-to-Text)
  const handleToggleMic = () => {
    if (isListening) {
      micControllerRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (!jarvisVoice.isSpeechRecognitionSupported()) {
      notify.error("Microphone recognition is not supported in this browser. You can type commands below.");
      return;
    }

    setIsListening(true);
    micControllerRef.current = jarvisVoice.startListening(
      (transcript) => {
        setIsListening(false);
        if (transcript.trim()) {
          handleSendCommand(transcript);
        }
      },
      (err) => {
        setIsListening(false);
        notify.error("Microphone issue: " + String(err));
      },
      () => {
        setIsListening(false);
      }
    );
  };

  // Autonomous Biometric Auto-Healing Handler
  const handleAutoHealBiometrics = async () => {
    if (isHealing) return;
    setIsHealing(true);
    jarvisVoice.playChime("scan");
    notify.info("JARVIS: Initializing autonomous biometric descriptor enrollment...");

    try {
      const result = await jarvisAudit.autoHealMissingBiometrics((curr, total, name) => {
        setHealingProgress({ current: curr, total, name });
      });

      const message =
        result.healed > 0
          ? `Biometric auto-healing concluded, Sir. I have successfully enrolled facial descriptors for ${result.healed} student${result.healed > 1 ? "s" : ""}. ${result.failed > 0 ? `${result.failed} portraits could not be processed.` : "All candidates are now enrolled for gate recognition."}`
          : `Autonomous sequence completed, Sir. ${result.details[0] || "No eligible candidate portraits found."}`;

      setChatHistory((prev) => [
        ...prev,
        { sender: "jarvis", text: message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      ]);

      setIsSpeaking(true);
      await jarvisVoice.speak(message, () => setIsSpeaking(false));

      // Refresh snapshot
      await handleRunDiagnosticSweep();
      notify.success(`Autonomous enrollment complete: ${result.healed} enrolled.`);
    } catch (err: any) {
      notify.error("Auto-heal error: " + (err?.message || "Unknown error"));
    } finally {
      setIsHealing(false);
      setHealingProgress(null);
    }
  };

  // Export Audit CSV Handler
  const handleExportCSV = () => {
    if (!auditSummary?.studentAudits?.length) {
      notify.info("No audit findings available to export. Please run a diagnostic sweep first.");
      return;
    }
    jarvisAudit.exportAuditReportCSV(auditSummary.studentAudits, healthScore);
    jarvisVoice.playChime("affirm");
    notify.success("Audit diagnostic report exported to CSV.");
  };

  // Clear Resolved Handler
  const handleClearResolved = async () => {
    await jarvisAudit.clearResolvedAudits();
    await loadPriorSnapshot();
    notify.success("Resolved anomaly records purged from database.");
  };

  // Send Command / Question to Jarvis with action interception
  const handleSendCommand = async (textToSend?: string) => {
    const prompt = (textToSend || chatInput).trim();
    if (!prompt) return;

    setChatInput("");
    const userTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setChatHistory((prev) => [
      ...prev,
      { sender: "user", text: prompt, time: userTime },
    ]);

    const lower = prompt.toLowerCase();
    if (lower.includes("run diagnostic") || lower.includes("diagnostic sweep") || lower.includes("scan system")) {
      handleRunDiagnosticSweep();
      return;
    }
    if (lower.includes("auto heal") || lower.includes("auto-heal") || lower.includes("fix biometric") || lower.includes("enroll descriptor")) {
      handleAutoHealBiometrics();
      return;
    }
    if (lower.includes("export report") || lower.includes("download report") || lower.includes("export csv")) {
      handleExportCSV();
      return;
    }
    if (lower.includes("clear resolved") || lower.includes("purge resolved")) {
      handleClearResolved();
      return;
    }

    try {
      const contextSnippet = auditSummary
        ? `Total Students: ${auditSummary.totalStudentsChecked}, Missing Biometrics: ${auditSummary.missingFaceDescriptors}, Missing Photos: ${auditSummary.missingPhotos}, Missing Parent Contacts: ${auditSummary.missingParentContacts}`
        : undefined;

      const reply = await jarvisAI.askJarvis(prompt, contextSnippet);

      setChatHistory((prev) => [
        ...prev,
        {
          sender: "jarvis",
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      setIsSpeaking(true);
      await jarvisVoice.speak(reply, () => setIsSpeaking(false));
    } catch (err: any) {
      notify.error("Jarvis communication error: " + err.message);
    }
  };

  const handleResolveAudit = async (auditId: string) => {
    await jarvisAudit.applyQuickFix(auditId, "mark_resolved");
    setAuditSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        studentAudits: prev.studentAudits.map((a) => (a.id === auditId ? { ...a, status: "resolved" } : a)),
      };
    });
    notify.success("Anomaly marked as resolved.");
  };

  const handleIgnoreAudit = async (auditId: string) => {
    await jarvisAudit.applyQuickFix(auditId, "ignore");
    setAuditSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        studentAudits: prev.studentAudits.filter((a) => a.id !== auditId),
      };
    });
    notify.info("Anomaly dismissed.");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30 font-sans pb-20">
      {/* Tactical Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition-colors px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Admin Deck</span>
          </Link>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-bold tracking-widest text-cyan-300 font-mono">
              J.A.R.V.I.S.
            </span>
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono">
              v4.8 AUTONOMOUS
            </span>
          </div>
        </div>

        {/* System telemetry pill indicators */}
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono">
          <div className="hidden md:flex items-center gap-1.5 text-slate-400">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>DIAGNOSTIC MATRIX: SYNCED</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>CORE ONLINE</span>
          </div>

          {isSpeaking && (
            <button
              onClick={() => {
                jarvisVoice.stopSpeaking();
                setIsSpeaking(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer"
            >
              <VolumeX className="w-3 h-3" />
              <span>Mute</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Top Hero Section: Holographic HUD */}
        <JarvisHUD
          isScanning={isScanning}
          isSpeaking={isSpeaking}
          isListening={isListening}
          healthScore={healthScore}
          onMicClick={handleToggleMic}
          onScanClick={handleRunDiagnosticSweep}
        />

        {/* Telemetry Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Students Evaluated
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
              {auditSummary ? auditSummary.totalStudentsChecked : "—"}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Active registry profiles</div>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-xs font-mono uppercase tracking-wider text-rose-400">
              Missing Biometrics
            </div>
            <div className="text-2xl font-bold font-mono text-rose-300 mt-1">
              {auditSummary ? auditSummary.missingFaceDescriptors : "—"}
            </div>
            <div className="text-[11px] text-rose-400/70 mt-0.5">Turnstile recognition disabled</div>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
              Missing Photos
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
              {auditSummary ? auditSummary.missingPhotos : "—"}
            </div>
            <div className="text-[11px] text-amber-400/70 mt-0.5">Profile avatar missing</div>
          </div>

          <div className="p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
            <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
              Guardian Linkage
            </div>
            <div className="text-2xl font-bold font-mono text-cyan-300 mt-1">
              {auditSummary ? auditSummary.missingParentContacts : "—"}
            </div>
            <div className="text-[11px] text-cyan-400/70 mt-0.5">Missing SMS / Email target</div>
          </div>
        </div>

        {/* Split Grid: Left = Jarvis Live Console & Dialogue; Right = Recommendations & Findings */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Chat & Console */}
          <div className="lg:col-span-5 flex flex-col h-[520px] rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono uppercase tracking-widest text-cyan-300">
                  Tactical Voice & Dialogue
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/80">NEURAL INTERFACE</span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 font-sans text-sm">
              {chatHistory.map((item, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    item.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      item.sender === "user"
                        ? "bg-cyan-500 text-slate-950 font-medium rounded-br-none"
                        : "bg-white/10 border border-cyan-500/20 text-slate-200 rounded-bl-none leading-relaxed"
                    }`}
                  >
                    <p className="whitespace-pre-line">{item.text}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 mt-1 px-1">
                    {item.sender === "user" ? "Administrator" : "J.A.R.V.I.S."} • {item.time}
                  </span>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-white/10 bg-white/[0.02]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendCommand();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask Jarvis or issue a system command..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-slate-500 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Dynamic Tabs (Student Audits, Strategic Recommendations, Telemetry) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            {/* Action Bar & View Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
                <button
                  onClick={() => setActiveTab("audits")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "audits"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Registry Audits ({auditSummary?.studentAudits.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab("recommendations")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "recommendations"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Jarvis Solutions ({analysis?.recommendations.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab("telemetry")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "telemetry"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  System Logs ({recentLogs.length})
                </button>
              </div>

              {/* Quick Actions (Auto-Heal & Export) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoHealBiometrics}
                  disabled={isHealing}
                  title="Auto-extract & enroll 128D facial vectors for all students with photos"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono font-medium transition-all cursor-pointer disabled:opacity-50"
                >
                  <Fingerprint className={`w-3.5 h-3.5 ${isHealing ? "animate-spin" : ""}`} />
                  <span>{isHealing ? "Healing..." : "Auto-Heal Biometrics"}</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  title="Export Audit Report as CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>

                <button
                  onClick={handleClearResolved}
                  title="Purge Resolved Audits"
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Healing Progress Banner */}
            {isHealing && healingProgress && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/40 backdrop-blur-md flex items-center justify-between text-xs font-mono text-amber-300 animate-pulse">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 animate-spin text-amber-400" />
                  <span>
                    AUTONOMOUS ENROLLMENT ({healingProgress.current} / {healingProgress.total}): Processing {healingProgress.name}...
                  </span>
                </div>
                <span>{Math.round((healingProgress.current / healingProgress.total) * 100)}%</span>
              </div>
            )}

            {/* Tab 1: Student Audits Table */}
            {activeTab === "audits" && (
              <JarvisAuditTable
                audits={auditSummary?.studentAudits || []}
                onResolve={handleResolveAudit}
                onIgnore={handleIgnoreAudit}
              />
            )}

            {/* Tab 2: Strategic AI Recommendations */}
            {activeTab === "recommendations" && (
              <div className="space-y-3">
                {analysis?.recommendations && analysis.recommendations.length > 0 ? (
                  analysis.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-md hover:border-cyan-500/40 transition-all"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <h4 className="text-sm font-semibold text-cyan-200 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-cyan-400" />
                          {rec.title}
                        </h4>
                        <span
                          className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border ${
                            rec.impact === "high"
                              ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                              : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                          }`}
                        >
                          {rec.impact} Priority
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed mb-3">
                        {rec.description}
                      </p>
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-white/5">
                        <span className="text-cyan-400/80">Category: {rec.category}</span>
                        <span className="uppercase text-slate-300">Action: {rec.action_type}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center rounded-2xl border border-white/10 bg-slate-900/40 text-slate-400">
                    <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-60" />
                    <p className="font-medium text-slate-200">No active recommendations.</p>
                    <p className="text-xs text-slate-500">
                      Click "Initialize Diagnostic Sweep" above to generate AI recommendations.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Telemetry & Error Logs */}
            {activeTab === "telemetry" && (
              <div className="space-y-3">
                {recentLogs.length > 0 ? (
                  recentLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-white/10 bg-slate-900/60 font-mono text-xs text-slate-300 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 uppercase font-semibold">[{log.category}]</span>
                        <span className="text-[10px] text-slate-500">{log.created_at || "Recent"}</span>
                      </div>
                      <div className="text-slate-200">{log.message}</div>
                      <div className="text-[10px] text-slate-500">Source: {log.source}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center rounded-2xl border border-white/10 bg-slate-900/40 text-slate-400">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                    <p className="font-medium text-slate-200">System Telemetry Nominal.</p>
                    <p className="text-xs text-slate-500">No runtime error flags logged.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
