import React, { useState } from "react";
import { JarvisStudentAudit } from "@/integrations/jarvis/supabaseClient";
import {
  CheckCircle2,
  AlertCircle,
  Camera,
  Fingerprint,
  Phone,
  Copy,
  Check,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JarvisAuditTableProps {
  audits: JarvisStudentAudit[];
  onResolve: (auditId: string) => Promise<void>;
  onIgnore: (auditId: string) => Promise<void>;
}

export const JarvisAuditTable: React.FC<JarvisAuditTableProps> = ({
  audits,
  onResolve,
  onIgnore,
}) => {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = audits.filter((a) => {
    if (filter === "all") return true;
    return a.issue_type === filter;
  });

  const getBadge = (type: string) => {
    switch (type) {
      case "missing_descriptor":
        return {
          icon: <Fingerprint className="w-3.5 h-3.5 text-rose-400" />,
          label: "No Biometrics",
          style: "bg-rose-500/15 border-rose-500/30 text-rose-300",
        };
      case "missing_photo":
        return {
          icon: <Camera className="w-3.5 h-3.5 text-amber-400" />,
          label: "Missing Photo",
          style: "bg-amber-500/15 border-amber-500/30 text-amber-300",
        };
      case "missing_parent_contact":
        return {
          icon: <Phone className="w-3.5 h-3.5 text-cyan-400" />,
          label: "No Guardian Contact",
          style: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
        };
      default:
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />,
          label: "Data Incomplete",
          style: "bg-indigo-500/15 border-indigo-500/30 text-indigo-300",
        };
    }
  };

  const handleCopyNotice = (audit: JarvisStudentAudit) => {
    const text = `Presences Notification: Dear Guardian of ${audit.student_name} (${audit.class}-${audit.section}), please update ${
      audit.issue_type === "missing_photo"
        ? "student portrait photo for gate identification."
        : audit.issue_type === "missing_descriptor"
        ? "biometric attendance registration."
        : "guardian contact telephone."
    }`;
    navigator.clipboard.writeText(text);
    toast({
      title: "Notification Copied",
      description: "Guardian notification text copied to clipboard!",
    });
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter Registry Anomalies ({filtered.length})</span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { id: "all", label: "All Anomalies" },
            { id: "missing_descriptor", label: "Biometrics Missing" },
            { id: "missing_photo", label: "Photos Missing" },
            { id: "missing_parent_contact", label: "Parent Contact" },
            { id: "duplicate_identifier", label: "Duplicates" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                filter === tab.id
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 font-medium"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider font-mono text-slate-400 border-b border-white/10">
            <tr>
              <th className="py-3.5 px-4">Student & Class</th>
              <th className="py-3.5 px-4">Anomaly Type</th>
              <th className="py-3.5 px-4">Diagnostic Details</th>
              <th className="py-3.5 px-4">Remedy</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p className="font-medium text-slate-200">No anomalies detected in this category.</p>
                  <p className="text-xs text-slate-500">Registry records are optimal.</p>
                </td>
              </tr>
            ) : (
              filtered.map((item, idx) => {
                const badge = getBadge(item.issue_type);
                return (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-200">{item.student_name}</div>
                      <div className="text-xs font-mono text-cyan-400/80">
                        Class {item.class} {item.section ? `• Sec ${item.section}` : ""}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${badge.style}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs text-xs text-slate-300">
                      {item.details}
                    </td>

                    <td className="py-3.5 px-4 max-w-xs text-xs text-cyan-300 font-mono">
                      {item.suggested_fix || "Review in Admin"}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopyNotice(item)}
                          title="Copy Guardian Notification"
                          className="p-1.5 rounded-lg border border-white/10 hover:border-cyan-500/40 bg-white/5 text-slate-300 hover:text-cyan-300 transition-colors"
                        >
                          {copiedId === (item.student_id || item.details) ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {item.id && (
                          <>
                            <button
                              onClick={() => onResolve(item.id!)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => onIgnore(item.id!)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                            >
                              Ignore
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
