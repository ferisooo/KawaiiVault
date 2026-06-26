import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  FileText,
  AlertTriangle,
  Activity,
  Zap,
  Bug,
  ShieldCheck,
  Clock,
} from "lucide-react";
import CyberButton from "./CyberButton";
import type { ThemeMode } from "../hooks/useThemeMode";
import type {
  DiagEntry,
  DiagCategory,
  DiagSeverity,
} from "../stores/useDiagStore";

interface Props {
  open: boolean;
  onClose: () => void;
  logs: DiagEntry[];
  healthScore: number;
  themeMode?: ThemeMode;
}

const severityColor: Record<DiagSeverity, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const categoryLabel: Record<DiagCategory, string> = {
  crash: "CRASH",
  performance: "PERFORMANCE",
  error: "ERROR",
  warning: "WARNING",
  info: "INFO",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function ReportSection({
  title,
  icon,
  entries,
  color,
}: {
  title: string;
  icon: React.ReactNode;
  entries: DiagEntry[];
  color: string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="mb-4">
      <div
        className={`flex items-center gap-2 mb-2 pb-1 border-b border-[var(--color-cyber-border)]/30`}
      >
        {icon}
        <span
          className={`font-display text-[17px] font-bold tracking-wider uppercase ${color}`}
        >
          {title} ({entries.length})
        </span>
      </div>
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-2 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20 font-mono text-[17px]"
          >
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <span className="text-[var(--color-cyber-muted)] uppercase">
                Timestamp
              </span>
              <span className="text-[var(--color-cyber-text)]">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className="text-[var(--color-cyber-muted)] uppercase">
                Severity
              </span>
              <span className={severityColor[entry.severity]}>
                {entry.severity}
              </span>
              <span className="text-[var(--color-cyber-muted)] uppercase">
                Operation
              </span>
              <span className="text-[var(--color-neon-bright)]">
                {entry.operation}
              </span>
              {entry.duration_ms !== undefined && (
                <>
                  <span className="text-[var(--color-cyber-muted)] uppercase">
                    Duration
                  </span>
                  <span className="text-[var(--color-neon-primary)]">
                    {entry.duration_ms}ms
                  </span>
                </>
              )}
              <span className="text-[var(--color-cyber-muted)] uppercase">
                Message
              </span>
              <span className="text-[var(--color-cyber-text)]">
                {entry.message}
              </span>
              {entry.probable_cause && (
                <>
                  <span className="text-[var(--color-cyber-muted)] uppercase">
                    Probable Cause
                  </span>
                  <span className="text-amber-300">
                    {entry.probable_cause}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DiagReport({
  open,
  onClose,
  logs,
  healthScore,
  themeMode = "cyberpunk",
}: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  const crashes = logs.filter((l) => l.category === "crash");
  const performance = logs.filter((l) => l.category === "performance");
  const errors = logs.filter((l) => l.category === "error");
  const warnings = logs.filter((l) => l.category === "warning");

  const handleExportPDF = () => {
    if (!reportRef.current) return;

    // Build plain-text report for export
    const lines: string[] = [];
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("                   KAWAII VAULT DIAGNOSTIC REPORT");
    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("");
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Health Score: ${healthScore}/100`);
    lines.push(`Total Events: ${logs.length}`);
    lines.push(`  Crashes: ${crashes.length}`);
    lines.push(`  Performance Issues: ${performance.length}`);
    lines.push(`  Errors: ${errors.length}`);
    lines.push(`  Warnings: ${warnings.length}`);
    lines.push("");

    const addSection = (title: string, entries: DiagEntry[]) => {
      if (entries.length === 0) return;
      lines.push("───────────────────────────────────────────────────────────────");
      lines.push(`  ${title} (${entries.length})`);
      lines.push("───────────────────────────────────────────────────────────────");
      entries.forEach((e, i) => {
        lines.push("");
        lines.push(`  [${i + 1}] ${e.message}`);
        lines.push(`      Timestamp:     ${formatTimestamp(e.timestamp)}`);
        lines.push(`      Severity:      ${e.severity}`);
        lines.push(`      Operation:     ${e.operation}`);
        if (e.duration_ms !== undefined) {
          lines.push(`      Duration:      ${e.duration_ms}ms`);
        }
        if (e.probable_cause) {
          lines.push(`      Probable Cause: ${e.probable_cause}`);
        }
      });
      lines.push("");
    };

    addSection("CRASHES", crashes);
    addSection("PERFORMANCE ISSUES", performance);
    addSection("ERRORS", errors);
    addSection("WARNINGS", warnings);

    lines.push("═══════════════════════════════════════════════════════════════");
    lines.push("                       END OF REPORT");
    lines.push("═══════════════════════════════════════════════════════════════");

    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kawaii-vault-diagnostic-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 flex items-center justify-center z-[71] p-4"
          >
            <div className="w-full max-w-2xl max-h-[80vh] flex flex-col bg-gradient-to-b from-[var(--color-cyber-panel)] to-[var(--color-cyber-black)] border border-[var(--color-neon-dark)] rounded-sm shadow-[0_0_30px_var(--color-neon-glow)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-cyber-border)]">
                <h2 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)] flex items-center gap-2">
                  <FileText size={18} className="text-[var(--color-neon-primary)]" />
                  Diagnostic Report
                </h2>
                <div className="flex items-center gap-2">
                  <CyberButton
                    variant="primary"
                    size="sm"
                    themeMode={themeMode}
                    onClick={handleExportPDF}
                  >
                    <Download size={12} />
                    Export
                  </CyberButton>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] rounded-sm transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </div>
              </div>

              {/* Report body */}
              <div
                ref={reportRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                {/* Health Summary */}
                <div className="p-4 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/30">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div
                        className={`font-display text-[17px] font-bold ${
                          healthScore >= 80
                            ? "text-green-400"
                            : healthScore >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {healthScore}
                      </div>
                      <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">
                        Health Score
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      {[
                        {
                          label: "Crashes",
                          count: crashes.length,
                          color: "text-red-400",
                          icon: <Zap size={12} />,
                        },
                        {
                          label: "Performance",
                          count: performance.length,
                          color: "text-amber-400",
                          icon: <Activity size={12} />,
                        },
                        {
                          label: "Errors",
                          count: errors.length,
                          color: "text-orange-400",
                          icon: <Bug size={12} />,
                        },
                        {
                          label: "Warnings",
                          count: warnings.length,
                          color: "text-yellow-400",
                          icon: <AlertTriangle size={12} />,
                        },
                      ].map(({ label, count, color, icon }) => (
                        <div
                          key={label}
                          className="text-center p-2 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20"
                        >
                          <div className={`${color} flex justify-center mb-1`}>
                            {icon}
                          </div>
                          <div className={`font-mono text-[17px] font-bold ${color}`}>
                            {count}
                          </div>
                          <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 font-mono text-[17px] text-[var(--color-cyber-muted)]">
                    <Clock size={9} />
                    Report generated: {new Date().toLocaleString()}
                  </div>
                </div>

                {/* Crash Reports */}
                <ReportSection
                  title="Crashes"
                  icon={<Zap size={14} className="text-red-400" />}
                  entries={crashes}
                  color="text-red-400"
                />

                {/* Performance Issues */}
                <ReportSection
                  title="Performance Issues"
                  icon={<Activity size={14} className="text-amber-400" />}
                  entries={performance}
                  color="text-amber-400"
                />

                {/* Errors */}
                <ReportSection
                  title="Errors"
                  icon={<Bug size={14} className="text-orange-400" />}
                  entries={errors}
                  color="text-orange-400"
                />

                {/* Warnings */}
                <ReportSection
                  title="Warnings"
                  icon={
                    <AlertTriangle size={14} className="text-yellow-400" />
                  }
                  entries={warnings}
                  color="text-yellow-400"
                />

                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldCheck
                      size={48}
                      className="text-green-500/20 mb-3"
                    />
                    <p className="font-display text-[17px] text-green-400 uppercase tracking-wider">
                      All Systems Nominal
                    </p>
                    <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] mt-1">
                      No diagnostic events to report
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-[var(--color-cyber-border)]">
                <CyberButton
                  variant="secondary"
                  themeMode={themeMode}
                  onClick={onClose}
                  className="w-full"
                >
                  Close Report
                </CyberButton>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
