import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
  Bot,
  X,
  AlertTriangle,
  Activity,
  Zap,
  Bug,
  ShieldCheck,
  Cpu,
  HardDrive,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";
import type { ThemeMode } from "../hooks/useThemeMode";
import type {
  DiagEntry,
  DiagCategory,
  DiagSeverity,
  MemorySnapshot,
  VaultIntegrity,
} from "../stores/useDiagStore";

interface Props {
  logs: DiagEntry[];
  unreadCount: number;
  isOpen: boolean;
  healthScore: number;
  memorySnapshots: MemorySnapshot[];
  memoryWarning: boolean;
  memoryAmberPercent?: number;
  vaultIntegrity: VaultIntegrity;
  onOpen: () => void;
  onClose: () => void;
  onClearLogs: () => void;
  onExportReport: () => void;
  themeMode?: ThemeMode;
}

const severityColor: Record<DiagSeverity, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const severityBg: Record<DiagSeverity, string> = {
  critical: "bg-red-500/10 border-red-500/30",
  warning: "bg-amber-500/10 border-amber-500/30",
  info: "bg-blue-500/10 border-blue-500/30",
};

const categoryIcon: Record<DiagCategory, typeof Bug> = {
  crash: Zap,
  performance: Activity,
  error: Bug,
  warning: AlertTriangle,
  info: Bug,
};

const categoryLabel: Record<DiagCategory, string> = {
  crash: "Crash",
  performance: "Performance",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HealthRing({
  score,
  size = 36,
  themeMode = "cyberpunk",
}: {
  score: number;
  size?: number;
  themeMode?: ThemeMode;
}) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? "stroke-green-400"
      : score >= 50
        ? "stroke-amber-400"
        : "stroke-red-400";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="text-[var(--color-cyber-border)]"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={2.5}
        strokeLinecap="round"
        className={color}
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  );
}

function MemoryBar({
  snapshots,
  warning,
  amberPercent = 1.5,
}: {
  snapshots: MemorySnapshot[];
  warning: boolean;
  amberPercent?: number;
}) {
  const latest = snapshots[0];
  if (!latest) return null;

  const barColor = warning
    ? "bg-red-500"
    : latest.percent > amberPercent
      ? "bg-amber-500"
      : "bg-green-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider flex items-center gap-1">
          <Cpu size={10} />
          RAM Usage
        </span>
        <span
          className={`font-mono text-[17px] font-semibold ${warning ? "text-red-400 animate-pulse" : "text-[var(--color-neon-bright)]"}`}
        >
          {latest.usedMB.toFixed(0)} / {latest.totalMB.toFixed(0)} MB (
          {latest.percent.toFixed(1)}%)
        </span>
      </div>
      <div className="h-1.5 bg-[var(--color-cyber-black)] rounded-full overflow-hidden border border-[var(--color-cyber-border)]/30">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${latest.percent}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      {warning && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-mono text-[17px] text-red-400 flex items-center gap-1"
        >
          <AlertTriangle size={9} />
          Memory usage climbing abnormally — potential leak detected
        </motion.p>
      )}
    </div>
  );
}

function VaultIntegritySection({
  integrity,
}: {
  integrity: VaultIntegrity;
}) {
  const statusColor =
    integrity.healthStatus === "healthy"
      ? "text-green-400"
      : integrity.healthStatus === "degraded"
        ? "text-amber-400"
        : "text-[var(--color-cyber-muted)]";
  const statusLabel =
    integrity.healthStatus === "healthy"
      ? "Healthy"
      : integrity.healthStatus === "degraded"
        ? "Degraded"
        : "Unknown";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">
        <HardDrive size={10} />
        Vault Integrity
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="p-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20">
          <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">
            Files
          </div>
          <div className="font-mono text-[17px] text-[var(--color-neon-bright)] font-semibold">
            {integrity.fileCount}
          </div>
        </div>
        <div className="p-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20">
          <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">
            Orphaned
          </div>
          <div
            className={`font-mono text-[17px] font-semibold ${integrity.orphanedBlobs > 0 ? "text-amber-400" : "text-green-400"}`}
          >
            {integrity.orphanedBlobs}
          </div>
        </div>
        <div className="p-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20">
          <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">
            Status
          </div>
          <div className={`font-mono text-[17px] font-semibold ${statusColor}`}>
            {statusLabel}
          </div>
        </div>
        <div className="p-1.5 rounded-sm bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/20">
          <div className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase">
            Last Check
          </div>
          <div className="font-mono text-[17px] text-[var(--color-neon-bright)] font-semibold">
            {integrity.lastHealthCheck
              ? formatTimestamp(integrity.lastHealthCheck)
              : "Never"}
          </div>
        </div>
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: DiagEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = categoryIcon[entry.category];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`p-2 rounded-sm border ${severityBg[entry.severity]} cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <Icon size={12} className={`mt-0.5 flex-shrink-0 ${severityColor[entry.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[17px] font-semibold uppercase ${severityColor[entry.severity]}`}>
              {categoryLabel[entry.category]}
            </span>
            <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
              {formatTimestamp(entry.timestamp)}
            </span>
            {entry.duration_ms !== undefined && (
              <span className="font-mono text-[17px] text-[var(--color-cyber-muted)]">
                {entry.duration_ms}ms
              </span>
            )}
            <span className="ml-auto">
              {expanded ? (
                <ChevronUp size={10} className="text-[var(--color-cyber-muted)]" />
              ) : (
                <ChevronDown size={10} className="text-[var(--color-cyber-muted)]" />
              )}
            </span>
          </div>
          <p className="font-mono text-[17px] text-[var(--color-cyber-text)] mt-0.5 truncate">
            {entry.message}
          </p>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-[var(--color-cyber-border)]/20 space-y-1 font-mono text-[17px]">
              <div className="flex justify-between">
                <span className="text-[var(--color-cyber-muted)] uppercase">Operation</span>
                <span className="text-[var(--color-neon-bright)]">{entry.operation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-cyber-muted)] uppercase">Severity</span>
                <span className={severityColor[entry.severity]}>{entry.severity}</span>
              </div>
              {entry.duration_ms !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-cyber-muted)] uppercase">Duration</span>
                  <span className="text-[var(--color-neon-bright)]">{entry.duration_ms}ms</span>
                </div>
              )}
              {entry.probable_cause && (
                <div className="mt-1 p-1.5 rounded-sm bg-[var(--color-cyber-black)]/60 border border-[var(--color-cyber-border)]/10">
                  <span className="text-[var(--color-cyber-muted)] uppercase block mb-0.5">
                    Probable Cause
                  </span>
                  <span className="text-amber-300">{entry.probable_cause}</span>
                </div>
              )}
              {entry.metrics && Object.keys(entry.metrics).length > 0 && (
                <div className="mt-1 space-y-0.5">
                  <span className="text-[var(--color-cyber-muted)] uppercase">Metrics</span>
                  {Object.entries(entry.metrics).map(([k, v]) => (
                    <div key={k} className="flex justify-between pl-2">
                      <span className="text-[var(--color-cyber-muted)]">{k}</span>
                      <span className="text-[var(--color-neon-primary)]">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DiagBot({
  logs,
  unreadCount,
  isOpen,
  healthScore,
  memorySnapshots,
  memoryWarning,
  memoryAmberPercent = 1.5,
  vaultIntegrity,
  onOpen,
  onClose,
  onClearLogs,
  onExportReport,
  themeMode = "cyberpunk",
}: Props) {
  const isBio = themeMode === "biotech";
  const isCmd = themeMode === "command";
  const isNeon = themeMode === "neoncity";
  const [filter, setFilter] = useState<DiagCategory | "all">("all");
  const [showIntegrity, setShowIntegrity] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const filteredLogs =
    filter === "all" ? logs : logs.filter((l) => l.category === filter);

  const crashCount = logs.filter((l) => l.category === "crash").length;
  const perfCount = logs.filter((l) => l.category === "performance").length;
  const errorCount = logs.filter((l) => l.category === "error").length;
  const warnCount = logs.filter((l) => l.category === "warning").length;

  // Determine robot eye color based on health
  const eyeColor =
    healthScore >= 80
      ? "var(--color-neon-primary)"
      : healthScore >= 50
        ? "#f59e0b"
        : "#ef4444";

  const glowColor =
    healthScore >= 80
      ? "var(--color-neon-glow)"
      : healthScore >= 50
        ? "rgba(245,158,11,0.4)"
        : "rgba(239,68,68,0.4)";

  const robotRadius = isBio ? "rounded-full" : isCmd ? "rounded-[4px]" : isNeon ? "rounded-[2px]" : "rounded-sm";

  return (
    <>
      {/* Floating Robot Button */}
      <motion.div
        className="fixed bottom-16 right-4 z-[60]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.5 }}
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={isOpen ? onClose : onOpen}
          className={`relative w-12 h-12 ${robotRadius} flex items-center justify-center cursor-pointer select-none overflow-visible`}
          style={{
            background: `linear-gradient(135deg, var(--color-cyber-panel), var(--color-cyber-black))`,
            border: `1px solid ${isOpen ? "var(--color-neon-primary)" : "var(--color-cyber-border)"}`,
            boxShadow: isOpen
              ? `0 0 15px ${glowColor}, 0 0 30px ${glowColor}`
              : `0 0 8px ${glowColor}`,
          }}
        >
          {/* Robot face */}
          <div className="relative">
            <Bot size={22} style={{ color: eyeColor }} />
            {/* Animated scan line over robot */}
            <motion.div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{ borderRadius: "inherit" }}
            >
              <motion.div
                className="absolute left-0 right-0 h-[1px]"
                style={{ background: `linear-gradient(90deg, transparent, ${eyeColor}, transparent)` }}
                animate={{ top: ["-10%", "110%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>

          {/* Notification bubble */}
          <AnimatePresence>
            {unreadCount > 0 && !isOpen && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 flex items-center justify-center"
                style={{
                  boxShadow: "0 0 8px rgba(239,68,68,0.6)",
                }}
              >
                <span className="font-mono text-[17px] font-bold text-white leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Health warning pulse ring */}
          {healthScore < 50 && (
            <motion.div
              className="absolute inset-0 rounded-inherit pointer-events-none"
              style={{
                border: "2px solid rgba(239,68,68,0.3)",
                borderRadius: "inherit",
              }}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.button>
      </motion.div>

      {/* DiagBot Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[61] bg-black/30 backdrop-blur-[2px]"
            />

            {/* Panel */}
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed bottom-20 right-4 z-[62] w-[380px] max-h-[70vh] flex flex-col overflow-hidden"
              style={{
                background: `linear-gradient(180deg, var(--color-cyber-panel), var(--color-cyber-black))`,
                border: "1px solid var(--color-neon-dark)",
                borderRadius: isBio ? "12px" : isCmd ? "6px" : isNeon ? "3px" : "2px",
                boxShadow: `0 0 30px ${glowColor}, 0 8px 32px rgba(0,0,0,0.5)`,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b border-[var(--color-cyber-border)]">
                <div className="flex items-center gap-2">
                  <Bot size={16} style={{ color: eyeColor }} />
                  <h3 className="font-display text-[17px] font-bold tracking-wider uppercase text-[var(--color-neon-bright)]">
                    DiagBot
                  </h3>
                  <div className="flex items-center gap-1">
                    <HealthRing
                      score={healthScore}
                      size={20}
                      themeMode={themeMode}
                    />
                    <span
                      className={`font-mono text-[17px] font-semibold ${
                        healthScore >= 80
                          ? "text-green-400"
                          : healthScore >= 50
                            ? "text-amber-400"
                            : "text-red-400"
                      }`}
                    >
                      {healthScore}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onExportReport}
                    className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors"
                    title="Export diagnostic report"
                  >
                    <Download size={14} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClearLogs}
                    className="p-1.5 text-[var(--color-cyber-muted)] hover:text-red-400 transition-colors"
                    title="Clear all logs"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-1.5 text-[var(--color-cyber-muted)] hover:text-[var(--color-neon-bright)] transition-colors"
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Memory Monitor */}
                {memorySnapshots.length > 0 && (
                  <MemoryBar
                    snapshots={memorySnapshots}
                    warning={memoryWarning}
                    amberPercent={memoryAmberPercent}
                  />
                )}

                {/* Vault Integrity */}
                {showIntegrity && (
                  <VaultIntegritySection integrity={vaultIntegrity} />
                )}

                {/* Category filter tabs */}
                <div className="flex gap-1">
                  {(
                    [
                      { key: "all", label: "All", count: logs.length },
                      { key: "crash", label: "Crash", count: crashCount },
                      { key: "performance", label: "Perf", count: perfCount },
                      { key: "error", label: "Error", count: errorCount },
                      { key: "warning", label: "Warn", count: warnCount },
                    ] as const
                  ).map(({ key, label, count }) => (
                    <motion.button
                      key={key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setFilter(key)}
                      className={`flex-1 px-1.5 py-1 rounded-sm font-mono text-[17px] uppercase tracking-wider transition-colors ${
                        filter === key
                          ? "bg-[var(--color-neon-primary)]/15 border border-[var(--color-neon-primary)]/40 text-[var(--color-neon-bright)]"
                          : "bg-[var(--color-cyber-black)]/40 border border-[var(--color-cyber-border)]/30 text-[var(--color-cyber-muted)] hover:text-[var(--color-cyber-text)]"
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className="ml-0.5 opacity-60">({count})</span>
                      )}
                    </motion.button>
                  ))}
                </div>

                {/* Log entries */}
                <div className="space-y-1.5">
                  {filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <ShieldCheck
                        size={32}
                        className="text-green-500/30 mb-2"
                      />
                      <p className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">
                        No issues detected
                      </p>
                      <p className="font-mono text-[17px] text-[var(--color-cyber-muted)]/60 mt-1">
                        DiagBot is monitoring your vault
                      </p>
                    </div>
                  ) : (
                    filteredLogs.slice(0, 50).map((entry) => (
                      <LogEntry key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              </div>

              {/* Footer status */}
              <div className="px-3 py-2 border-t border-[var(--color-cyber-border)] flex items-center justify-between">
                <span className="font-mono text-[17px] text-[var(--color-cyber-muted)] uppercase tracking-wider">
                  {logs.length} events logged
                </span>
                <div className="flex items-center gap-1.5">
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-green-500"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="font-mono text-[17px] text-green-400 uppercase tracking-wider">
                    Monitoring
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
