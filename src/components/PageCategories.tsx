import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import type { PageCategory, NoteItem, DocItem, PasswordItem } from "../stores/useStore";
import type { ThemeMode } from "../hooks/useThemeMode";
import { decryptField, encryptField, isEncrypted, encryptedLength } from "../utils/sessionCrypto";

interface Props {
  categories: PageCategory[];
  pageColor: string;
  onUpdate: (categories: PageCategory[]) => void;
  themeMode?: ThemeMode;
  isPro?: boolean;
}

// Resolve a CSS custom property to its computed hex value (cacheable per render)
const _cssVarCache: Record<string, string> = {};
function cssVar(name: string): string {
  if (_cssVarCache[name]) return _cssVarCache[name];
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  _cssVarCache[name] = v;
  return v;
}
// Invalidate cache when theme changes (called once per render)
function refreshCssVarCache() {
  for (const k of Object.keys(_cssVarCache)) delete _cssVarCache[k];
}

// Theme helpers
const themeRadius = (tm?: ThemeMode) => {
  if (tm === "biotech") return "rounded-lg";
  if (tm === "command" || tm === "solarcore" || tm === "neoncity") return "rounded-[3px]";
  if (tm === "prismatic") return "rounded-md";
  return "rounded-sm";
};

const themeHeaderAnim = (tm?: ThemeMode) => {
  if (tm === "biotech") return "bio-breathe 3s infinite";
  if (tm === "command") return "cmd-pulse 3s infinite";
  if (tm === "neoncity") return "nc-neon-pulse 2s infinite";
  if (tm === "solarcore") return "solar-pulse 3s infinite";
  if (tm === "prismatic") return "prism-pulse 3s infinite";
  return "neon-breathe 3s infinite";
};

const themeFocusAnim = (tm?: ThemeMode) => {
  if (tm === "biotech") return "bio-breathe 2s infinite";
  if (tm === "command") return "cmd-scan 2s infinite";
  if (tm === "neoncity") return "nc-neon-pulse 2s infinite";
  return "border-glow 2s infinite";
};

// ══════════════════════════════════════════════════════════════════
// ── Notes — Full-Page Intelligence Feed ──
// ══════════════════════════════════════════════════════════════════

const NOTE_COLORS = [
  { label: "Default", value: "" },
  { label: "Crimson", value: "#ff2244" },
  { label: "Cyan", value: "#00e5ff" },
  { label: "Green", value: "#00ff41" },
  { label: "Amber", value: "#ffaa00" },
  { label: "Violet", value: "#cc44ff" },
  { label: "Pink", value: "#ff44aa" },
  { label: "Sky", value: "#44aaff" },
];

const NOTE_TEMPLATES = [
  { label: "Meeting Notes", icon: "🗣", title: () => `Meeting — ${new Date().toLocaleDateString()}`, body: "## Attendees\n- \n\n## Agenda\n- \n\n## Action Items\n- \n\n## Notes\n" },
  { label: "Daily Log",     icon: "📅", title: () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }), body: "## Today's Goals\n- \n\n## Progress\n\n## Blockers\n\n## Tomorrow\n- " },
  { label: "Task List",     icon: "✅", title: () => "Tasks", body: "## To Do\n- \n\n## In Progress\n- \n\n## Done\n- " },
  { label: "Bug Report",    icon: "🐛", title: () => "Bug: ", body: "## Description\n\n## Steps to Reproduce\n1. \n2. \n\n## Expected\n\n## Actual\n\n## Environment\n" },
  { label: "Idea",          icon: "💡", title: () => "Idea: ", body: "## Concept\n\n## Why it matters\n\n## How it works\n\n## Next steps\n- " },
  { label: "Research Note", icon: "🔬", title: () => "Research: ", body: "## Topic\n\n## Sources\n- \n\n## Key Findings\n\n## Questions\n- " },
];

type SortMode = "updated" | "created" | "title";

// ── Markdown helpers ──────────────────────────────────────────────

function noteToMarkdown(note: NoteItem): string {
  const lines: string[] = [`# ${note.title}`, ""];
  if (note.noteType) lines.push(`**Category:** ${note.noteType}`);
  if (note.folder)   lines.push(`**Folder:** ${note.folder}`);
  if (note.tags?.length) lines.push(`**Tags:** ${note.tags.join(", ")}`);
  lines.push(`**Created:** ${new Date(note.createdAt).toLocaleString()}`);
  lines.push(`**Updated:** ${new Date(note.updatedAt).toLocaleString()}`);
  if (note.pinned)  lines.push(`**Pinned:** yes`);
  if (note.starred) lines.push(`**Starred:** yes`);
  lines.push("", "---", "", note.body);
  return lines.join("\n");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^[-*] /gm, "• ")
    .trim();
}

// Escape a string for safe inclusion in HTML attributes or text nodes.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow #RGB / #RRGGBB hex colors in style interpolation; anything else
// falls back to a safe default so a crafted accent string can't inject CSS.
function safeAccent(accent: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(accent) ? accent : "#6ee7b7";
}

function inlineMarkdown(text: string, accent: string): string {
  const a = safeAccent(accent);
  return text
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:700">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em style="font-style:italic;opacity:0.85">$1</em>`)
    .replace(/~~(.+?)~~/g, `<del style="opacity:0.45">$1</del>`)
    .replace(/==(.+?)==/g, `<mark style="background:${a}40;color:inherit;padding:0 2px;border-radius:2px">$1</mark>`)
    .replace(/`(.+?)`/g, `<code style="background:rgba(0,0,0,0.35);padding:1px 5px;border-radius:3px;font-size:16px;color:${a}cc">$1</code>`);
}

function renderMarkdown(raw: string, allNotes: NoteItem[], accent: string): string {
  if (!raw) return "";
  const a = safeAccent(accent);
  // Escape HTML first
  let text = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Fenced code blocks (before line splitting)
  text = text.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:rgba(0,0,0,0.32);padding:10px 14px;border-radius:4px;overflow-x:auto;margin:10px 0;border-left:3px solid ${a}40;white-space:pre-wrap"><code style="font-family:monospace;font-size:16px;color:${a}cc">${code.trim()}</code></pre>`
  );

  // Note links [[title]]. Note that `title` here is already HTML-escaped (it came
  // from the escaped `text`), but `linked.title` / `linked.id` come straight
  // from state and must be escaped before landing in an attribute.
  text = text.replace(/\[\[([^\]]+)\]\]/g, (_, title) => {
    const linked = allNotes.find(n => n.title.toLowerCase() === title.trim().toLowerCase());
    if (linked) {
      return `<span data-note-id="${escapeHtml(linked.id)}" style="color:${a};border-bottom:1px solid ${a}60;cursor:pointer;padding:0 2px" title="Open: ${escapeHtml(linked.title)}">${title}</span>`;
    }
    return `<span style="color:${a}40;border-bottom:1px dashed ${a}30;font-style:italic">[[${title}]]</span>`;
  });

  const lines = text.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<div style="font-size:16px;font-weight:700;color:${a}bb;margin:12px 0 3px">${inlineMarkdown(line.slice(4), a)}</div>`);
    } else if (line.startsWith("## ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<div style="font-size:16px;font-weight:700;color:${a};margin:14px 0 4px;border-bottom:1px solid ${a}20;padding-bottom:3px">${inlineMarkdown(line.slice(3), a)}</div>`);
    } else if (line.startsWith("# ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<div style="font-size:16px;font-weight:700;color:${a};margin:16px 0 5px;text-shadow:0 0 18px ${a}35">${inlineMarkdown(line.slice(2), a)}</div>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { out.push(`<ul style="list-style:none;padding-left:4px;margin:4px 0">`); inList = true; }
      out.push(`<li style="padding:1px 0;color:var(--color-cyber-text)"><span style="color:${a}70;margin-right:6px;font-size:16px">▸</span>${inlineMarkdown(line.slice(2), a)}</li>`);
    } else if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<div style="height:6px"></div>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<div style="color:var(--color-cyber-text);margin:1px 0;line-height:1.6">${inlineMarkdown(line, a)}</div>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

// ── PIN / lock helpers ────────────────────────────────────────────

async function hashPin(pin: string): Promise<string> {
  const buf = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function MarkdownPreview({ body, accent, allNotes, onNoteLink, maxLines }: {
  body: string; accent: string; allNotes: NoteItem[];
  onNoteLink: (id: string) => void; maxLines?: number;
}) {
  const html = renderMarkdown(body, allNotes, accent);
  return (
    <div
      style={{
        fontFamily: "monospace", fontSize: "17px", lineHeight: "1.6",
        color: "var(--color-cyber-text)",
        ...(maxLines ? { display: "-webkit-box", WebkitLineClamp: maxLines, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}),
      }}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={e => {
        const noteId = (e.target as HTMLElement).dataset.noteId;
        if (noteId) onNoteLink(noteId);
      }}
    />
  );
}

const FREE_MAX_ITEMS = 10;

function NotesView({ category, pageColor, onUpdate, themeMode, isPro = false }: { category: PageCategory; pageColor: string; onUpdate: (c: PageCategory) => void; themeMode?: ThemeMode; isPro?: boolean }) {
  const rad = themeRadius(themeMode);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newType, setNewType] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [newCatInput, setNewCatInput] = useState("");
  const [newFolderInput, setNewFolderInput] = useState("");
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Code view state
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [codeEditBody, setCodeEditBody] = useState("");
  const [codeEditTitle, setCodeEditTitle] = useState("");
  const [codeEditLang, setCodeEditLang] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [showNewCodeConfirm, setShowNewCodeConfirm] = useState(false);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const codeGutterRef = useRef<HTMLDivElement>(null);
  const [codeWordWrap, setCodeWordWrap] = useState(true);
  // PIN lock state
  const [unlockedNotes, setUnlockedNotes] = useState<Set<string>>(new Set());
  const [pinOverlay, setPinOverlay] = useState<{ noteId: string; mode: "unlock" | "set" | "remove" } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const newTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [pinError, setPinError] = useState("");

  const n = pageColor;

  // Theme-adaptive status colors
  refreshCssVarCache();
  const danger = cssVar("--color-status-danger");
  const success = cssVar("--color-status-success");
  const star = cssVar("--color-status-star");

  // Derived collections
  const allTags = Array.from(new Set(category.notes.flatMap(note => note.tags || []))).sort();
  const allCategories = Array.from(new Set(category.notes.map(note => note.noteType).filter(Boolean) as string[])).sort();
  const allFolders = Array.from(new Set([
    ...category.notes.map(note => note.folder).filter(Boolean) as string[],
    ...extraFolders,
  ])).sort();

  // Filter + sort notes
  const filtered = (() => {
    let notes = category.notes.filter(note => {
      if (activeFilter === "code" && (note.noteType || "").toLowerCase() !== "code") return false;
      if (activeFilter !== "all" && activeFilter !== "code" && (note.noteType || "") !== activeFilter) return false;
      if (activeTag && !(note.tags || []).includes(activeTag)) return false;
      if (activeFolder && (note.folder || "") !== activeFolder) return false;
      if (showStarredOnly && !note.starred) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!note.title.toLowerCase().includes(q) && !note.body.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    notes = [...notes].sort((a, b) => {
      if (sortMode === "title") return a.title.localeCompare(b.title);
      if (sortMode === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // Pinned always first
    const pinned = notes.filter(n => n.pinned);
    const unpinned = notes.filter(n => !n.pinned);
    return [...pinned, ...unpinned];
  })();

  const atFreeLimit = !isPro && category.notes.length >= FREE_MAX_ITEMS;

  const addNote = () => {
    if (!newTitle.trim()) return;
    if (atFreeLimit) return;
    const tags = newTags.split(",").map(t => t.trim()).filter(Boolean);
    const resolvedType = newType.trim() || (activeFilter === "code" ? "code" : undefined);
    const note: NoteItem = {
      id: `note_${Date.now()}`,
      title: newTitle.trim(),
      body: newBody,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: tags.length > 0 ? tags : undefined,
      noteType: resolvedType,
      color: newColor || undefined,
      folder: newFolder.trim() || undefined,
    };
    onUpdate({ ...category, notes: [...category.notes, note] });
    setNewTitle(""); setNewBody(""); setNewTags(""); setNewType(""); setNewColor(""); setNewFolder(""); setShowAdd(false);
    // Auto-open the new snippet in code view
    if (activeFilter === "code") {
      setSelectedCodeId(note.id);
      setCodeEditTitle(note.title);
      setCodeEditBody(note.body);
      setCodeEditLang("");
    }
  };

  const addCategory = () => {
    if (!newCatInput.trim()) return;
    setActiveFilter(newCatInput.trim());
    setNewCatInput("");
  };

  const addFolder = () => {
    const name = newFolderInput.trim();
    if (!name) return;
    setExtraFolders(prev => prev.includes(name) ? prev : [...prev, name]);
    setActiveFolder(name);
    setNewFolderInput("");
    setShowFolderInput(false);
  };

  const updateNote = (id: string, updates: Partial<NoteItem>) => {
    onUpdate({
      ...category,
      notes: category.notes.map(note => note.id === id ? { ...note, ...updates, updatedAt: new Date().toISOString() } : note),
    });
  };

  const togglePin = (e: { stopPropagation: () => void }, id: string) => {
    e.stopPropagation();
    const note = category.notes.find(note => note.id === id);
    if (!note) return;
    updateNote(id, { pinned: !note.pinned });
  };

  const toggleStar = (e: { stopPropagation: () => void }, id: string) => {
    e.stopPropagation();
    const note = category.notes.find(note => note.id === id);
    if (!note) return;
    updateNote(id, { starred: !note.starred });
  };

  const deleteNote = (id: string) => {
    const note = category.notes.find(note => note.id === id);
    if (!note) return;
    const trashed = { ...note, trashedAt: new Date().toISOString() };
    onUpdate({
      ...category,
      notes: category.notes.filter(note => note.id !== id),
      trashedNotes: [...(category.trashedNotes || []), trashed],
    });
    if (expandedNote === id) setExpandedNote(null);
  };

  const restoreNote = (id: string) => {
    const note = (category.trashedNotes || []).find(note => note.id === id);
    if (!note) return;
    const { trashedAt: _, ...restored } = note;
    onUpdate({
      ...category,
      notes: [...category.notes, restored as NoteItem],
      trashedNotes: (category.trashedNotes || []).filter(note => note.id !== id),
    });
  };

  const permanentDeleteNote = (id: string) => {
    onUpdate({ ...category, trashedNotes: (category.trashedNotes || []).filter(note => note.id !== id) });
  };

  const emptyNoteTrash = () => { onUpdate({ ...category, trashedNotes: [] }); };

  const trashCount = (category.trashedNotes || []).length;

  const openNote = (note: NoteItem) => {
    setEditTitle(note.title);
    setEditBody(note.body);
    setEditTags((note.tags || []).join(", "));
    setEditColor(note.color || "");
    setEditFolder(note.folder || "");
    setExpandedNote(note.id);
  };

  const autoSaveNote = useCallback(() => {
    if (!expandedNote) return;
    const tags = editTags.split(",").map(t => t.trim()).filter(Boolean);
    updateNote(expandedNote, {
      title: editTitle,
      body: editBody,
      tags: tags.length > 0 ? tags : undefined,
      color: editColor || undefined,
      folder: editFolder.trim() || undefined,
    } as Partial<NoteItem>);
  }, [expandedNote, editTitle, editBody, editTags, editColor, editFolder, updateNote]);

  const saveExpandedNote = () => {
    autoSaveNote();
    setExpandedNote(null);
  };

  // Auto-save debounced (1s after last edit)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!expandedNote) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => autoSaveNote(), 1000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [expandedNote, editTitle, editBody, editTags, editColor, editFolder, autoSaveNote]);

  const getNoteSize = (note: NoteItem): "shard" | "block" | "large" => {
    const len = note.body.length;
    if (len < 80) return "shard";
    if (len < 300) return "block";
    return "large";
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const accentOf = (note: NoteItem) => note.color || n;

  // ── PIN helpers ──────────────────────────────────────────────────
  const resetPin = () => { setPinInput(""); setPinConfirm(""); setPinError(""); };

  const handleNoteClick = (note: NoteItem) => {
    if (note.locked && !unlockedNotes.has(note.id)) {
      setPinOverlay({ noteId: note.id, mode: "unlock" });
      resetPin();
    } else {
      openNote(note);
    }
  };

  const handlePinSubmit = async () => {
    if (!pinOverlay) return;
    const { noteId, mode } = pinOverlay;
    const note = category.notes.find(note => note.id === noteId);
    if (!note) return;

    if (mode === "unlock") {
      const hash = await hashPin(pinInput);
      if (hash === note.lockHash) {
        setUnlockedNotes(prev => new Set([...prev, noteId]));
        setPinOverlay(null);
        resetPin();
        openNote(note);
      } else {
        setPinError("Incorrect PIN");
        setPinInput("");
      }

    } else if (mode === "set") {
      if (pinInput.length < 4) { setPinError("PIN must be at least 4 characters"); return; }
      if (pinInput !== pinConfirm) { setPinError("PINs do not match"); return; }
      const hash = await hashPin(pinInput);
      updateNote(noteId, { locked: true, lockHash: hash } as Partial<NoteItem>);
      setUnlockedNotes(prev => new Set([...prev, noteId])); // keep unlocked in session
      setPinOverlay(null);
      resetPin();

    } else if (mode === "remove") {
      const hash = await hashPin(pinInput);
      if (hash === note.lockHash) {
        updateNote(noteId, { locked: false, lockHash: undefined } as Partial<NoteItem>);
        setUnlockedNotes(prev => { const next = new Set(prev); next.delete(noteId); return next; });
        setPinOverlay(null);
        resetPin();
      } else {
        setPinError("Incorrect PIN");
        setPinInput("");
      }
    }
  };

  const exportNote = async (note: NoteItem, fmt: "md" | "txt") => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const safeName = note.title.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
      const path = await save({
        defaultPath: `${safeName}.${fmt}`,
        filters: [{ name: fmt === "md" ? "Markdown" : "Text", extensions: [fmt] }],
      });
      if (!path) return;
      const content = fmt === "txt"
        ? [note.title, "", note.body].join("\n")
        : noteToMarkdown(note);
      await writeTextFile(path, content);
    } catch { /* dialog cancelled or unavailable */ }
  };

  const exportAllNotes = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const dir = await open({ directory: true, title: "Choose export folder" }) as string | null;
      if (!dir) return;
      for (const note of category.notes) {
        const safeName = note.title.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase() || `note_${note.id}`;
        await writeTextFile(`${dir}/${safeName}.md`, noteToMarkdown(note));
      }
    } catch { /* dialog cancelled or unavailable */ }
  };

  // Insert text at cursor using execCommand to preserve native undo/redo
  const nativeInsert = (ta: HTMLTextAreaElement, text: string) => {
    ta.focus();
    document.execCommand("insertText", false, text);
  };

  // Sublime-like keyboard handler for the code textarea
  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const { selectionStart: ss, selectionEnd: se, value } = ta;
    const hasSelection = ss !== se;

    // ── Tab / Shift+Tab ───────────────────────────────────────────────────────
    if (e.key === "Tab") {
      e.preventDefault();
      if (hasSelection) {
        // Expand selection to cover full lines
        const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
        const lineEnd = value.indexOf("\n", se);
        const blockEnd = lineEnd === -1 ? value.length : lineEnd;
        const block = value.slice(lineStart, blockEnd);
        const lines = block.split("\n");
        const transformed = e.shiftKey
          ? lines.map(l => l.startsWith("  ") ? l.slice(2) : l.startsWith(" ") ? l.slice(1) : l)
          : lines.map(l => "  " + l);
        const newVal = value.slice(0, lineStart) + transformed.join("\n") + value.slice(blockEnd);
        setCodeEditBody(newVal);
        const addedChars = e.shiftKey
          ? -(lines.reduce((acc, l) => acc + (l.startsWith("  ") ? 2 : l.startsWith(" ") ? 1 : 0), 0))
          : lines.length * 2;
        requestAnimationFrame(() => {
          ta.selectionStart = lineStart;
          ta.selectionEnd = blockEnd + addedChars;
        });
      } else {
        nativeInsert(ta, "  ");
      }
      return;
    }

    // ── Enter: auto-indent ────────────────────────────────────────────────────
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const currentLine = value.slice(lineStart, ss);
      const indent = currentLine.match(/^(\s*)/)?.[1] ?? "";
      // Extra indent after opening brace
      const extraIndent = currentLine.trimEnd().endsWith("{") || currentLine.trimEnd().endsWith("(") || currentLine.trimEnd().endsWith("[") ? "  " : "";
      e.preventDefault();
      nativeInsert(ta, "\n" + indent + extraIndent);
      return;
    }

    // ── Auto-close brackets & quotes ─────────────────────────────────────────
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
    const closers = new Set([")", "]", "}", '"', "'", "`"]);

    if (pairs[e.key]) {
      const close = pairs[e.key];
      if (hasSelection) {
        e.preventDefault();
        const selected = value.slice(ss, se);
        nativeInsert(ta, e.key + selected + close);
        requestAnimationFrame(() => { ta.selectionStart = ss + 1; ta.selectionEnd = se + 1; });
      } else {
        e.preventDefault();
        nativeInsert(ta, e.key + close);
        requestAnimationFrame(() => { ta.selectionStart = ss + 1; ta.selectionEnd = ss + 1; });
      }
      return;
    }

    // Skip over already-typed closing char
    if (closers.has(e.key) && !hasSelection && value[ss] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => { ta.selectionStart = ss + 1; ta.selectionEnd = ss + 1; });
      return;
    }

    // ── Ctrl+/ — comment / uncomment line ────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      const commentPrefixes: Record<string, string> = {
        js: "// ", ts: "// ", tsx: "// ", jsx: "// ", go: "// ", rs: "// ", css: "// ",
        py: "# ", sh: "# ",
        sql: "-- ",
        txt: "// ", md: "// ",
        html: "<!-- ", // handled separately below
        json: "// ",
      };
      const lang = codeEditLang || "txt";
      const prefix = commentPrefixes[lang] ?? "// ";
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const lineEnd = value.indexOf("\n", ss);
      const end = lineEnd === -1 ? value.length : lineEnd;
      const line = value.slice(lineStart, end);
      let newLine: string;
      if (lang === "html") {
        newLine = line.startsWith("<!-- ") && line.endsWith(" -->")
          ? line.slice(5, -4)
          : "<!-- " + line + " -->";
      } else {
        newLine = line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line;
      }
      const delta = newLine.length - line.length;
      const newVal = value.slice(0, lineStart) + newLine + value.slice(end);
      setCodeEditBody(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = Math.max(lineStart, ss + delta);
        ta.selectionEnd = Math.max(lineStart, se + delta);
      });
      return;
    }

    // ── Ctrl+D — duplicate line ───────────────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const lineEnd = value.indexOf("\n", ss);
      const end = lineEnd === -1 ? value.length : lineEnd;
      const line = value.slice(lineStart, end);
      const newVal = value.slice(0, end) + "\n" + line + value.slice(end);
      setCodeEditBody(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ss + line.length + 1;
        ta.selectionEnd = se + line.length + 1;
      });
      return;
    }

    // ── Ctrl+Shift+K — delete line ────────────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "K") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const lineEnd = value.indexOf("\n", ss);
      let newVal: string;
      let newCursor: number;
      if (lineEnd === -1) {
        // Last line — also remove preceding newline if exists
        newVal = lineStart > 0 ? value.slice(0, lineStart - 1) : "";
        newCursor = Math.max(0, lineStart - 1);
      } else {
        newVal = value.slice(0, lineStart) + value.slice(lineEnd + 1);
        newCursor = lineStart;
      }
      setCodeEditBody(newVal);
      requestAnimationFrame(() => { ta.selectionStart = newCursor; ta.selectionEnd = newCursor; });
      return;
    }

    // ── Alt+ArrowUp — move line up ────────────────────────────────────────────
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const lineEnd = value.indexOf("\n", ss);
      const end = lineEnd === -1 ? value.length : lineEnd;
      if (lineStart === 0) return; // already first line
      const prevLineStart = value.lastIndexOf("\n", lineStart - 2) + 1;
      const currentLine = value.slice(lineStart, end);
      const prevLine = value.slice(prevLineStart, lineStart - 1);
      const newVal = value.slice(0, prevLineStart) + currentLine + "\n" + prevLine + value.slice(end);
      setCodeEditBody(newVal);
      const diff = prevLine.length + 1;
      requestAnimationFrame(() => { ta.selectionStart = ss - diff; ta.selectionEnd = se - diff; });
      return;
    }

    // ── Alt+ArrowDown — move line down ────────────────────────────────────────
    if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", ss - 1) + 1;
      const lineEnd = value.indexOf("\n", ss);
      if (lineEnd === -1) return; // already last line
      const nextLineEnd = value.indexOf("\n", lineEnd + 1);
      const end = nextLineEnd === -1 ? value.length : nextLineEnd;
      const currentLine = value.slice(lineStart, lineEnd);
      const nextLine = value.slice(lineEnd + 1, end);
      const newVal = value.slice(0, lineStart) + nextLine + "\n" + currentLine + value.slice(end);
      setCodeEditBody(newVal);
      const diff = nextLine.length + 1;
      requestAnimationFrame(() => { ta.selectionStart = ss + diff; ta.selectionEnd = se + diff; });
      return;
    }
  };

  // Keyboard shortcuts handler for textareas
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, wrapFn: (before: string, after: string, linePrefix?: string) => void) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    const shortcuts: Record<string, () => void> = {
      b: () => wrapFn("**", "**"),
      i: () => wrapFn("*", "*"),
      s: () => wrapFn("~~", "~~"),
      h: () => wrapFn("", "", "# "),
      j: () => wrapFn("", "", "## "),
      k: () => wrapFn("", "", "### "),
      n: () => wrapFn("[[", "]]"),
      "-": () => wrapFn("", "", "- "),
      "'": () => wrapFn("`", "`"),
    };
    if (shortcuts[key]) {
      e.preventDefault();
      shortcuts[key]();
    }
  };

  // Language definitions for code snippets
  const LANGS: { key: string; label: string; color: string }[] = [
    { key: "js",   label: "JS",   color: "#f7df1e" },
    { key: "ts",   label: "TS",   color: "#3178c6" },
    { key: "tsx",  label: "TSX",  color: "#61dafb" },
    { key: "jsx",  label: "JSX",  color: "#61dafb" },
    { key: "py",   label: "PY",   color: "#3572a5" },
    { key: "rs",   label: "RS",   color: "#dea584" },
    { key: "go",   label: "GO",   color: "#00add8" },
    { key: "sh",   label: "SH",   color: "#89e051" },
    { key: "css",  label: "CSS",  color: "#563d7c" },
    { key: "html", label: "HTML", color: "#e34c26" },
    { key: "sql",  label: "SQL",  color: "#e38c00" },
    { key: "json", label: "JSON", color: "#8bc34a" },
    { key: "md",   label: "MD",   color: "#083fa1" },
    { key: "txt",  label: "TXT",  color: "#888888" },
  ];
  const langColor = (lang?: string) => LANGS.find(l => l.key === lang?.toLowerCase())?.color || n;
  const langLabel = (lang?: string) => LANGS.find(l => l.key === lang?.toLowerCase())?.label || (lang?.toUpperCase() || "—");

  const openCodeSnippet = (note: NoteItem) => {
    setSelectedCodeId(note.id);
    setCodeEditTitle(note.title);
    setCodeEditBody(note.body);
    setCodeEditLang(note.language || "");
  };

  const saveCodeSnippet = (id: string) => {
    updateNote(id, { title: codeEditTitle, body: codeEditBody, language: codeEditLang || undefined } as Partial<NoteItem>);
  };

  // Auto-save code snippet (1s debounce)
  const codeAutoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedCodeId) return;
    if (codeAutoSaveRef.current) clearTimeout(codeAutoSaveRef.current);
    codeAutoSaveRef.current = setTimeout(() => saveCodeSnippet(selectedCodeId), 1000);
    return () => { if (codeAutoSaveRef.current) clearTimeout(codeAutoSaveRef.current); };
  }, [selectedCodeId, codeEditTitle, codeEditBody, codeEditLang]);

  const copyCodeToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeEditBody);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch { /* clipboard not available */ }
  };

  const wrapNewSelection = (before: string, after: string = before, linePrefix: string = "") => {
    const ta = newTextareaRef.current;
    if (!ta) return;
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = newBody.slice(start, end);
    if (linePrefix) {
      nativeInsert(ta, linePrefix + selected);
    } else {
      nativeInsert(ta, before + selected + after);
      if (!selected) {
        const cur = start + before.length;
        requestAnimationFrame(() => ta.setSelectionRange(cur, cur));
      }
    }
  };


  return (
    <div className="flex flex-col h-full relative" style={{ backgroundColor: "transparent" }}>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-wrap" style={{ borderColor: `${n}15`, backgroundColor: `${n}04`, animation: undefined }}>

        {activeFilter !== "code" && (<>
          {/* Category tabs */}
          <div className="flex gap-0.5 items-center flex-wrap">
            {(["all", "code", ...allCategories.filter(c => c !== "code")] as string[]).map(cat => (
              <button key={cat} onClick={() => { setActiveFilter(cat); setActiveTag(null); }}
                className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all"
                style={(cat === "all" || cat === "code") ? {
                  color: activeFilter === cat ? n : `${n}80`,
                  backgroundColor: activeFilter === cat ? `${n}18` : `${n}08`,
                  border: `1px solid ${activeFilter === cat ? `${n}50` : `${n}30`}`,
                  fontWeight: 700,
                } : {
                  color: activeFilter === cat ? n : `${n}45`,
                  backgroundColor: activeFilter === cat ? `${n}12` : "transparent",
                  border: `1px solid ${activeFilter === cat ? `${n}35` : "transparent"}`,
                }}>
                {cat === "all" ? "Notes" : cat === "code" ? "Code" : cat}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Help */}
          <button onClick={() => setShowHelp(true)}
            className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}08` }}>
            ? Help
          </button>

          {/* Starred filter */}
          <button onClick={() => setShowStarredOnly(v => !v)} title="Show starred"
            className="font-mono text-[17px] px-2 py-0.5 rounded transition-all"
            style={{
              color: showStarredOnly ? star : `${star}90`,
              border: `1px solid ${showStarredOnly ? `${star}60` : `${star}35`}`,
              backgroundColor: showStarredOnly ? `${star}18` : `${star}08`,
              fontWeight: 700,
            }}>
            ★ Star
          </button>

          {/* Search */}
          <div className="relative">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-transparent font-mono text-[17px] outline-none pl-3 pr-8 py-0.5 rounded w-40"
              style={{ color: "var(--color-cyber-text)", border: `1px solid ${n}40`, caretColor: n, backgroundColor: `${n}06` }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[17px]" style={{ color: `${n}50` }}>✕</button>
            )}
          </div>

          {/* Active tag */}
          {activeTag && (
            <button onClick={() => setActiveTag(null)}
              className="font-mono text-[17px] uppercase px-2 py-0.5 rounded flex items-center gap-1"
              style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}12` }}>
              #{activeTag} <span style={{ color: `${n}60` }}>✕</span>
            </button>
          )}

          {/* Active folder chip */}
          {activeFolder && (
            <button onClick={() => setActiveFolder(null)}
              className="font-mono text-[17px] px-2 py-0.5 rounded flex items-center gap-1"
              style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}12` }}>
              📁 {activeFolder} <span style={{ color: `${n}60` }}>✕</span>
            </button>
          )}

          {/* New note */}
          <button onClick={() => setShowAdd(true)}
            className="font-mono text-[17px] uppercase tracking-wider px-3 py-0.5 rounded transition-all hover:opacity-80"
            style={{ color: n, border: `1px solid ${n}50`, backgroundColor: `${n}08`, boxShadow: `0 0 10px ${n}10` }}>
            + Note
          </button>

          {/* Export All */}
          <button onClick={exportAllNotes}
            className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all hover:opacity-80"
            title={`Export all ${category.notes.length} notes as .md files to a folder`}
            style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}08` }}>
            ↓ All
          </button>

          {/* Trash */}
          <button onClick={() => setShowTrash(!showTrash)}
            className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{
              color: showTrash ? danger : `${danger}90`,
              border: `1px solid ${showTrash ? `${danger}50` : `${danger}30`}`,
              backgroundColor: showTrash ? `${danger}15` : `${danger}08`,
              fontWeight: 600,
            }}>
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </button>
        </>)}

        {activeFilter === "code" && (<>
          <button onClick={() => { setActiveFilter("all"); setActiveTag(null); }}
            className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all"
            style={{ color: `${n}60`, border: `1px solid ${n}20` }}>
            ← Notes
          </button>

          <div className="flex-1" />

          {/* +New Code */}
          <button onClick={() => setShowNewCodeConfirm(true)}
            className="font-mono text-[17px] uppercase tracking-wider px-3 py-0.5 rounded transition-all hover:opacity-80"
            style={{ color: n, border: `1px solid ${n}50`, backgroundColor: `${n}08`, boxShadow: `0 0 10px ${n}10` }}>
            + New Code
          </button>

          {/* Trash */}
          <button onClick={() => setShowTrash(!showTrash)}
            className="font-mono text-[17px] uppercase tracking-wider px-2 py-0.5 rounded transition-all hover:opacity-80"
            style={{
              color: showTrash ? danger : `${danger}90`,
              border: `1px solid ${showTrash ? `${danger}50` : `${danger}30`}`,
              backgroundColor: showTrash ? `${danger}15` : `${danger}08`,
              fontWeight: 600,
            }}>
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </button>
        </>)}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Left: Folders Sidebar (Notes) / Code Spaces Sidebar (Code) ── */}
        <div className="w-36 border-r flex flex-col py-2 gap-0.5 overflow-y-auto" style={{ borderColor: `${n}15`, backgroundColor: `${n}02` }}>
          {activeFilter === "code" ? (<>
            {/* Code spaces list */}
            <button onClick={() => setSelectedCodeId(null)}
              className="w-full text-left px-3 py-1 font-mono text-[17px] rounded mx-1 transition-all"
              style={{
                color: selectedCodeId === null ? n : `${n}55`,
                backgroundColor: selectedCodeId === null ? `${n}12` : "transparent",
              }}>
              All Codes
            </button>
            {filtered.map(note => {
              const lc = langColor(note.language);
              const isSelected = selectedCodeId === note.id;
              return (
                <button key={note.id} onClick={() => openCodeSnippet(note)}
                  className="w-full text-left px-3 py-1.5 font-mono text-[17px] transition-all truncate flex items-center gap-1.5"
                  style={{
                    color: isSelected ? n : `${n}55`,
                    backgroundColor: isSelected ? `${n}12` : "transparent",
                    borderLeft: isSelected ? `2px solid ${n}` : "2px solid transparent",
                  }}>
                  {note.language && (
                    <span style={{ fontSize: "17px", color: lc, border: `1px solid ${lc}40`, padding: "1px 4px", borderRadius: "3px", fontWeight: 700, flexShrink: 0 }}>
                      {langLabel(note.language)}
                    </span>
                  )}
                  <span className="truncate">{note.title || "Untitled"}</span>
                </button>
              );
            })}
          </>) : (<>
            <div className="px-3 py-1 font-mono text-[17px] uppercase tracking-widest font-bold" style={{ color: n, borderBottom: `1px solid ${n}20`, backgroundColor: `${n}08` }}>Folders</div>

            <button onClick={() => setActiveFolder(null)}
              className="w-full text-left px-3 py-1 font-mono text-[17px] rounded mx-1 transition-all"
              style={{
                color: activeFolder === null ? n : `${n}55`,
                backgroundColor: activeFolder === null ? `${n}12` : "transparent",
              }}>
              All Notes
            </button>

            {allFolders.map(folder => (
              <button key={folder} onClick={() => setActiveFolder(activeFolder === folder ? null : folder)}
                className="w-full text-left px-3 py-1 font-mono text-[17px] rounded mx-1 transition-all truncate"
                style={{
                  color: activeFolder === folder ? n : `${n}55`,
                  backgroundColor: activeFolder === folder ? `${n}12` : "transparent",
                }}>
                📁 {folder}
              </button>
            ))}

            {/* Add folder */}
            {showFolderInput ? (
              <div className="px-2 py-1 flex gap-1">
                <input value={newFolderInput} onChange={e => setNewFolderInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addFolder(); if (e.key === "Escape") { setShowFolderInput(false); setNewFolderInput(""); } }}
                  autoFocus placeholder="Folder name"
                  className="flex-1 bg-transparent font-mono text-[17px] outline-none px-1 rounded"
                  style={{ color: n, border: `1px solid ${n}30`, caretColor: n }}
                />
              </div>
            ) : (
              <button onClick={() => setShowFolderInput(true)}
                className="w-full text-left px-3 py-1 font-mono text-[17px] transition-all font-bold"
                style={{ color: n, border: `1px solid ${n}30`, backgroundColor: `${n}08`, borderRadius: "4px" }}>
                + New Folder
              </button>
            )}

          <div className="flex-1" />

          {/* Tag cloud (Notes view only) */}
          {allTags.length > 0 && (
            <>
              <div className="px-3 py-1 font-mono text-[17px] uppercase tracking-widest" style={{ color: `${n}35` }}>Tags</div>
              {allTags.slice(0, 10).map(tag => (
                <button key={tag} onClick={() => { setActiveTag(activeTag === tag ? null : tag); setActiveFilter("all"); }}
                  className="w-full text-left px-3 py-0.5 font-mono text-[17px] truncate transition-all"
                  style={{ color: activeTag === tag ? n : `${n}45` }}>
                  #{tag}
                </button>
              ))}
            </>
          )}
          </>)}
        </div>

        {/* ── Main: Code View or Masonry Feed or Trash ── */}
        <div className={`flex-1 ${activeFilter === "code" && !showTrash ? "flex flex-col min-h-0" : "overflow-y-auto p-4"}`}>
          {activeFilter === "code" && !showTrash ? (
            /* ── Code: full-width editor ── */
            selectedCodeId ? (() => {
              const note = category.notes.find(nn => nn.id === selectedCodeId);
              if (!note) return null;
              const lc = langColor(codeEditLang || note.language);
              return (
                <>
                  {/* Editor header */}
                  <div className="px-4 py-2 border-b flex items-center gap-3 flex-wrap shrink-0"
                    style={{ borderColor: `${n}15`, backgroundColor: `${n}04` }}>
                    <input value={codeEditTitle} onChange={e => setCodeEditTitle(e.target.value)}
                      className="bg-transparent font-mono font-bold outline-none text-[17px] flex-1 min-w-0"
                      style={{ color: "var(--color-cyber-text)", caretColor: n }}
                      placeholder="Code space title..."
                    />
                    {/* Language selector */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {LANGS.map(l => (
                        <button key={l.key}
                          onClick={() => setCodeEditLang(codeEditLang === l.key ? "" : l.key)}
                          className="font-mono rounded transition-all"
                          style={{
                            fontSize: "17px", padding: "2px 6px",
                            color: codeEditLang === l.key ? l.color : `${l.color}50`,
                            border: `1px solid ${codeEditLang === l.key ? `${l.color}60` : `${l.color}20`}`,
                            backgroundColor: codeEditLang === l.key ? `${l.color}18` : "transparent",
                            fontWeight: codeEditLang === l.key ? 700 : 400,
                          }}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                    {/* Copy */}
                    <button onClick={copyCodeToClipboard}
                      className="font-mono text-[17px] uppercase px-2 py-0.5 rounded transition-all hover:opacity-80 shrink-0"
                      style={{
                        color: codeCopied ? success : n,
                        border: `1px solid ${codeCopied ? `${success}50` : `${n}40`}`,
                        backgroundColor: codeCopied ? `${success}12` : `${n}08`,
                      }}>
                      {codeCopied ? "✓ Copied" : "⎘ Copy"}
                    </button>
                    {/* Delete */}
                    <button onClick={() => { deleteNote(selectedCodeId); setSelectedCodeId(null); }}
                      className="font-mono text-[17px] px-2 py-0.5 rounded transition-all hover:opacity-80"
                      style={{ color: `${danger}60`, border: `1px solid ${danger}20` }}>
                      ✕
                    </button>
                  </div>

                  {/* Code textarea — full height, type directly */}
                  <div className="flex-1 min-h-0 relative" style={{ backgroundColor: "var(--color-cyber-black)" }}>
                    <div className="absolute inset-0 flex">
                      <div
                        ref={codeGutterRef}
                        className="shrink-0 w-10 border-r overflow-hidden select-none"
                        style={{ borderColor: `${lc}12`, backgroundColor: `${lc}04`, paddingTop: "12px" }}
                      >
                        {codeEditBody.split("\n").map((_, i) => (
                          <div key={i} style={{
                            height: "20.8px",
                            lineHeight: "20.8px",
                            fontSize: "17px",
                            textAlign: "right",
                            paddingRight: "6px",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            color: `${lc}40`,
                          }}>
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      <div className="flex-1" />
                    </div>
                    <textarea
                      ref={codeTextareaRef}
                      value={codeEditBody}
                      onChange={e => setCodeEditBody(e.target.value)}
                      onKeyDown={handleCodeKeyDown}
                      onScroll={e => {
                        if (codeGutterRef.current)
                          codeGutterRef.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
                      }}
                      spellCheck={false}
                      autoFocus
                      className="absolute inset-0 w-full h-full resize-none outline-none pl-12 pr-4 py-3"
                      style={{
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                        fontSize: "17px",
                        lineHeight: "1.6",
                        color: "var(--color-cyber-text)",
                        caretColor: lc,
                        backgroundColor: "transparent",
                        tabSize: 2,
                        whiteSpace: codeWordWrap ? "pre-wrap" : "pre",
                        overflowX: codeWordWrap ? "hidden" : "auto",
                      }}
                      placeholder={`// ${codeEditTitle || "Code space"} — start typing...`}
                    />
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-1.5 border-t flex items-center gap-4 shrink-0"
                    style={{ borderColor: `${n}10`, backgroundColor: `${n}03` }}>
                    <span className="font-mono" style={{ fontSize: "17px", color: `${n}30` }}>
                      {codeEditBody.split("\n").length} lines
                    </span>
                    <span className="font-mono" style={{ fontSize: "17px", color: `${n}20` }}>
                      {codeEditBody.length} chars
                    </span>
                    <button
                      onClick={() => setCodeWordWrap(w => !w)}
                      className="font-mono transition-all hover:opacity-80"
                      style={{ fontSize: "17px", color: codeWordWrap ? `${lc}80` : `${n}30`, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      title="Toggle word wrap"
                    >
                      {codeWordWrap ? "wrap" : "no wrap"}
                    </button>
                    {codeEditLang && (
                      <span className="font-mono font-bold" style={{ fontSize: "17px", color: lc, marginLeft: "auto" }}>
                        {langLabel(codeEditLang)}
                      </span>
                    )}
                  </div>
                </>
              );
            })() : (
              /* No code space selected — empty typing surface */
              <div className="flex-1 flex items-center justify-center flex-col gap-4" style={{ backgroundColor: "var(--color-cyber-black)" }}>
                <div className="font-mono text-[17px] uppercase tracking-widest" style={{ color: `${n}90` }}>
                  No code space open
                </div>
                <button onClick={() => setShowNewCodeConfirm(true)}
                  className="font-mono text-[17px] uppercase tracking-wider px-4 py-2 rounded transition-all hover:opacity-80"
                  style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}08` }}>
                  + New Code
                </button>
              </div>
            )
          ) : (
          <div className="flex-1 overflow-y-auto p-4">
          {showTrash ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: `${danger}80` }}>
                  Trashed Notes ({trashCount})
                </span>
                {trashCount > 0 && (
                  <button onClick={emptyNoteTrash}
                    className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                    style={{ color: danger, border: `1px solid ${danger}40`, backgroundColor: `${danger}08` }}>
                    Empty Trash
                  </button>
                )}
              </div>
              {trashCount === 0 ? (
                <div className="flex items-center justify-center h-40 font-mono text-[17px]" style={{ color: `${n}20` }}>Trash is empty</div>
              ) : (
                <div className="space-y-2">
                  {(category.trashedNotes || []).map(note => (
                    <div key={note.id} className="flex items-center gap-3 px-4 py-3 rounded-lg"
                      style={{ backgroundColor: "var(--color-cyber-surface)", border: "1px solid var(--color-cyber-border)", opacity: 0.6 }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[17px] line-through truncate" style={{ color: `${n}60` }}>{note.title || "Untitled"}</div>
                        <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-muted)" }}>
                          Trashed {note.trashedAt ? new Date(note.trashedAt).toLocaleDateString() : ""}
                        </div>
                      </div>
                      <button onClick={() => restoreNote(note.id)}
                        className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                        style={{ color: n, border: `1px solid ${n}40`, backgroundColor: `${n}08` }}>Restore</button>
                      <button onClick={() => permanentDeleteNote(note.id)}
                        className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                        style={{ color: danger, border: `1px solid ${danger}30` }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (<>
            {filtered.length === 0 && !showAdd && (
              <div className="flex items-center justify-center h-full font-mono text-[17px]" style={{ color: `${n}20` }}>
                {category.notes.length === 0 ? "No notes yet — add your first one!" : "No notes match your filters"}
              </div>
            )}

            {/* Pinned section label */}
            {filtered.some(note => note.pinned) && (
              <div className="font-mono text-[17px] uppercase tracking-widest mb-2" style={{ color: `${n}40` }}>
                📌 Pinned
              </div>
            )}

            <div style={{ columnCount: 3, columnGap: "12px" }}>
              {/* Note cards */}
              {filtered.map((note, idx) => {
                const accent = accentOf(note);
                const size = getNoteSize(note);
                const isRecent = Date.now() - new Date(note.updatedAt).getTime() < 600000;
                const isLocked = note.locked && !unlockedNotes.has(note.id);

                return (
                  <motion.div key={note.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.25), ease: "easeOut" }}
                    className={`break-inside-avoid mb-3 ${rad} group relative transition-all cursor-pointer`}
                    onClick={() => handleNoteClick(note)}
                    style={{
                      backgroundColor: "var(--color-cyber-surface)",
                      border: `1px solid ${isLocked ? `${accent}50` : note.pinned ? `${accent}60` : "var(--color-cyber-border)"}`,
                      borderLeft: `3px solid ${isLocked ? accent : accent}`,
                      padding: size === "shard" ? "10px 12px" : "14px 16px",
                      boxShadow: isLocked ? `0 0 14px ${accent}22` : note.pinned ? `0 0 12px ${accent}18` : "none",
                    }}>

                    {/* Live pulse (only for unlocked recent notes) */}
                    {isRecent && !isLocked && (
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: success, boxShadow: `0 0 6px ${success}`, animation: "pulse-glow 2s infinite" }} />
                        <span className="font-mono text-[17px] uppercase" style={{ color: `${success}80` }}>LIVE</span>
                      </div>
                    )}

                    {/* Encryption / lock status badge — always visible, top-right */}
                    {!isRecent && (
                      <div className="absolute top-1.5 right-1.5 flex items-center gap-1"
                        title={isLocked ? "PIN-locked — click to enter PIN" : "Vault-protected"}>
                        {isLocked
                          ? <span className="font-mono text-[17px]" style={{ color: accent }}>🔒</span>
                          : <span className="font-mono text-[17px]" style={{ color: `${accent}30` }}>🔐</span>
                        }
                      </div>
                    )}

                    {/* Action buttons (hover) — shown only when unlocked */}
                    {!isLocked && (
                      <div className="absolute top-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        style={{ right: isRecent ? "52px" : "22px" }}>
                        {/* Pin */}
                        <button onClick={e => togglePin(e, note.id)} title={note.pinned ? "Unpin" : "Pin"}
                          className="font-mono text-[17px] px-1 py-0.5 rounded transition-all"
                          style={{ color: note.pinned ? accent : `${accent}50`, backgroundColor: note.pinned ? `${accent}18` : "transparent" }}>
                          📌
                        </button>
                        {/* Star */}
                        <button onClick={e => toggleStar(e, note.id)} title={note.starred ? "Unstar" : "Star"}
                          className="font-mono text-[17px] px-1 py-0.5 rounded transition-all"
                          style={{ color: note.starred ? star : `${accent}40` }}>
                          {note.starred ? "★" : "☆"}
                        </button>
                        {/* Delete */}
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(note.id); }}
                          className="font-mono text-[17px] px-1 py-0.5 rounded"
                          style={{ color: danger }}>
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Always-visible pin/star/lock indicators — top-left */}
                    {(note.pinned || note.starred || note.locked) && (
                      <div className="absolute top-1.5 left-1.5 flex gap-0.5">
                        {note.pinned  && <span className="text-[17px]">📌</span>}
                        {note.starred && <span className="text-[17px]" style={{ color: star }}>★</span>}
                      </div>
                    )}

                    {/* Metadata header */}
                    <div className="flex items-center gap-2 mb-1.5" style={{ paddingLeft: (note.pinned || note.starred) ? "20px" : "0" }}>
                      {note.noteType && (
                        <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded"
                          style={{ color: accent, border: `1px solid ${accent}30`, backgroundColor: `${accent}08` }}>
                          {note.noteType}
                        </span>
                      )}
                      {note.folder && (
                        <span className="font-mono text-[17px] px-1.5 py-0.5 rounded" style={{ color: `${accent}70` }}>
                          📁 {note.folder}
                        </span>
                      )}
                      <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-muted)" }}>
                        {timeAgo(note.updatedAt)}
                      </span>
                    </div>

                    {/* Title */}
                    <div className="font-mono text-[17px] font-bold mb-1" style={{ color: accent }}>{note.title}</div>

                    {/* Body: redacted if locked, code block if code type, or stripped markdown preview */}
                    {isLocked ? (
                      <div className="font-mono text-[17px] mt-1 flex items-center gap-2"
                        style={{ color: `${accent}40`, userSelect: "none" }}>
                        <span style={{ fontSize: "17px" }}>🔒</span>
                        <span>PIN-protected — click to unlock</span>
                      </div>
                    ) : note.noteType === "code" && note.body ? (
                      <div className="mt-1 rounded px-2 py-1.5 overflow-hidden"
                        style={{ backgroundColor: "var(--color-cyber-black)", border: `1px solid ${langColor(note.language)}20` }}>
                        <div style={{
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          fontSize: "17px", lineHeight: "1.5",
                          color: langColor(note.language) + "cc",
                          display: "-webkit-box",
                          WebkitLineClamp: size === "shard" ? 2 : 4,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          whiteSpace: "pre",
                        }}>
                          {note.body}
                        </div>
                      </div>
                    ) : note.body ? (
                      <div className="font-mono text-[17px] leading-relaxed" style={{
                        color: "var(--color-cyber-muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: size === "shard" ? 2 : size === "block" ? 4 : 8,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                        {stripMarkdown(note.body)}
                      </div>
                    ) : null}

                    {/* Tags — only show when unlocked */}
                    {!isLocked && (note.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(note.tags || []).map((tag, ti) => (
                          <button key={tag} onClick={e => { e.stopPropagation(); setActiveTag(tag); setActiveFilter("all"); }}
                            className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                            style={{
                              color: activeTag === tag ? accent : `${accent}60`,
                              border: `1px solid ${activeTag === tag ? `${accent}50` : `${accent}20`}`,
                              backgroundColor: activeTag === tag ? `${accent}15` : `${accent}05`,
                            }}>
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>)}
          </div>
          )}
        </div>

        {/* ── Right: Quick Actions ── */}
        <div className="w-10 border-l flex flex-col items-center py-3 gap-3" style={{ borderColor: `${n}15`, backgroundColor: `${n}03` }}>
          <button onClick={() => !atFreeLimit && setShowAdd(true)} title={atFreeLimit ? `Free plan: max ${FREE_MAX_ITEMS} notes` : "New Note"}
            className={`w-7 h-7 rounded flex items-center justify-center transition-all ${atFreeLimit ? "opacity-30 cursor-not-allowed" : "hover:opacity-80"}`}
            style={{ color: n, border: `1px solid ${n}25`, backgroundColor: `${n}08`, fontSize: "17px" }}>
            {atFreeLimit ? "🔒" : "✎"}
          </button>
          <div className="w-[1px] h-3" style={{ backgroundColor: `${n}15` }} />
          <button onClick={() => { setActiveTag(null); setActiveFilter("all"); setActiveFolder(null); setShowStarredOnly(false); }} title="Clear Filters"
            className="w-7 h-7 rounded flex items-center justify-center transition-all hover:opacity-80"
            style={{ color: `${n}40`, border: `1px solid ${n}15`, fontSize: "17px" }}>
            ⟲
          </button>
        </div>
      </div>

      {/* ── Expanded Note Overlay (normal + fullscreen) ── */}
      {expandedNote && (() => {
        const note = category.notes.find(note => note.id === expandedNote);
        if (!note) return null;
        const accent = accentOf(note);
        const wordCount = editBody.trim() ? editBody.trim().split(/\s+/).length : 0;
        const charCount = editBody.length;
        const closeAndSave = () => { saveExpandedNote(); setFullscreenMode(false); setPreviewMode(false); setEditingBody(false); };
        const wrapSelection = (before: string, after: string = before, linePrefix: string = "") => {
          const ta = textareaRef.current;
          if (!ta) return;
          ta.focus();
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const selected = editBody.slice(start, end);
          if (linePrefix) {
            nativeInsert(ta, linePrefix + selected);
          } else {
            nativeInsert(ta, before + selected + after);
            if (!selected) {
              const cur = start + before.length;
              requestAnimationFrame(() => ta.setSelectionRange(cur, cur));
            }
          }
        };
        const openLinkedNote = (id: string) => {
          saveExpandedNote();
          const linked = category.notes.find(note => note.id === id);
          if (linked) openNote(linked);
        };
        return (
          <div
            onMouseDown={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === "1") (e.currentTarget as HTMLElement).dataset.backdropDown = "1"; }}
            onMouseUp={e => { if ((e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === "1") && (e.currentTarget as HTMLElement).dataset.backdropDown === "1") closeAndSave(); (e.currentTarget as HTMLElement).dataset.backdropDown = ""; }}
            style={{
              position: fullscreenMode ? "fixed" : "absolute",
              inset: 0,
              zIndex: fullscreenMode ? 9999 : 40,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <div className="absolute inset-0" data-backdrop="1" style={{ backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(10px)" }} />

            <div
              style={{
                position: "relative",
                display: "flex", flexDirection: "column",
                backgroundColor: "var(--color-cyber-surface)",
                border: `1px solid ${accent}30`,
                borderLeft: `3px solid ${accent}`,
                boxShadow: `0 0 40px ${accent}15, 0 0 80px ${accent}08`,
                borderRadius: "8px",
                overflow: "hidden",
                width: fullscreenMode ? "100vw" : editingBody ? "min(95vw, 1200px)" : "min(90vw, 720px)",
                height: fullscreenMode ? "100vh" : "min(90vh, 820px)",
              }}>

              {/* ── Header row 1: meta + actions ── */}
              <div className="flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" style={{ borderColor: `${accent}15` }}>
                {note.noteType && (
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded"
                    style={{ color: accent, border: `1px solid ${accent}30`, backgroundColor: `${accent}08` }}>
                    {note.noteType}
                  </span>
                )}
                <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-muted)" }}>
                  {timeAgo(note.updatedAt)}
                </span>

                {/* Pin */}
                <button onClick={e => togglePin(e, note.id)}
                  className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-all"
                  style={{ color: note.pinned ? accent : `${accent}35`, border: `1px solid ${note.pinned ? `${accent}35` : `${accent}12`}`, backgroundColor: note.pinned ? `${accent}12` : "transparent" }}>
                  📌 {note.pinned ? "Pinned" : "Pin"}
                </button>

                {/* Star */}
                <button onClick={e => toggleStar(e, note.id)}
                  className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-all"
                  style={{ color: note.starred ? star : `${accent}35`, border: `1px solid ${note.starred ? `${star}35` : `${accent}12`}`, backgroundColor: note.starred ? `${star}10` : "transparent" }}>
                  {note.starred ? "★ Starred" : "☆ Star"}
                </button>

                {/* Lock */}
                {note.locked ? (
                  <button
                    onClick={() => { setPinOverlay({ noteId: note.id, mode: "remove" }); resetPin(); }}
                    className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-all"
                    title="Remove PIN lock"
                    style={{ color: accent, border: `1px solid ${accent}40`, backgroundColor: `${accent}12` }}>
                    🔒 Locked
                  </button>
                ) : (
                  <button
                    onClick={() => { setPinOverlay({ noteId: note.id, mode: "set" }); resetPin(); }}
                    className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-all"
                    title="Lock this note with a PIN"
                    style={{ color: `${accent}40`, border: `1px solid ${accent}18` }}>
                    🔓 Lock
                  </button>
                )}

                <div className="flex-1" />

                {/* Edit body toggle */}
                <button onClick={() => setEditingBody(v => !v)}
                  className="font-mono text-[17px] uppercase px-2 py-0.5 rounded transition-all"
                  style={{ color: editingBody ? accent : `${accent}50`, border: `1px solid ${editingBody ? `${accent}40` : `${accent}18`}`, backgroundColor: editingBody ? `${accent}10` : "transparent" }}>
                  {editingBody ? "👁 Done" : "✎ Edit"}
                </button>

                {/* Fullscreen toggle */}
                <button onClick={() => setFullscreenMode(v => !v)}
                  className="font-mono text-[17px] px-2 py-0.5 rounded transition-all"
                  title={fullscreenMode ? "Exit fullscreen" : "Fullscreen / focus mode"}
                  style={{ color: fullscreenMode ? accent : `${accent}50`, border: `1px solid ${fullscreenMode ? `${accent}40` : `${accent}18`}` }}>
                  {fullscreenMode ? "⊡" : "⊠"}
                </button>

                {/* Export */}
                <button onClick={() => exportNote(note, "md")}
                  className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                  title="Export as Markdown"
                  style={{ color: `${accent}70`, border: `1px solid ${accent}20` }}>
                  ↓ .md
                </button>
                <button onClick={() => exportNote(note, "txt")}
                  className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                  title="Export as plain text"
                  style={{ color: `${accent}70`, border: `1px solid ${accent}20` }}>
                  ↓ .txt
                </button>

                <button onClick={() => setConfirmDeleteId(note.id)}
                  className="font-mono text-[17px] uppercase px-2 py-0.5 rounded transition-all hover:opacity-80"
                  style={{ color: danger, border: `1px solid ${danger}20` }}>✕ Delete</button>
                <button onClick={closeAndSave}
                  className="font-mono text-[17px] uppercase px-2 py-0.5 rounded transition-all hover:opacity-80"
                  style={{ color: accent, border: `1px solid ${accent}30`, backgroundColor: `${accent}08` }}>Save</button>
              </div>

              {/* ── Content area ── */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 min-h-0">
                {/* Title */}
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-transparent font-mono text-[17px] font-bold outline-none"
                  style={{ color: editColor || accent }}
                />

                {/* Body: side-by-side editor+preview when editing, preview-only otherwise */}
                {editingBody ? (
                  <div className="flex gap-3 flex-1 min-h-0">
                    {/* Left: editor */}
                    <div className="flex-1 flex flex-col gap-1 min-h-0">
                      <textarea
                        ref={textareaRef}
                        autoFocus
                        value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        onKeyDown={e => handleTextareaKeyDown(e, wrapSelection)}
                        className="flex-1 w-full bg-transparent font-mono text-[17px] leading-relaxed outline-none resize-none"
                        style={{ color: "var(--color-cyber-text)", caretColor: accent, minHeight: "200px" }}
                        placeholder="Write your thoughts... supports **bold**, *italic*, # headings, - lists, [[note links]]"
                      />
                      {/* Formatting toolbar */}
                      <div className="flex items-center gap-1 flex-wrap border-t pt-1.5" style={{ borderColor: `${accent}15` }}>
                        {[
                          { label: "B", title: "Bold", action: () => wrapSelection("**", "**"), style: { fontWeight: 700 } },
                          { label: "I", title: "Italic", action: () => wrapSelection("*", "*"), style: { fontStyle: "italic" } },
                          { label: "S", title: "Strikethrough", action: () => wrapSelection("~~", "~~"), style: { textDecoration: "line-through" } },
                          { label: "H", title: "Highlight (==text==)", action: () => wrapSelection("==", "=="), style: { backgroundColor: `${accent}35`, borderRadius: "2px", padding: "0 2px" } },
                          { label: "H1", title: "Heading 1", action: () => wrapSelection("", "", "# ") },
                          { label: "H2", title: "Heading 2", action: () => wrapSelection("", "", "## ") },
                          { label: "H3", title: "Heading 3", action: () => wrapSelection("", "", "### ") },
                          { label: "[[]]", title: "Note Link", action: () => wrapSelection("[[", "]]") },
                          { label: "- ", title: "List item", action: () => wrapSelection("", "", "- ") },
                          { label: "`", title: "Inline code", action: () => wrapSelection("`", "`") },
                        ].map(btn => (
                          <button key={btn.label} title={btn.title} onMouseDown={e => { e.preventDefault(); btn.action(); }}
                            className="font-mono text-[17px] px-2 py-0.5 rounded transition-all hover:opacity-80"
                            style={{ color: accent, border: `1px solid ${accent}25`, backgroundColor: `${accent}08`, ...btn.style }}>
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      {/* Word / char count */}
                      <div className="font-mono text-[17px] text-right" style={{ color: `${accent}30` }}>
                        {wordCount} {wordCount === 1 ? "word" : "words"} · {charCount} chars
                      </div>
                    </div>
                    {/* Right: live preview */}
                    <div className="flex-1 overflow-y-auto px-3 py-2 rounded border"
                      style={{ border: `1px solid ${accent}15`, backgroundColor: `${accent}04`, minHeight: "200px" }}>
                      {editBody.trim() ? (
                        <MarkdownPreview body={editBody} accent={accent} allNotes={category.notes} onNoteLink={openLinkedNote} />
                      ) : (
                        <div className="font-mono text-[17px]" style={{ color: `${accent}20` }}>Preview</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto cursor-text" onClick={() => setEditingBody(true)}
                    title="Click to edit">
                    {editBody ? (
                      <MarkdownPreview
                        body={editBody}
                        accent={accent}
                        allNotes={category.notes}
                        onNoteLink={openLinkedNote}
                      />
                    ) : (
                      <div className="font-mono text-[17px]" style={{ color: `${accent}25` }}>
                        Click to start writing...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Footer: tags, folder, color ── */}
              <div className="px-4 py-2 border-t space-y-1.5" style={{ borderColor: `${accent}15` }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Tags:</span>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)}
                    placeholder="tag1, tag2, ..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none"
                    style={{ color: `${accent}80`, caretColor: accent }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Folder:</span>
                  <input value={editFolder} onChange={e => setEditFolder(e.target.value)}
                    placeholder="folder name..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none"
                    style={{ color: `${accent}80`, caretColor: accent }}
                    list="edit-folders-datalist"
                  />
                  <datalist id="edit-folders-datalist">
                    {allFolders.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Color:</span>
                  {NOTE_COLORS.map(c => (
                    <button key={c.value} onClick={() => setEditColor(c.value)}
                      title={c.label}
                      className="w-4 h-4 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.value || n,
                        borderColor: editColor === c.value ? "white" : "transparent",
                        boxShadow: editColor === c.value ? `0 0 5px ${c.value || n}` : "none",
                      }}
                    />
                  ))}
                </div>
                {/* Encryption status indicator */}
                <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: `${accent}10` }}>
                  {note.locked ? (
                    <>
                      <span className="text-[17px]">🔒</span>
                      <span className="font-mono text-[17px]" style={{ color: `${accent}70` }}>PIN-locked</span>
                      <span className="font-mono text-[17px]" style={{ color: `${accent}35` }}>+</span>
                      <span className="text-[17px]">🔐</span>
                      <span className="font-mono text-[17px]" style={{ color: `${accent}cc` }}>Vault-protected</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[17px]">🔐</span>
                      <span className="font-mono text-[17px]" style={{ color: `${accent}cc` }}>Vault-protected — accessible only while vault is unlocked</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PIN Lock Overlay ── */}
      {pinOverlay && (() => {
        const note = category.notes.find(note => note.id === pinOverlay.noteId);
        if (!note) return null;
        const accent = accentOf(note);
        const isUnlock = pinOverlay.mode === "unlock";
        const isSet    = pinOverlay.mode === "set";
        const dismiss  = () => { setPinOverlay(null); resetPin(); };
        return (
          <div
            style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={dismiss}>
            <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(14px)" }} />
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: "relative", width: "340px",
                backgroundColor: "var(--color-cyber-surface)",
                border: `1px solid ${accent}35`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: "8px",
                padding: "24px 20px",
                display: "flex", flexDirection: "column", gap: "14px",
                boxShadow: `0 0 40px ${accent}18`,
              }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "17px" }}>{isUnlock ? "🔒" : isSet ? "🔓" : "🔓"}</span>
                <div>
                  <div className="font-mono text-[17px] uppercase tracking-widest" style={{ color: `${accent}50` }}>
                    {isUnlock ? "Locked Note" : isSet ? "Set PIN Lock" : "Remove PIN Lock"}
                  </div>
                  <div className="font-mono text-[17px] font-bold truncate" style={{ color: accent, maxWidth: "260px" }}>
                    {note.title}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-muted)" }}>
                {isUnlock
                  ? "Enter your PIN to access this note."
                  : isSet
                  ? "Choose a PIN (min 4 characters). You will need it every session to open this note."
                  : "Enter your current PIN to remove the lock."}
              </div>

              {/* PIN inputs */}
              <input
                type="password"
                value={pinInput}
                onChange={e => { setPinInput(e.target.value); setPinError(""); }}
                onKeyDown={e => {
                  if (e.key === "Enter") { if (isSet && !pinConfirm) { /* move to confirm */ } else handlePinSubmit(); }
                  if (e.key === "Escape") dismiss();
                }}
                placeholder={isSet ? "New PIN..." : "Enter PIN..."}
                autoFocus
                className="w-full bg-transparent font-mono text-[17px] outline-none px-3 py-2 rounded text-center"
                style={{ border: `1px solid ${accent}30`, color: accent, caretColor: accent, letterSpacing: "0.35em" }}
              />

              {isSet && (
                <input
                  type="password"
                  value={pinConfirm}
                  onChange={e => { setPinConfirm(e.target.value); setPinError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handlePinSubmit(); if (e.key === "Escape") dismiss(); }}
                  placeholder="Confirm PIN..."
                  className="w-full bg-transparent font-mono text-[17px] outline-none px-3 py-2 rounded text-center"
                  style={{ border: `1px solid ${accent}30`, color: accent, caretColor: accent, letterSpacing: "0.35em" }}
                />
              )}

              {/* Error */}
              {pinError && (
                <div className="font-mono text-[17px] text-center" style={{ color: danger }}>
                  ⚠ {pinError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handlePinSubmit}
                  className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                  style={{ flex: 1, padding: "7px", color: accent, border: `1px solid ${accent}40`, backgroundColor: `${accent}10`, cursor: "pointer" }}>
                  {isUnlock ? "Unlock" : isSet ? "Set Lock" : "Remove Lock"}
                </button>
                <button onClick={dismiss}
                  className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                  style={{ padding: "7px 14px", color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>

              {/* Encryption note */}
              <div className="font-mono text-[17px] text-center" style={{ color: `${accent}25` }}>
                PIN hashed with SHA-256 · stored locally with vault data
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Delete Confirmation ── */}
      {confirmDeleteId && (() => {
        const note = category.notes.find(note => note.id === confirmDeleteId);
        if (!note) { setConfirmDeleteId(null); return null; }
        const accent = accentOf(note);
        return (
          <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setConfirmDeleteId(null)}>
            <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(8px)" }} />
            <div onClick={e => e.stopPropagation()}
              style={{
                position: "relative", width: "340px", padding: "20px",
                backgroundColor: "var(--color-cyber-surface)",
                border: `1px solid ${accent}30`, borderLeft: `3px solid ${danger}`,
                borderRadius: "8px", display: "flex", flexDirection: "column", gap: "14px",
                boxShadow: `0 0 30px ${danger}25`,
              }}>
              <div className="font-mono text-[17px] uppercase tracking-widest" style={{ color: danger }}>Delete Note</div>
              <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>
                Are you sure you want to trash "<span style={{ color: accent, fontWeight: 700 }}>{note.title}</span>"?
              </div>
              <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>
                You can restore it from the trash later.
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => { deleteNote(confirmDeleteId); setConfirmDeleteId(null); }}
                  className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                  style={{ flex: 1, padding: "7px", color: danger, border: `1px solid ${danger}40`, backgroundColor: `${danger}10`, cursor: "pointer" }}>
                  Delete
                </button>
                <button onClick={() => setConfirmDeleteId(null)}
                  className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                  style={{ padding: "7px 14px", color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Discard New Note Confirmation ── */}
      {showDiscardConfirm && (
        <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowDiscardConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(8px)" }} />
          <div onClick={e => e.stopPropagation()}
            style={{
              position: "relative", width: "340px", padding: "20px",
              backgroundColor: "var(--color-cyber-surface)",
              border: `1px solid ${n}30`, borderLeft: `3px solid ${n}`,
              borderRadius: "8px", display: "flex", flexDirection: "column", gap: "14px",
              boxShadow: `0 0 30px ${n}15`,
            }}>
            <div className="font-mono text-[17px] uppercase tracking-widest" style={{ color: n }}>Unsaved Note</div>
            <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>
              You have unsaved content. What would you like to do?
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setShowDiscardConfirm(false); addNote(); }}
                className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                disabled={!newTitle.trim()}
                style={{ flex: 1, padding: "7px", color: newTitle.trim() ? n : "var(--color-cyber-muted)", border: `1px solid ${newTitle.trim() ? n : "var(--color-cyber-border)"}`, backgroundColor: newTitle.trim() ? `${n}10` : "transparent", cursor: "pointer" }}>
                Save
              </button>
              <button onClick={() => { setShowDiscardConfirm(false); setShowAdd(false); setNewTitle(""); setNewBody(""); setNewTags(""); setNewType(""); setNewColor(""); setNewFolder(""); }}
                className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                style={{ flex: 1, padding: "7px", color: danger, border: `1px solid ${danger}40`, cursor: "pointer" }}>
                Discard
              </button>
              <button onClick={() => setShowDiscardConfirm(false)}
                className="font-mono text-[17px] uppercase rounded transition-all hover:opacity-80"
                style={{ padding: "7px 14px", color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)", cursor: "pointer" }}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Code Confirm ── */}
      {showNewCodeConfirm && (
        <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowNewCodeConfirm(false)}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(8px)" }} />
          <div onClick={e => e.stopPropagation()}
            style={{
              position: "relative", width: "360px", padding: "28px 24px",
              backgroundColor: "var(--color-cyber-surface)",
              border: `1px solid ${n}30`, borderLeft: `3px solid ${n}`,
              borderRadius: "8px", display: "flex", flexDirection: "column", gap: "18px",
              boxShadow: `0 0 40px ${n}15`,
            }}>
            <div>
              <div className="font-mono text-[17px] uppercase tracking-widest font-bold mb-1" style={{ color: n }}>New Code Space</div>
              <div className="font-mono text-[17px]" style={{ color: "var(--color-cyber-muted)" }}>
                Start a new code space?
              </div>
            </div>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newTitle.trim()) {
                  const note: NoteItem = {
                    id: `note_${Date.now()}`,
                    title: newTitle.trim(),
                    body: "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    noteType: "code",
                  };
                  onUpdate({ ...category, notes: [...category.notes, note] });
                  setNewTitle("");
                  setShowNewCodeConfirm(false);
                  setSelectedCodeId(note.id);
                  setCodeEditTitle(note.title);
                  setCodeEditBody("");
                  setCodeEditLang("");
                }
                if (e.key === "Escape") { setShowNewCodeConfirm(false); setNewTitle(""); }
              }}
              placeholder="Name your code space..."
              className="bg-transparent font-mono text-[17px] outline-none px-3 py-2 rounded w-full"
              style={{ color: "var(--color-cyber-text)", border: `1px solid ${n}40`, caretColor: n }}
            />
            <div className="flex gap-3">
              <button onClick={() => { setShowNewCodeConfirm(false); setNewTitle(""); }}
                className="flex-1 font-mono text-[17px] uppercase tracking-wider px-4 py-2 rounded"
                style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                Cancel
              </button>
              <button
                disabled={!newTitle.trim()}
                onClick={() => {
                  if (!newTitle.trim()) return;
                  const note: NoteItem = {
                    id: `note_${Date.now()}`,
                    title: newTitle.trim(),
                    body: "",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    noteType: "code",
                  };
                  onUpdate({ ...category, notes: [...category.notes, note] });
                  setNewTitle("");
                  setShowNewCodeConfirm(false);
                  setSelectedCodeId(note.id);
                  setCodeEditTitle(note.title);
                  setCodeEditBody("");
                  setCodeEditLang("");
                }}
                className="flex-1 font-mono text-[17px] uppercase tracking-wider px-4 py-2 rounded transition-all"
                style={{
                  color: newTitle.trim() ? n : "var(--color-cyber-muted)",
                  border: `1px solid ${newTitle.trim() ? `${n}50` : "var(--color-cyber-border)"}`,
                  backgroundColor: newTitle.trim() ? `${n}14` : "transparent",
                }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Help Overlay ── */}
      {showHelp && (
        <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowHelp(false)}>
          <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(8px)" }} />
          <div onClick={e => e.stopPropagation()}
            style={{
              position: "relative", width: "420px", padding: "24px",
              backgroundColor: "var(--color-cyber-surface)",
              border: `1px solid ${n}30`, borderLeft: `3px solid ${n}`,
              borderRadius: "8px", display: "flex", flexDirection: "column", gap: "16px",
              boxShadow: `0 0 30px ${n}15`,
            }}>
            <div className="flex items-center justify-between">
              <div className="font-mono text-[17px] uppercase tracking-widest font-bold" style={{ color: n }}>Keyboard Shortcuts</div>
              <button onClick={() => setShowHelp(false)} className="font-mono text-[17px] px-2 py-0.5 rounded hover:opacity-80"
                style={{ color: `${n}60`, border: `1px solid ${n}20` }}>✕</button>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { keys: "Ctrl + B", desc: "Bold — wraps text in **asterisks**" },
                { keys: "Ctrl + I", desc: "Italic — wraps text in *asterisks*" },
                { keys: "Ctrl + S", desc: "Strikethrough — wraps in ~~tildes~~" },
                { keys: "Ctrl + H", desc: "Heading 1 — inserts # prefix" },
                { keys: "Ctrl + J", desc: "Heading 2 — inserts ## prefix" },
                { keys: "Ctrl + K", desc: "Heading 3 — inserts ### prefix" },
                { keys: "Ctrl + N", desc: "Note link — inserts [[link]]" },
                { keys: "Ctrl + -", desc: "List item — inserts - prefix" },
                { keys: "Ctrl + '", desc: "Inline code — wraps in `backticks`" },
              ].map(s => (
                <div key={s.keys} className="flex items-center gap-3">
                  <span className="font-mono text-[17px] px-2 py-0.5 rounded shrink-0"
                    style={{ color: n, border: `1px solid ${n}35`, backgroundColor: `${n}12`, minWidth: "100px", textAlign: "center" }}>
                    {s.keys}
                  </span>
                  <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="font-mono text-[17px] text-center" style={{ color: `${n}30` }}>
              Works in both new note and edit mode
            </div>
          </div>
        </div>
      )}

      {/* ── New Note Full Overlay ── */}
      {showAdd && (() => {
        const accent = newColor || n;
        const cancelNew = () => { setShowAdd(false); setNewTitle(""); setNewBody(""); setNewTags(""); setNewType(""); setNewColor(""); setNewFolder(""); };
        return (
          <div
            onMouseDown={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === "1") (e.currentTarget as HTMLElement).dataset.backdropDown = "1"; }}
            onMouseUp={e => { if ((e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === "1") && (e.currentTarget as HTMLElement).dataset.backdropDown === "1") cancelNew(); (e.currentTarget as HTMLElement).dataset.backdropDown = ""; }}
            style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="absolute inset-0" data-backdrop="1" style={{ backgroundColor: "var(--color-cyber-black)", backdropFilter: "blur(10px)" }} />
            <div
              style={{
                position: "relative", display: "flex", flexDirection: "column",
                backgroundColor: "var(--color-cyber-surface)",
                border: `1px solid ${accent}30`, borderLeft: `3px solid ${accent}`,
                boxShadow: `0 0 40px ${accent}15, 0 0 80px ${accent}08`,
                borderRadius: "8px", overflow: "hidden",
                width: "min(90vw, 720px)", height: "min(90vh, 820px)",
              }}>

              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: `${accent}15` }}>
                <span className="font-mono text-[17px] uppercase tracking-widest" style={{ color: `${accent}60` }}>New Note</span>
                <div className="relative">
                  <button onClick={() => setShowTemplates(v => !v)}
                    className="font-mono text-[17px] uppercase px-2 py-0.5 rounded transition-all"
                    style={{ color: showTemplates ? accent : `${accent}50`, border: `1px solid ${showTemplates ? `${accent}40` : `${accent}18`}`, backgroundColor: showTemplates ? `${accent}10` : "transparent" }}>
                    📋 Template
                  </button>
                  {showTemplates && (
                    <div className="absolute left-0 top-full mt-1 z-20 rounded shadow-lg"
                      style={{ backgroundColor: "var(--color-cyber-surface)", border: `1px solid ${accent}30`, minWidth: "170px" }}>
                      {NOTE_TEMPLATES.map(tpl => (
                        <button key={tpl.label}
                          className="w-full text-left flex items-center gap-2 px-3 py-1.5 font-mono text-[17px] transition-all hover:opacity-80"
                          style={{ color: `${accent}cc` }}
                          onClick={() => { setNewTitle(tpl.title()); setNewBody(tpl.body); setShowTemplates(false); }}>
                          <span>{tpl.icon}</span> {tpl.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1" />
                <button onClick={addNote} disabled={!newTitle.trim()}
                  className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                  style={{
                    color: newTitle.trim() ? accent : "var(--color-cyber-muted)",
                    border: `1px solid ${newTitle.trim() ? accent : "var(--color-cyber-border)"}`,
                    backgroundColor: newTitle.trim() ? `${accent}10` : "transparent",
                  }}>Save</button>
                <button onClick={cancelNew}
                  className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                  style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>Cancel</button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="Note title..." autoFocus
                  className="w-full bg-transparent font-mono text-[17px] font-bold outline-none px-2 py-1 rounded"
                  style={{ color: accent, border: `1px solid ${accent}20`, caretColor: accent }}
                  onKeyDown={e => { if (e.key === "Escape") { if (newTitle.trim() || newBody.trim()) setShowDiscardConfirm(true); else cancelNew(); } }}
                />

                {/* Formatting toolbar */}
                <div className="flex items-center gap-1 flex-wrap">
                  {[
                    { label: "B", title: "Bold", action: () => wrapNewSelection("**", "**"), style: { fontWeight: 700 } },
                    { label: "I", title: "Italic", action: () => wrapNewSelection("*", "*"), style: { fontStyle: "italic" } },
                    { label: "S", title: "Strikethrough", action: () => wrapNewSelection("~~", "~~"), style: { textDecoration: "line-through" } },
                    { label: "H1", title: "Heading 1", action: () => wrapNewSelection("", "", "# ") },
                    { label: "H2", title: "Heading 2", action: () => wrapNewSelection("", "", "## ") },
                    { label: "H3", title: "Heading 3", action: () => wrapNewSelection("", "", "### ") },
                    { label: "[[]]", title: "Note Link", action: () => wrapNewSelection("[[", "]]") },
                    { label: "- ", title: "List item", action: () => wrapNewSelection("", "", "- ") },
                    { label: "`", title: "Inline code", action: () => wrapNewSelection("`", "`") },
                  ].map(btn => (
                    <button key={btn.label} title={btn.title} onMouseDown={e => { e.preventDefault(); btn.action(); }}
                      className="font-mono text-[17px] px-2 py-0.5 rounded transition-all hover:opacity-80"
                      style={{ color: `${accent}60`, border: `1px solid ${accent}18`, backgroundColor: `${accent}06`, ...btn.style }}>
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Editor left + Preview right */}
                <div className="flex gap-3 flex-1 min-h-0">
                  <textarea ref={newTextareaRef} value={newBody} onChange={e => setNewBody(e.target.value)}
                    onKeyDown={e => handleTextareaKeyDown(e, wrapNewSelection)}
                    placeholder="Write here..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none resize-none px-3 py-2 rounded"
                    style={{ color: "var(--color-cyber-text)", border: `1px solid ${accent}15`, caretColor: accent, minHeight: "250px" }}
                  />
                  <div className="flex-1 overflow-y-auto px-3 py-2 rounded"
                    style={{ border: `1px solid ${accent}10`, backgroundColor: `${accent}04`, minHeight: "250px" }}>
                    {newBody.trim() ? (
                      <MarkdownPreview body={newBody} accent={accent} allNotes={category.notes} onNoteLink={() => {}} />
                    ) : (
                      <div className="font-mono text-[17px]" style={{ color: `${accent}20` }}>Preview</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer: tags, folder, color */}
              <div className="px-4 py-2 border-t space-y-1.5" style={{ borderColor: `${accent}15` }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Tags:</span>
                  <input value={newTags} onChange={e => setNewTags(e.target.value)}
                    placeholder="tag1, tag2, ..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none"
                    style={{ color: `${accent}80`, caretColor: accent }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Category:</span>
                  <input value={newType} onChange={e => setNewType(e.target.value)}
                    placeholder="optional..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none"
                    style={{ color: `${accent}80`, caretColor: accent }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Folder:</span>
                  <input value={newFolder} onChange={e => setNewFolder(e.target.value)}
                    placeholder="folder name..."
                    className="flex-1 bg-transparent font-mono text-[17px] outline-none"
                    style={{ color: `${accent}80`, caretColor: accent }}
                    list="new-folders-datalist"
                  />
                  <datalist id="new-folders-datalist">
                    {allFolders.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded" style={{ color: accent, border: `1px solid ${accent}35`, backgroundColor: `${accent}12` }}>Color:</span>
                  {NOTE_COLORS.map(c => (
                    <button key={c.value} onClick={() => setNewColor(c.value)}
                      title={c.label}
                      className="w-4 h-4 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.value || n,
                        borderColor: newColor === c.value ? "white" : "transparent",
                        boxShadow: newColor === c.value ? `0 0 5px ${c.value || n}` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Documents ──
// ══════════════════════════════════════════════════════════════════
function DocumentsView({ category, pageColor, onUpdate, themeMode, isPro = false }: { category: PageCategory; pageColor: string; onUpdate: (c: PageCategory) => void; themeMode?: ThemeMode; isPro?: boolean }) {
  const rad = themeRadius(themeMode);
  const accent = pageColor;

  // Theme-adaptive status colors
  refreshCssVarCache();
  const danger = cssVar("--color-status-danger");
  const star = cssVar("--color-status-star");
  const muted = cssVar("--color-cyber-muted");
  const text = cssVar("--color-cyber-text");

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"name" | "date">("date");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ doc: DocItem; content: string; type: "text" | "pdf" | "image" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // new features
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [lockModal, setLockModal] = useState<{ docId: string; mode: "set" | "unlock" | "open" } | null>(null);
  const [lockInput, setLockInput] = useState("");
  const [lockError, setLockError] = useState(false);
  const [shareModal, setShareModal] = useState<{ doc: DocItem; link: string; expires: string } | null>(null);

  const EXTS = [
    "pdf","doc","docx","txt","md","rtf","odt","xls","xlsx","csv","ods",
    "ppt","pptx","odp","epub","mobi","json","xml","yaml","yml","toml",
    "ini","cfg","conf","html","htm","css","js","ts","jsx","tsx","py",
    "rb","go","rs","java","c","cpp","h","log","tex","zip","rar","7z","tar","gz",
  ];
  const TEXT_EXTS = ["txt","md","json","yaml","yml","toml","ini","cfg","conf","csv","log","html","htm","css","js","ts","jsx","tsx","py","rb","go","rs","java","c","cpp","h","xml","tex"];

  const getIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "📕";
    if (["doc","docx","rtf","odt","pages"].includes(ext)) return "📘";
    if (["xls","xlsx","csv","ods","numbers"].includes(ext)) return "📊";
    if (["ppt","pptx","odp","keynote"].includes(ext)) return "📙";
    if (["zip","rar","7z","tar","gz"].includes(ext)) return "📦";
    if (["epub","mobi"].includes(ext)) return "📖";
    if (TEXT_EXTS.includes(ext)) return "📄";
    return "📄";
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const folders = Array.from(new Set([
    ...(category.docFolders || []),
    ...category.documents.map(d => d.folder).filter(Boolean) as string[],
  ])).sort();

  const INLINE_EXTS = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];

  const docs = category.documents
    .filter(d => !d.trashedAt)
    .filter(d => activeFolder === null ? true : d.folder === activeFolder || (!d.folder && activeFolder === "__none"))
    .filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()))
    .filter(d => !showPinnedOnly || d.starred || d.pinned)
    .sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return sortMode === "name" ? a.name.localeCompare(b.name) : new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

  const trashed = (category.trashedDocs || []);

  const docAtFreeLimit = !isPro && category.documents.length >= FREE_MAX_ITEMS;

  const addDocs = async () => {
    if (docAtFreeLimit) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({ multiple: true, filters: [{ name: "Documents", extensions: EXTS }] }) as string | string[] | null;
      if (!sel) return;
      const paths = Array.isArray(sel) ? sel : [sel];
      // Enforce free limit on bulk upload
      const remaining = isPro ? Infinity : FREE_MAX_ITEMS - category.documents.length;
      const limitedPaths = paths.slice(0, remaining);
      const newDocs: DocItem[] = limitedPaths.map(filePath => ({
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        name: filePath.split(/[\\/]/).pop() || filePath,
        filePath,
        addedAt: new Date().toISOString(),
        ...(activeFolder && activeFolder !== "__none" ? { folder: activeFolder } : {}),
      }));
      if (newDocs.length) onUpdate({ ...category, documents: [...category.documents, ...newDocs] });
    } catch { /* dialog unavailable */ }
  };

  const _openDoc = async (doc: DocItem) => {
    onUpdate({ ...category, documents: category.documents.map(d => d.id === doc.id ? { ...d, lastOpenedAt: new Date().toISOString() } : d) });
    const ext = doc.name.split(".").pop()?.toLowerCase() || "";
    if (!doc.filePath) { setViewerDoc({ doc, content: "No file path stored. Re-upload to enable viewing.", type: "text" }); return; }
    if (TEXT_EXTS.includes(ext)) {
      try {
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        setViewerDoc({ doc, content: await readTextFile(doc.filePath), type: "text" });
        return;
      } catch { /* fall through */ }
    }
    if (INLINE_EXTS.includes(ext)) {
      try {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        setViewerDoc({ doc, content: convertFileSrc(doc.filePath), type: ext === "pdf" ? "pdf" : "image" });
        return;
      } catch { /* fall through */ }
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_file_with_default_app", { path: doc.filePath });
    } catch { /* unavailable */ }
  };

  const openDoc = async (doc: DocItem) => {
    if (doc.locked) { setLockModal({ docId: doc.id, mode: "open" }); return; }
    await _openDoc(doc);
  };

  const toggleStar = (doc: DocItem) => {
    onUpdate({ ...category, documents: category.documents.map(d => d.id === doc.id ? { ...d, starred: !d.starred } : d) });
  };

  const commitLock = () => {
    if (!lockModal) return;
    const doc = [...category.documents, ...(category.trashedDocs || [])].find(d => d.id === lockModal.docId);
    if (!doc) return;
    if (lockModal.mode === "set") {
      if (!lockInput.trim()) return;
      onUpdate({ ...category, documents: category.documents.map(d => d.id === lockModal.docId ? { ...d, locked: true, lockHash: lockInput } : d) });
      setLockModal(null); setLockInput(""); setLockError(false);
    } else if (lockModal.mode === "unlock") {
      if (doc.lockHash === lockInput) {
        onUpdate({ ...category, documents: category.documents.map(d => d.id === lockModal.docId ? { ...d, locked: false, lockHash: undefined } : d) });
        setLockModal(null); setLockInput(""); setLockError(false);
      } else { setLockError(true); }
    } else {
      if (doc.lockHash === lockInput) {
        setLockModal(null); setLockInput(""); setLockError(false);
        _openDoc(doc);
      } else { setLockError(true); }
    }
  };

  const generateShareLink = (doc: DocItem) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const token = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setShareModal({ doc, link: `cybervault://share/${doc.id}?token=${token}&exp=${expires.getTime()}`, expires: expires.toLocaleString() });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const bulkDelete = () => {
    const ids = Array.from(selected);
    const toTrash = category.documents.filter(d => ids.includes(d.id)).map(d => ({ ...d, trashedAt: new Date().toISOString() }));
    onUpdate({ ...category, documents: category.documents.filter(d => !ids.includes(d.id)), trashedDocs: [...(category.trashedDocs || []), ...toTrash] });
    setSelected(new Set());
  };

  const bulkMove = (folder: string) => {
    const ids = Array.from(selected);
    onUpdate({ ...category, documents: category.documents.map(d => ids.includes(d.id) ? { ...d, folder: folder === "__none" ? undefined : folder } : d) });
    setSelected(new Set());
  };

  const trashDoc = (id: string) => {
    const doc = category.documents.find(d => d.id === id);
    if (!doc) return;
    onUpdate({
      ...category,
      documents: category.documents.filter(d => d.id !== id),
      trashedDocs: [...trashed, { ...doc, trashedAt: new Date().toISOString() }],
    });
    setConfirmDeleteId(null);
  };

  const restoreDoc = (id: string) => {
    const doc = trashed.find(d => d.id === id);
    if (!doc) return;
    const { trashedAt: _, ...restored } = doc;
    onUpdate({ ...category, documents: [...category.documents, restored as DocItem], trashedDocs: trashed.filter(d => d.id !== id) });
  };

  const permDelete = (id: string) => onUpdate({ ...category, trashedDocs: trashed.filter(d => d.id !== id) });

  const commitRename = (id: string) => {
    if (renameValue.trim()) onUpdate({ ...category, documents: category.documents.map(d => d.id === id ? { ...d, name: renameValue.trim() } : d) });
    setRenamingId(null);
  };

  const addFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    onUpdate({ ...category, docFolders: [...(category.docFolders || []), name] });
    setNewFolderName("");
    setShowNewFolder(false);
    setActiveFolder(name);
  };

  const removeFolder = (folder: string) => {
    onUpdate({
      ...category,
      docFolders: (category.docFolders || []).filter(f => f !== folder),
      documents: category.documents.map(d => d.folder === folder ? { ...d, folder: undefined } : d),
    });
    if (activeFolder === folder) setActiveFolder(null);
  };

  // ── Inline viewer overlay ──
  if (viewerDoc) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-cyber-black)" }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0" style={{ borderColor: `${accent}30` }}>
          <span style={{ fontSize: 17 }}>{getIcon(viewerDoc.doc.name)}</span>
          <span className="font-mono text-[17px] flex-1 truncate" style={{ color: accent }}>{viewerDoc.doc.name}</span>
          <button onClick={() => setViewerDoc(null)} className={`font-mono text-[17px] px-3 py-1 ${rad}`} style={{ color: danger, border: `1px solid ${danger}40` }}>✕ Close</button>
        </div>
        {viewerDoc.type === "pdf" ? (
          <embed src={viewerDoc.content} type="application/pdf" className="flex-1 w-full" style={{ minHeight: 0 }} />
        ) : viewerDoc.type === "image" ? (
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img src={viewerDoc.content} alt={viewerDoc.doc.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
        ) : (
          <pre className="flex-1 overflow-auto p-5 font-mono text-[17px] whitespace-pre-wrap" style={{ color: "var(--color-cyber-text)" }}>
            {viewerDoc.content}
          </pre>
        )}
      </div>
    );
  }

  // ── Lock modal ──
  if (lockModal) {
    const lockDoc = [...category.documents, ...(category.trashedDocs || [])].find(d => d.id === lockModal.docId);
    const title = lockModal.mode === "set" ? "Set lock password" : lockModal.mode === "unlock" ? "Remove lock" : "Enter password to open";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--color-cyber-black)" }}>
        <div className={`flex flex-col gap-4 p-6 ${rad} min-w-72`} style={{ background: "#111", border: `1px solid ${accent}30` }}>
          <div className="font-mono text-[17px]" style={{ color: accent }}>🔒 {title}</div>
          {lockDoc && <div className="font-mono text-[17px] opacity-50 truncate">{lockDoc.name}</div>}
          <input
            autoFocus
            type="password"
            value={lockInput}
            onChange={e => { setLockInput(e.target.value); setLockError(false); }}
            onKeyDown={e => { if (e.key === "Enter") commitLock(); if (e.key === "Escape") { setLockModal(null); setLockInput(""); setLockError(false); } }}
            placeholder="Password"
            className={`bg-transparent font-mono text-[17px] px-3 py-1.5 ${rad} outline-none`}
            style={{ border: `1px solid ${lockError ? danger : accent + "40"}`, color: "var(--color-cyber-text)" }}
          />
          {lockError && <div className="font-mono text-[17px]" style={{ color: danger }}>Wrong password</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setLockModal(null); setLockInput(""); setLockError(false); }} className={`font-mono text-[17px] px-3 py-1 ${rad} opacity-50 hover:opacity-100`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>Cancel</button>
            <button onClick={commitLock} className={`font-mono text-[17px] px-3 py-1 ${rad}`} style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}35` }}>
              {lockModal.mode === "set" ? "Lock" : lockModal.mode === "unlock" ? "Unlock" : "Open"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Share modal ──
  if (shareModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--color-cyber-black)" }}>
        <div className={`flex flex-col gap-4 p-6 ${rad} min-w-96`} style={{ background: "#111", border: `1px solid ${accent}30` }}>
          <div className="font-mono text-[17px]" style={{ color: accent }}>🔗 Share link generated</div>
          <div className="font-mono text-[17px] opacity-50 truncate">{shareModal.doc.name}</div>
          <div className={`font-mono text-[17px] px-3 py-2 ${rad} break-all select-all`} style={{ background: `${accent}0d`, color: accent, border: `1px solid ${accent}25` }}>
            {shareModal.link}
          </div>
          <div className="font-mono text-[17px] opacity-40">Expires: {shareModal.expires}</div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={async () => { try { await navigator.clipboard.writeText(shareModal.link); } catch { /* unavailable */ } }}
              className={`font-mono text-[17px] px-3 py-1 ${rad} opacity-70 hover:opacity-100`}
              style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}
            >Copy</button>
            <button onClick={() => setShareModal(null)} className={`font-mono text-[17px] px-3 py-1 ${rad}`} style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}35` }}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-0">
      {/* ── Sidebar ── */}
      <div className="flex flex-col w-44 shrink-0 border-r py-3 gap-0.5 overflow-y-auto" style={{ borderColor: `${accent}20` }}>
        <button
          onClick={() => setActiveFolder(null)}
          className={`w-full text-left px-3 py-1.5 font-mono text-[17px] ${rad} transition-colors`}
          style={{ background: activeFolder === null ? `${accent}18` : "transparent", color: activeFolder === null ? accent : "var(--color-cyber-muted)" }}
        >
          All Documents
        </button>
        {folders.map(folder => (
          <div key={folder} className="flex items-center group">
            <button
              onClick={() => setActiveFolder(folder)}
              className={`flex-1 text-left px-3 py-1.5 font-mono text-[17px] ${rad} truncate transition-colors`}
              style={{ background: activeFolder === folder ? `${accent}18` : "transparent", color: activeFolder === folder ? accent : "var(--color-cyber-muted)" }}
            >
              📁 {folder}
            </button>
            <button
              onClick={() => removeFolder(folder)}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 pr-2 text-[17px] transition-opacity"
              style={{ color: danger }}
            >✕</button>
          </div>
        ))}
        {showNewFolder ? (
          <div className="flex gap-1 px-2 py-1">
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              placeholder="Folder name"
              className={`flex-1 bg-transparent font-mono text-[17px] px-2 py-0.5 ${rad} outline-none`}
              style={{ border: `1px solid ${accent}40`, color: "var(--color-cyber-text)" }}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className={`w-full text-left px-3 py-1.5 font-mono text-[17px] ${rad} transition-opacity opacity-40 hover:opacity-80`}
            style={{ color: accent }}
          >
            + New folder
          </button>
        )}
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* feature row */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: `${accent}15` }}>
          <button
            onClick={() => setShowPinnedOnly(v => !v)}
            title={showPinnedOnly ? "Show all" : "Show starred only"}
            className={`font-mono text-[17px] px-2 py-0.5 ${rad} transition-opacity`}
            style={{ color: showPinnedOnly ? accent : "var(--color-cyber-muted)", border: `1px solid ${showPinnedOnly ? accent + "50" : "var(--color-cyber-border)"}` }}
          >⭐ Starred</button>
          <button
            onClick={() => selected.size === docs.length ? setSelected(new Set()) : setSelected(new Set(docs.map(d => d.id)))}
            title="Select all / deselect all"
            className={`font-mono text-[17px] px-2 py-0.5 ${rad} transition-opacity`}
            style={{ color: selected.size > 0 ? accent : "var(--color-cyber-muted)", border: `1px solid ${selected.size > 0 ? accent + "50" : "var(--color-cyber-border)"}` }}
          >☑ Bulk</button>
          <button
            onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}
            title={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
            className={`font-mono text-[17px] px-2 py-0.5 ${rad} transition-colors`}
            style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}
          >{viewMode === "grid" ? "≡ List" : "⊞ Grid"}</button>
          <button
            onClick={addDocs}
            title={docAtFreeLimit ? `Free plan: max ${FREE_MAX_ITEMS} documents` : "Upload documents"}
            className={`font-mono text-[17px] px-2 py-0.5 ${rad} transition-colors ${docAtFreeLimit ? "opacity-30 cursor-not-allowed" : ""}`}
            style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}
          >+ Upload</button>
          <button
            onClick={() => setShowTrash(v => !v)}
            className={`font-mono text-[17px] px-2 py-0.5 ${rad} transition-colors`}
            style={{ color: showTrash ? accent : "var(--color-cyber-muted)", border: `1px solid ${showTrash ? accent + "50" : "var(--color-cyber-border)"}` }}
          >🗑 Trash{trashed.length > 0 ? ` (${trashed.length})` : ""}</button>
        </div>
        {/* toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: `${accent}20` }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className={`flex-1 bg-transparent font-mono text-[17px] px-3 py-1 ${rad} outline-none`}
            style={{ border: `1px solid ${accent}30`, color: "var(--color-cyber-text)" }}
          />
          <button
            onClick={() => setSortMode(m => m === "name" ? "date" : "name")}
            className={`font-mono text-[17px] px-2 py-1 ${rad} opacity-60 hover:opacity-100 transition-opacity`}
            style={{ color: accent, border: `1px solid ${accent}25` }}
          >
            {sortMode === "name" ? "A→Z" : "New→Old"}
          </button>
        </div>
        {/* bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0" style={{ borderColor: `${accent}20`, background: `${accent}08` }}>
            <span className="font-mono text-[17px] opacity-60">{selected.size} selected</span>
            <button onClick={bulkDelete} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: danger, border: `1px solid ${danger}30` }}>Delete</button>
            <select
              onChange={e => { if (e.target.value) bulkMove(e.target.value); }}
              defaultValue=""
              className={`bg-transparent font-mono text-[17px] px-2 py-0.5 ${rad} outline-none`}
              style={{ color: accent, border: `1px solid ${accent}30` }}
            >
              <option value="" disabled>Move to…</option>
              <option value="__none">No folder</option>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={() => setSelected(new Set())} className={`font-mono text-[17px] px-2 py-0.5 ${rad} opacity-50 hover:opacity-100`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>Cancel</button>
          </div>
        )}

        {/* content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {showTrash ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[17px] opacity-50">Trash — {trashed.length} item{trashed.length !== 1 ? "s" : ""}</span>
                {trashed.length > 0 && (
                  <button onClick={() => onUpdate({ ...category, trashedDocs: [] })} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: danger, border: `1px solid ${danger}30` }}>
                    Empty trash
                  </button>
                )}
              </div>
              {trashed.length === 0 && <div className="font-mono text-[17px] opacity-30 mt-8 text-center">Trash is empty</div>}
              <div className="grid grid-cols-4 gap-3">
                {trashed.map(doc => (
                  <div key={doc.id} className={`flex flex-col items-center gap-2 p-3 ${rad} group`} style={{ background: "var(--color-neon-subtle)", border: "1px solid var(--color-cyber-border)" }}>
                    <span style={{ fontSize: 17 }}>{getIcon(doc.name)}</span>
                    <span className="font-mono text-[17px] text-center w-full truncate opacity-50">{doc.name}</span>
                    <span className="font-mono text-[17px] opacity-30">{doc.trashedAt ? fmt(doc.trashedAt) : ""}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
                      <button onClick={() => restoreDoc(doc.id)} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: accent, border: `1px solid ${accent}30` }}>Restore</button>
                      <button onClick={() => permDelete(doc.id)} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: danger, border: `1px solid ${danger}30` }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-16 opacity-30">
              <span style={{ fontSize: 17 }}>📄</span>
              <span className="font-mono text-[17px]">{search ? "No documents match" : "No documents yet"}</span>
              {!search && <button onClick={addDocs} className={`font-mono text-[17px] px-3 py-1 ${rad} mt-1`} style={{ color: accent, border: `1px solid ${accent}35`, opacity: 1 }}>+ Upload files</button>}
            </div>
          ) : viewMode === "list" ? (
            /* ── List view ── */
            <div className="flex flex-col gap-1">
              {docs.map(doc => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-3 px-3 py-2 ${rad} group cursor-pointer transition-colors`}
                  style={{ background: selected.has(doc.id) ? `${accent}14` : "var(--color-neon-subtle)", border: `1px solid ${selected.has(doc.id) ? accent + "35" : "var(--color-cyber-border)"}` }}
                  onMouseEnter={e => { if (!selected.has(doc.id)) e.currentTarget.style.background = `${accent}0a`; }}
                  onMouseLeave={e => { if (!selected.has(doc.id)) e.currentTarget.style.background = "var(--color-neon-subtle)"; }}
                  onDoubleClick={() => openDoc(doc)}
                  onClick={() => toggleSelect(doc.id)}
                >
                  <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={e => e.stopPropagation()} className={`w-4 h-4 shrink-0 transition-opacity ${selected.has(doc.id) ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
                  <span style={{ fontSize: 17 }}>{getIcon(doc.name)}</span>
                  {doc.locked && <span style={{ fontSize: 17, opacity: 0.7 }}>🔒</span>}
                  {doc.starred && <span style={{ fontSize: 17 }}>⭐</span>}
                  <div className="flex-1 min-w-0">
                    {renamingId === doc.id ? (
                      <input
                        autoFocus value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(doc.id)}
                        onKeyDown={e => { if (e.key === "Enter") commitRename(doc.id); if (e.key === "Escape") setRenamingId(null); }}
                        onClick={e => e.stopPropagation()}
                        className={`bg-transparent font-mono text-[17px] px-1 outline-none w-full`}
                        style={{ color: "var(--color-cyber-text)", borderBottom: `1px solid ${accent}60` }}
                      />
                    ) : (
                      <span className="font-mono text-[17px] truncate block" style={{ color: "var(--color-cyber-text)" }}>{doc.name}</span>
                    )}
                  </div>
                  <span className="font-mono text-[17px] opacity-30 shrink-0">{fmt(doc.addedAt)}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={e => { e.stopPropagation(); openDoc(doc); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: accent, border: `1px solid ${accent}30` }}>Open</button>
                    <button onClick={e => { e.stopPropagation(); toggleStar(doc); }} title={doc.starred ? "Unstar" : "Star"} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: doc.starred ? star : "var(--color-cyber-muted)", border: `1px solid ${doc.starred ? `${star}40` : "var(--color-cyber-border)"}` }}>⭐</button>
                    <button onClick={e => { e.stopPropagation(); doc.locked ? setLockModal({ docId: doc.id, mode: "unlock" }) : setLockModal({ docId: doc.id, mode: "set" }); }} title={doc.locked ? "Unlock" : "Lock"} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: doc.locked ? accent : "var(--color-cyber-muted)", border: `1px solid ${doc.locked ? accent + "40" : "var(--color-cyber-border)"}` }}>🔒</button>
                    <button onClick={e => { e.stopPropagation(); generateShareLink(doc); }} title="Share link" className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>🔗</button>
                    <button onClick={e => { e.stopPropagation(); setRenamingId(doc.id); setRenameValue(doc.name); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>Rename</button>
                    {confirmDeleteId === doc.id ? (
                      <button onClick={e => { e.stopPropagation(); trashDoc(doc.id); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: danger, border: `1px solid ${danger}40` }}>Confirm?</button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(doc.id); setTimeout(() => setConfirmDeleteId(null), 3000); }} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: `${danger}80`, border: `1px solid ${danger}35` }}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Grid view ── */
            <div className="grid grid-cols-4 gap-3">
              {docs.map((doc, dIdx) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(dIdx * 0.03, 0.2), ease: "easeOut" }}
                  className={`relative flex flex-col items-center gap-2 p-3 ${rad} group cursor-pointer transition-colors`}
                  style={{ background: selected.has(doc.id) ? `${accent}14` : "var(--color-neon-subtle)", border: `1px solid ${selected.has(doc.id) ? accent + "35" : "var(--color-cyber-border)"}` }}
                  onMouseEnter={e => { if (!selected.has(doc.id)) (e.currentTarget as HTMLElement).style.background = `${accent}0d`; }}
                  onMouseLeave={e => { if (!selected.has(doc.id)) (e.currentTarget as HTMLElement).style.background = "var(--color-neon-subtle)"; }}
                  onDoubleClick={() => openDoc(doc)}
                  onClick={() => toggleSelect(doc.id)}
                >
                  <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={e => e.stopPropagation()} className={`absolute top-2 left-2 w-4 h-4 transition-opacity ${selected.has(doc.id) ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
                  <div className="absolute top-2 right-2 flex gap-1">
                    {doc.starred && <span style={{ fontSize: 17 }}>⭐</span>}
                    {doc.locked && <span style={{ fontSize: 17 }}>🔒</span>}
                  </div>
                  <span style={{ fontSize: 17 }}>{getIcon(doc.name)}</span>
                  <div className="w-full min-w-0 flex flex-col items-center gap-0.5">
                    {renamingId === doc.id ? (
                      <input
                        autoFocus value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(doc.id)}
                        onKeyDown={e => { if (e.key === "Enter") commitRename(doc.id); if (e.key === "Escape") setRenamingId(null); }}
                        onClick={e => e.stopPropagation()}
                        className={`bg-transparent font-mono text-[17px] px-1 outline-none w-full text-center`}
                        style={{ color: "var(--color-cyber-text)", borderBottom: `1px solid ${accent}60` }}
                      />
                    ) : (
                      <div className="font-mono text-[17px] truncate w-full text-center" style={{ color: "var(--color-cyber-text)" }}>{doc.name}</div>
                    )}
                    <div className="font-mono text-[17px] opacity-35">{fmt(doc.addedAt)}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-auto flex-wrap justify-center">
                    <button onClick={e => { e.stopPropagation(); openDoc(doc); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: accent, border: `1px solid ${accent}30` }}>Open</button>
                    <button onClick={e => { e.stopPropagation(); toggleStar(doc); }} title={doc.starred ? "Unstar" : "Star"} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: doc.starred ? star : "var(--color-cyber-muted)", border: `1px solid ${doc.starred ? `${star}40` : "var(--color-cyber-border)"}` }}>⭐</button>
                    <button onClick={e => { e.stopPropagation(); doc.locked ? setLockModal({ docId: doc.id, mode: "unlock" }) : setLockModal({ docId: doc.id, mode: "set" }); }} title={doc.locked ? "Unlock" : "Lock"} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: doc.locked ? accent : "var(--color-cyber-muted)", border: `1px solid ${doc.locked ? accent + "40" : "var(--color-cyber-border)"}` }}>🔒</button>
                    <button onClick={e => { e.stopPropagation(); generateShareLink(doc); }} title="Share link" className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>🔗</button>
                    <button onClick={e => { e.stopPropagation(); setRenamingId(doc.id); setRenameValue(doc.name); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>Rename</button>
                    {confirmDeleteId === doc.id ? (
                      <button onClick={e => { e.stopPropagation(); trashDoc(doc.id); }} className={`font-mono text-[17px] px-2 py-0.5 ${rad}`} style={{ color: danger, border: `1px solid ${danger}40` }}>Confirm?</button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(doc.id); setTimeout(() => setConfirmDeleteId(null), 3000); }} className={`font-mono text-[17px] px-1.5 py-0.5 ${rad}`} style={{ color: `${danger}80`, border: `1px solid ${danger}35` }}>✕</button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════
// ── Passwords / Logins — Full-Page Cyberpunk Vault ──
// ══════════════════════════════════════════════════════════════════
function PasswordsView({ category, pageColor, onUpdate, themeMode, isPro = false }: { category: PageCategory; pageColor: string; onUpdate: (c: PageCategory) => void; themeMode?: ThemeMode; isPro?: boolean }) {
  const rad = themeRadius(themeMode);
  const [showAdd, setShowAdd] = useState(false);
  const [decrypting, setDecrypting] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealText, setRevealText] = useState<Record<string, string>>({});
  const [flashCard, setFlashCard] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [hoveredPw, setHoveredPw] = useState<string | null>(null);
  const [hoverRevealIdx, setHoverRevealIdx] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ service: "", url: "", username: "", password: "", notes: "" });
  const [showPwGen, setShowPwGen] = useState(false);
  const [showNameGen, setShowNameGen] = useState(false);
  const [pwGenLength, setPwGenLength] = useState(16);
  const [pwGenSymbols, setPwGenSymbols] = useState(true);
  const [pwGenNumbers, setPwGenNumbers] = useState(true);
  const [pwGenUppercase, setPwGenUppercase] = useState(true);
  const [activeTab, setActiveTab] = useState<"passwords" | "totp" | "breaches">("passwords");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ service: "", url: "", username: "", password: "", notes: "", totpSecret: "" });
  const [totpCodes, setTotpCodes] = useState<Record<string, string>>({});
  const [totpCountdown, setTotpCountdown] = useState(30);
  const [breachResults, setBreachResults] = useState<Record<string, { count: number | null; loading: boolean; checked: boolean }>>({});
  const [showHelp, setShowHelp] = useState(false);

  const neon = pageColor;

  // Theme-adaptive status colors
  refreshCssVarCache();
  const danger = cssVar("--color-status-danger");
  const success = cssVar("--color-status-success");
  const warning = cssVar("--color-status-warning");
  const star = cssVar("--color-status-star");

  // Symbols universally accepted by virtually all websites.
  // Excluded: backticks ` ' " { } [ ] \ | < > ; : space and non-ASCII
  // These are commonly rejected due to SQL/injection concerns, encoding issues, or legacy systems.
  const SAFE_SYMBOLS = "!@#$%^&*()-_=+,.?/~";

  const generatePassword = () => {
    let chars = "abcdefghijklmnopqrstuvwxyz";
    if (pwGenUppercase) chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (pwGenNumbers) chars += "0123456789";
    if (pwGenSymbols) chars += SAFE_SYMBOLS;
    let pw = "";
    for (let i = 0; i < pwGenLength; i++) {
      pw += chars[Math.floor(Math.random() * chars.length)];
    }
    setForm(f => ({ ...f, password: pw }));
    setShowPwGen(false);
  };

  const [nameGenLength, setNameGenLength] = useState<"short" | "medium" | "long">("medium");

  const generateUsername = () => {
    const shortAdj = ["neo", "hex", "arc", "bit", "zen", "ash", "ion", "orb", "vex", "zap"];
    const shortNouns = ["fox", "owl", "bot", "bug", "cat", "ram", "eel", "bat", "ray", "pix"];
    const medAdj = ["cyber", "ghost", "pixel", "neon", "shadow", "void", "flux", "zero", "chrome", "synth", "rogue", "dark"];
    const medNouns = ["wolf", "hawk", "blade", "storm", "byte", "node", "pulse", "spark", "wave", "core", "vault", "raven"];
    const longAdj = ["quantum", "phantom", "encrypted", "digital", "override", "spectral", "obsidian", "terminal", "hologram", "protocol"];
    const longNouns = ["sentinel", "architect", "drifter", "operator", "catalyst", "guardian", "engineer", "navigator", "breaker", "voyager"];

    const adjectives = nameGenLength === "short" ? shortAdj : nameGenLength === "long" ? longAdj : medAdj;
    const nouns = nameGenLength === "short" ? shortNouns : nameGenLength === "long" ? longNouns : medNouns;
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = nameGenLength === "short" ? Math.floor(Math.random() * 99) : Math.floor(Math.random() * 999);
    setForm(f => ({ ...f, username: `${adj}_${noun}${num}` }));
    setShowNameGen(false);
  };

  // Cache decrypted strength results so we don't show "unknown" for encrypted passwords
  const [strengthCache, setStrengthCache] = useState<Record<string, { label: string; color: string; pct: number }>>({});

  const computeStrength = (pw: string): { label: string; color: string; pct: number } => {
    const hasNum = /\d/.test(pw);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasLower = /[a-z]/.test(pw);
    let score = 0;
    if (pw.length >= 8) score += 20;
    if (pw.length >= 12) score += 15;
    if (pw.length >= 16) score += 10;
    if (hasUpper && hasLower) score += 15;
    if (hasNum) score += 15;
    if (hasSpecial) score += 25;
    score = Math.min(score, 100);
    if (score >= 70) return { label: "STRONG", color: success, pct: score };
    if (score >= 40) return { label: "MEDIUM", color: warning, pct: score };
    return { label: "WEAK", color: danger, pct: score };
  };

  const getStrength = (pw: string, id?: string): { label: string; color: string; pct: number } => {
    if (isEncrypted(pw)) {
      // Return cached strength if available, otherwise "unknown" until async decryption
      if (id && strengthCache[id]) return strengthCache[id];
      return { label: "···", color: "#888888", pct: 50 };
    }
    return computeStrength(pw);
  };

  // Async-decrypt and cache strength for all encrypted passwords on mount / password change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, { label: string; color: string; pct: number }> = {};
      for (const pw of category.passwords) {
        if (isEncrypted(pw.password)) {
          try {
            const plain = await decryptField(pw.password);
            updates[pw.id] = computeStrength(plain);
          } catch { /* ignore */ }
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setStrengthCache(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [category.passwords]);

  // Unique service names for sidebar filter
  const serviceNames = Array.from(new Set(category.passwords.map(p => p.service))).sort();
  const filtered = sectorFilter
    ? category.passwords.filter(p => p.service === sectorFilter)
    : category.passwords;

  const weakCount = category.passwords.filter(p => getStrength(p.password, p.id).label === "WEAK").length;
  const strongCount = category.passwords.filter(p => getStrength(p.password, p.id).label === "STRONG").length;
  const healthPct = category.passwords.length > 0 ? Math.round((strongCount / category.passwords.length) * 100) : 100;

  const glitchChars = "█░▓▒▐▌╬╫▀▄";
  const glitchMask = (len: number) =>
    Array.from({ length: Math.min(len, 14) }, () => glitchChars[Math.floor(Math.random() * glitchChars.length)]).join("");

  // ── Password age ──
  const getPasswordAge = (pw: PasswordItem) => {
    const ref = pw.updatedAt || pw.createdAt;
    const days = Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
    const warn = days > 90;
    const label = days === 0 ? "Today" : days === 1 ? "1d ago" : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}yr ago`;
    return { days, label, warn };
  };

  // ── TOTP (RFC 6238) using Web Crypto ──
  const base32Decode = (input: string): Uint8Array => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const cleaned = input.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
    let bits = 0, value = 0;
    const output: number[] = [];
    for (const c of cleaned) {
      const idx = alphabet.indexOf(c);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { output.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return new Uint8Array(output);
  };

  const generateTOTP = async (secret: string): Promise<string> => {
    const keyBytes = base32Decode(secret);
    const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;
    const key = await crypto.subtle.importKey("raw", keyBuf, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setUint32(4, counter >>> 0, false);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
    const offset = sig[19] & 0xf;
    const code = ((sig[offset] & 0x7f) << 24 | sig[offset + 1] << 16 | sig[offset + 2] << 8 | sig[offset + 3]) % 1_000_000;
    return code.toString().padStart(6, "0");
  };

  // ── HaveIBeenPwned k-anonymity breach check ──
  const checkHIBP = async (pwId: string, password: string) => {
    setBreachResults(prev => ({ ...prev, [pwId]: { count: null, loading: true, checked: false } }));
    try {
      const plainPw = await decryptField(password);
      const data = new TextEncoder().encode(plainPw);
      const hashBuf = await crypto.subtle.digest("SHA-1", data);
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      const prefix = hashHex.slice(0, 5);
      const suffix = hashHex.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { "Add-Padding": "true" } });
      if (!res.ok) throw new Error("API error");
      const text = await res.text();
      let count = 0;
      for (const line of text.split("\n")) {
        const [hash, cnt] = line.split(":");
        if (hash?.trim() === suffix) { count = parseInt(cnt?.trim() ?? "0", 10); break; }
      }
      setBreachResults(prev => ({ ...prev, [pwId]: { count, loading: false, checked: true } }));
    } catch {
      setBreachResults(prev => ({ ...prev, [pwId]: { count: null, loading: false, checked: true } }));
    }
  };

  // Hover-reveal for usernames
  useEffect(() => {
    if (!hoveredPw) return;
    const pw = category.passwords.find(p => p.id === hoveredPw);
    if (!pw) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setHoverRevealIdx(prev => ({ ...prev, [hoveredPw]: i }));
      if (i >= pw.username.length) clearInterval(iv);
    }, 25);
    return () => { clearInterval(iv); setHoverRevealIdx(prev => { const n = { ...prev }; delete n[hoveredPw]; return n; }); };
  }, [hoveredPw]);

  // ── TOTP: refresh codes every second ──
  useEffect(() => {
    const tick = async () => {
      setTotpCountdown(30 - (Math.floor(Date.now() / 1000) % 30));
      const withTotp = category.passwords.filter(p => p.totpSecret);
      if (!withTotp.length) return;
      const results: Record<string, string> = {};
      await Promise.all(withTotp.map(async p => {
        try {
          const plainSecret = await decryptField(p.totpSecret!);
          results[p.id] = await generateTOTP(plainSecret);
        }
        catch { results[p.id] = "------"; }
      }));
      setTotpCodes(prev => ({ ...prev, ...results }));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [category.passwords]);

  // ── Edit helpers ──
  const startEdit = async (pw: PasswordItem) => {
    setEditingId(pw.id);
    // Decrypt password/totp so user can see and edit the plaintext
    let plainPw = pw.password;
    let plainTotp = pw.totpSecret || "";
    try { plainPw = await decryptField(pw.password); } catch { /* use as-is */ }
    try { if (pw.totpSecret) plainTotp = await decryptField(pw.totpSecret); } catch { /* use as-is */ }
    setEditForm({ service: pw.service, url: pw.url, username: pw.username, password: plainPw, notes: pw.notes, totpSecret: plainTotp });
  };
  const saveEdit = async () => {
    if (!editForm.service.trim() || !editingId) return;
    // Re-encrypt password and TOTP before storing back in state
    const encPw = await encryptField(editForm.password);
    const encTotp = editForm.totpSecret.trim() ? await encryptField(editForm.totpSecret.trim()) : undefined;
    onUpdate({
      ...category,
      passwords: category.passwords.map(p => p.id === editingId ? {
        ...p,
        service: editForm.service.trim(),
        url: editForm.url.trim(),
        username: editForm.username.trim(),
        password: encPw,
        notes: editForm.notes.trim(),
        totpSecret: encTotp,
        updatedAt: new Date().toISOString(),
      } : p),
    });
    setEditingId(null);
  };

  // Cache of decrypted plaintext passwords (only populated while revealed)
  const decryptedPwCache = useRef<Record<string, string>>({});

  // Drop the revealed-plaintext cache when this page unmounts (e.g. on vault
  // lock / navigation) so decrypted passwords don't linger in the JS heap after
  // the vault closes. (JS strings are immutable and can't be zeroed in place;
  // dropping the only reference is the best available mitigation.)
  useEffect(() => {
    return () => { decryptedPwCache.current = {}; };
  }, []);

  const handleDecrypt = async (id: string, password: string) => {
    if (revealed.has(id)) {
      setRevealed(prev => { const n = new Set(prev); n.delete(id); return n; });
      setRevealText(prev => { const n = { ...prev }; delete n[id]; return n; });
      delete decryptedPwCache.current[id];
      return;
    }
    setDecrypting(prev => new Set(prev).add(id));
    // Decrypt the password from session encryption
    let plaintext = password;
    try { plaintext = await decryptField(password); } catch { /* use as-is */ }
    decryptedPwCache.current[id] = plaintext;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setRevealText(prev => ({ ...prev, [id]: plaintext.slice(0, i) }));
      if (i >= plaintext.length) {
        clearInterval(iv);
        setDecrypting(prev => { const n = new Set(prev); n.delete(id); return n; });
        setRevealed(prev => new Set(prev).add(id));
      }
    }, 35);
  };

  // Arm the backend clipboard auto-clear timer so copied secrets are wiped
  // after the configured timeout (App polls check_clipboard_expiry).
  const armClipboardClear = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("mark_clipboard_copied");
    } catch { /* demo mode / no backend */ }
  };

  const copyWithFlash = async (text: string, cardId: string) => {
    // Decrypt session-encrypted fields before copying to clipboard
    let plaintext = text;
    try { plaintext = await decryptField(text); } catch { /* use as-is */ }
    navigator.clipboard.writeText(plaintext).catch(() => {});
    armClipboardClear();
    setFlashCard(cardId);
    setTimeout(() => setFlashCard(null), 500);
  };

  const pwAtFreeLimit = !isPro && category.passwords.length >= FREE_MAX_ITEMS;

  const addPassword = async () => {
    if (!form.service.trim()) return;
    if (pwAtFreeLimit) return;
    const now = new Date().toISOString();
    // Encrypt password before storing in state
    const encPw = await encryptField(form.password);
    const pw: PasswordItem = {
      id: `pw_${Date.now()}`,
      service: form.service.trim(),
      url: form.url.trim(),
      username: form.username.trim(),
      password: encPw,
      notes: form.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    onUpdate({ ...category, passwords: [...category.passwords, pw] });
    setForm({ service: "", url: "", username: "", password: "", notes: "" });
    setShowAdd(false);
  };

  const deletePassword = (id: string) => {
    onUpdate({ ...category, passwords: category.passwords.filter(p => p.id !== id) });
  };

  const usernameDisplay = (pw: PasswordItem) => {
    const idx = hoverRevealIdx[pw.id] ?? 0;
    if (hoveredPw === pw.id && idx > 0) {
      return pw.username.slice(0, idx) + (idx < pw.username.length ? "█" : "");
    }
    return glitchMask(pw.username.length);
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "transparent" }}>
      {/* ── HUD Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: `${neon}20`, backgroundColor: `${neon}04` }}>
        <div className="flex items-center gap-3">
          <div className="font-mono text-[17px] font-bold uppercase tracking-widest" style={{ color: neon, animation: themeHeaderAnim(themeMode) }}>
            {"◈"} Passwords
          </div>
          {([
            { id: "totp", label: "TOTP" },
            { id: "breaches", label: "Breaches" },
          ] as const).map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(prev => prev === tab.id ? "passwords" : tab.id)}
              className="font-mono text-[17px] uppercase px-2.5 py-1 rounded transition-all"
              style={{
                color: activeTab === tab.id ? neon : `${neon}50`,
                border: `1px solid ${activeTab === tab.id ? `${neon}60` : `${neon}20`}`,
                backgroundColor: activeTab === tab.id ? `${neon}15` : "transparent",
                boxShadow: activeTab === tab.id ? `0 0 8px ${neon}20` : "none",
              }}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 font-mono text-[17px] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span style={{ color: `${neon}50` }}>Strength</span>
            <div className="w-16 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: `${neon}15` }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${healthPct}%`,
                backgroundColor: healthPct >= 70 ? success : healthPct >= 40 ? warning : danger,
              }} />
            </div>
            <span style={{ color: healthPct >= 70 ? success : healthPct >= 40 ? warning : danger }}>{healthPct}%</span>
          </div>
          <span style={{ color: `${neon}15` }}>│</span>
          <span style={{ color: weakCount > 0 ? danger : `${neon}50` }}>
            Weak: <span style={{ color: weakCount > 0 ? danger : success, animation: weakCount > 0 ? "pulse-glow 2s infinite" : "none" }}>{weakCount}</span>
          </span>
          <span style={{ color: `${neon}15` }}>│</span>
          <span style={{ color: `${neon}50` }}>Total: <span style={{ color: neon }}>{category.passwords.length}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)}
            className="font-mono text-[17px] uppercase px-2.5 py-1 rounded transition-all hover:opacity-80"
            title="How does this work?"
            style={{ color: `${neon}90`, border: `1px solid ${neon}35`, backgroundColor: `${neon}08` }}>
            ?
          </button>
          <button onClick={() => setShowAdd(true)}
            className="font-mono text-[17px] uppercase tracking-wider px-4 py-1 rounded transition-all hover:opacity-80"
            style={{ color: neon, border: `1px solid ${neon}50`, backgroundColor: `${neon}08`, boxShadow: `0 0 10px ${neon}15` }}>
            + Add Password
          </button>
        </div>
      </div>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "var(--color-cyber-black)" }}
          onClick={() => setShowHelp(false)}>
          <div className="max-w-lg w-full mx-4 p-6 rounded font-mono" onClick={e => e.stopPropagation()}
            style={{ backgroundColor: "var(--color-cyber-surface)", border: `1px solid ${neon}40`, boxShadow: `0 0 40px ${neon}20` }}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[17px] font-bold uppercase tracking-widest" style={{ color: neon }}>◈ Password Vault — Help</span>
              <button onClick={() => setShowHelp(false)} className="text-[17px] hover:opacity-60 transition-opacity" style={{ color: `${neon}80` }}>✕</button>
            </div>
            <div className="space-y-4 text-[17px]" style={{ color: "var(--color-cyber-text)" }}>
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: neon }}>Adding Passwords</div>
                <div style={{ color: `var(--color-cyber-text)`, opacity: 0.85 }}>Click <span style={{ color: neon }}>+ Add Password</span> to store a login. Fill in the service name, URL, username, and password. Use the built-in generator for strong passwords.</div>
              </div>
              <div style={{ borderTop: `1px solid ${neon}15` }} />
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: neon }}>2FA / TOTP</div>
                <div style={{ opacity: 0.85 }}>TOTP (Time-based One-Time Password) is a 6-digit code that changes every 30 seconds — used for two-factor authentication. To set it up:</div>
                <ol className="mt-2 space-y-1 pl-4 list-decimal" style={{ opacity: 0.85 }}>
                  <li>When a site shows a QR code for 2FA, look for a "copy key" or "enter manually" option to get the <span style={{ color: neon }}>base32 secret</span>.</li>
                  <li>Paste that secret into the <span style={{ color: neon }}>TOTP Secret</span> field when adding/editing a password.</li>
                  <li>Open the <span style={{ color: neon }}>TOTP</span> tab to see live codes with countdown timers.</li>
                </ol>
              </div>
              <div style={{ borderTop: `1px solid ${neon}15` }} />
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: neon }}>Breach Check</div>
                <div style={{ opacity: 0.85 }}>The <span style={{ color: neon }}>Breaches</span> tab checks your passwords against the Have I Been Pwned database using a privacy-safe k-anonymity method — only a partial hash is ever sent.</div>
              </div>
              <div style={{ borderTop: `1px solid ${neon}15` }} />
              <div>
                <div className="uppercase tracking-wider mb-1" style={{ color: neon }}>Password Strength</div>
                <div style={{ opacity: 0.85 }}>Each card shows a strength bar: <span style={{ color: success }}>STRONG</span> = good, <span style={{ color: warning }}>MEDIUM</span> = improve it, <span style={{ color: danger }}>WEAK</span> = change it now. Hover a card to reveal the masked username.</div>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)}
              className="mt-5 w-full text-[17px] uppercase py-1.5 rounded transition-all hover:opacity-80"
              style={{ color: neon, border: `1px solid ${neon}40`, backgroundColor: `${neon}08` }}>
              Got it
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Left: Sector Sidebar ── */}
        <div className="w-48 border-r flex flex-col" style={{ borderColor: `${neon}15`, backgroundColor: `${neon}03` }}>
          <div className="px-3 py-2 border-b" style={{ borderColor: `${neon}15` }}>
            <span className="font-mono text-[17px] uppercase tracking-widest" style={{ color: `${neon}60` }}>
              Filter
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <button onClick={() => setSectorFilter(null)}
              className="w-full text-left font-mono text-[17px] uppercase px-2.5 py-1.5 rounded transition-all flex items-center justify-between"
              style={{
                color: !sectorFilter ? neon : `${neon}50`,
                backgroundColor: !sectorFilter ? `${neon}12` : "transparent",
                border: `1px solid ${!sectorFilter ? `${neon}35` : "transparent"}`,
                boxShadow: !sectorFilter ? `0 0 8px ${neon}10` : "none",
              }}>
              <span>All</span>
              <span style={{ color: `${neon}40` }}>{category.passwords.length}</span>
            </button>

            {serviceNames.map(svc => {
              const count = category.passwords.filter(p => p.service === svc).length;
              const hasWeak = category.passwords.some(p => p.service === svc && getStrength(p.password, p.id).label === "WEAK");
              return (
                <button key={svc} onClick={() => setSectorFilter(svc)}
                  className="w-full text-left font-mono text-[17px] px-2.5 py-1.5 rounded transition-all flex items-center justify-between"
                  style={{
                    color: sectorFilter === svc ? neon : `${neon}50`,
                    backgroundColor: sectorFilter === svc ? `${neon}12` : "transparent",
                    border: `1px solid ${sectorFilter === svc ? `${neon}35` : "transparent"}`,
                  }}>
                  <span className="flex items-center gap-1.5 truncate">
                    {hasWeak && <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: danger, animation: "pulse-glow 2s infinite" }} />}
                    {svc}
                  </span>
                  <span style={{ color: `${neon}40` }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main: Containment Cells Grid ── */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ── TOTP Tab ── */}
          {activeTab === "totp" && (
            <div>
              <div className="font-mono text-[17px] uppercase tracking-widest mb-4 pb-2 border-b" style={{ color: `${neon}40`, borderColor: `${neon}15` }}>
                TOTP / 2FA — Live Codes
              </div>
              {category.passwords.filter(p => p.totpSecret).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 font-mono text-center" style={{ color: `${neon}25` }}>
                  <div style={{ fontSize: 17 }}>⏱</div>
                  <div className="text-[17px] uppercase tracking-widest">No TOTP secrets stored.</div>
                  <div className="text-[17px]">Edit a password entry and add a TOTP secret to see live codes here.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {category.passwords.filter(p => p.totpSecret).map(pw => {
                    const code = totpCodes[pw.id] || "------";
                    const urgent = totpCountdown <= 5;
                    const tickColor = urgent ? danger : neon;
                    return (
                      <div key={pw.id} className={`${rad} p-4`} style={{
                        backgroundColor: "var(--color-cyber-surface)",
                        border: `1px solid ${neon}25`,
                        boxShadow: urgent ? `0 0 12px ${neon}20` : "none",
                      }}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded flex items-center justify-center font-mono text-[17px] font-bold shrink-0"
                            style={{ backgroundColor: `${neon}12`, color: neon, border: `1px solid ${neon}25` }}>
                            {pw.service[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-mono text-[17px] font-bold uppercase truncate" style={{ color: neon }}>{pw.service}</div>
                            <div className="font-mono text-[17px] truncate" style={{ color: `${neon}50` }}>{pw.username}</div>
                          </div>
                        </div>
                        {/* Big code */}
                        <div className="font-mono font-bold text-center tracking-[0.35em] my-3 select-all" style={{
                          fontSize: 17,
                          color: tickColor,
                          textShadow: `0 0 20px ${tickColor}60`,
                          animation: urgent ? "pulse-glow 0.5s infinite" : "none",
                        }}>
                          {code.slice(0, 3)} {code.slice(3)}
                        </div>
                        {/* Countdown bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: `${neon}15` }}>
                            <div className="h-full rounded-full transition-[width]" style={{
                              width: `${(totpCountdown / 30) * 100}%`,
                              backgroundColor: tickColor,
                              boxShadow: `0 0 6px ${tickColor}60`,
                            }} />
                          </div>
                          <span className="font-mono text-[17px] w-6 text-right" style={{ color: tickColor }}>{totpCountdown}s</span>
                          <button onClick={() => { navigator.clipboard.writeText(code).catch(() => {}); armClipboardClear(); }}
                            className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                            style={{ color: neon, border: `1px solid ${neon}25` }}>⎘</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Breaches Tab ── */}
          {activeTab === "breaches" && (
            <div>
              <div className="font-mono text-[17px] uppercase tracking-widest mb-1 pb-2 border-b flex items-center justify-between" style={{ color: `${neon}40`, borderColor: `${neon}15` }}>
                <span>HaveIBeenPwned — Breach Scanner</span>
                <button
                  onClick={() => category.passwords.forEach(p => checkHIBP(p.id, p.password))}
                  className="font-mono text-[17px] uppercase px-2.5 py-1 rounded transition-all hover:opacity-80"
                  style={{ color: neon, border: `1px solid ${neon}30`, backgroundColor: `${neon}08` }}>
                  Check All
                </button>
              </div>
              <div className="font-mono text-[17px] mb-4" style={{ color: `${neon}30` }}>
                Passwords are hashed locally (SHA-1 k-anonymity). Only the first 5 chars of the hash are sent to HIBP.
              </div>
              {category.passwords.length === 0 ? (
                <div className="flex items-center justify-center h-32 font-mono text-[17px]" style={{ color: `${neon}20` }}>No passwords to check.</div>
              ) : (
                <div className="space-y-2">
                  {category.passwords.map(pw => {
                    const result = breachResults[pw.id];
                    const isPwned = result?.checked && result.count !== null && result.count > 0;
                    const isSafe = result?.checked && result.count === 0;
                    const isError = result?.checked && result.count === null;
                    return (
                      <div key={pw.id} className={`${rad} px-4 py-3 flex items-center justify-between gap-3`} style={{
                        backgroundColor: isPwned ? `${danger}08` : "var(--color-cyber-surface)",
                        border: `1px solid ${isPwned ? `${danger}35` : `${neon}15`}`,
                        boxShadow: isPwned ? "0 0 12px `${danger}20`" : "none",
                      }}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded flex items-center justify-center font-mono text-[17px] font-bold shrink-0"
                            style={{ backgroundColor: `${neon}10`, color: neon, border: `1px solid ${neon}20` }}>
                            {pw.service[0]?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="font-mono text-[17px] font-bold uppercase truncate" style={{ color: isPwned ? danger : neon }}>{pw.service}</div>
                            <div className="font-mono text-[17px] truncate" style={{ color: `${neon}50` }}>{pw.username}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {result?.loading && (
                            <span className="font-mono text-[17px] uppercase" style={{ color: `${neon}50`, animation: "pulse-glow 1s infinite" }}>Checking…</span>
                          )}
                          {isPwned && (
                            <span className="font-mono text-[17px] uppercase px-2 py-0.5 rounded" style={{ color: danger, border: `1px solid ${danger}35`, backgroundColor: `${danger}10`, animation: "neon-flicker 2s infinite" }}>
                              {result.count!.toLocaleString()} breach{result.count !== 1 ? "es" : ""}
                            </span>
                          )}
                          {isSafe && (
                            <span className="font-mono text-[17px] uppercase px-2 py-0.5 rounded" style={{ color: success, border: `1px solid ${success}30`, backgroundColor: `${success}08` }}>
                              Safe
                            </span>
                          )}
                          {isError && (
                            <span className="font-mono text-[17px] uppercase" style={{ color: `${neon}40` }}>Error</span>
                          )}
                          <button onClick={() => checkHIBP(pw.id, pw.password)} disabled={result?.loading}
                            className="font-mono text-[17px] uppercase px-2.5 py-1 rounded transition-all hover:opacity-80"
                            style={{
                              color: result?.loading ? `${neon}30` : neon,
                              border: `1px solid ${result?.loading ? `${neon}15` : `${neon}30`}`,
                              backgroundColor: `${neon}08`,
                            }}>
                            {result?.checked ? "Recheck" : "Check"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Passwords Tab ── */}
          {activeTab === "passwords" && <>
          {/* Add form */}
          {showAdd && (
            <div className="rounded p-4 mb-4 space-y-2 relative" style={{
              backgroundColor: `${neon}06`, border: `1px solid ${neon}25`,
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, ${neon}03 3px, ${neon}03 4px)`,
            }}>
              <div className="font-mono text-[17px] uppercase tracking-widest mb-2" style={{ color: `${neon}60` }}>
                Add Password
              </div>
              {[
                { key: "service" as const, ph: "What site...", req: true },
                { key: "url" as const, ph: "URL (optional)...", req: false },
              ].map(f => (
                <input key={f.key} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.ph} autoFocus={f.key === "service"}
                  className="w-full bg-transparent font-mono text-[17px] outline-none px-3 py-1.5 rounded"
                  style={{ color: "var(--color-cyber-text)", border: `1px solid ${neon}15`, caretColor: neon }}
                />
              ))}

              {/* Username + Name Gen */}
              <div className="flex gap-2 items-center relative">
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="Username..."
                  className="flex-1 bg-transparent font-mono text-[17px] outline-none px-3 py-1.5 rounded"
                  style={{ color: "var(--color-cyber-text)", border: `1px solid ${neon}15`, caretColor: neon }}
                />
                <button onClick={() => setShowNameGen(true)}
                  className="font-mono text-[17px] uppercase px-2.5 py-1.5 rounded transition-all hover:opacity-80 shrink-0"
                  style={{ color: neon, border: `1px solid ${neon}30`, backgroundColor: `${neon}08` }}>
                  Name Gen
                </button>
                {showNameGen && (
                  <div className={`absolute right-0 top-full mt-1 z-50 ${rad} p-3 min-w-[240px]`}
                    style={{ backgroundColor: "var(--color-cyber-panel)", border: `1px solid ${neon}30`, boxShadow: `0 4px 20px rgba(0,0,0,0.5)`, animation: "scale-in 0.2s ease-out" }}>
                    <div className="font-mono text-[17px] mb-2" style={{ color: `${neon}60` }}>Username Generator</div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>Length</span>
                      <div className="flex gap-1.5">
                        {(["short", "medium", "long"] as const).map(len => (
                          <button key={len} onClick={() => setNameGenLength(len)}
                            className="font-mono text-[17px] px-2.5 py-1 rounded capitalize transition-all"
                            style={{
                              color: nameGenLength === len ? neon : "var(--color-cyber-muted)",
                              border: `1px solid ${nameGenLength === len ? neon : "var(--color-cyber-border)"}`,
                              backgroundColor: nameGenLength === len ? `${neon}15` : "transparent",
                            }}>
                            {len}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={generateUsername}
                        className="flex-1 font-mono text-[17px] uppercase px-3 py-1.5 rounded transition-all hover:opacity-80"
                        style={{ color: neon, border: `1px solid ${neon}40`, backgroundColor: `${neon}10` }}>
                        Generate
                      </button>
                      <button onClick={() => setShowNameGen(false)}
                        className="font-mono text-[17px] uppercase px-3 py-1.5 rounded"
                        style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Password + Password Gen */}
              <div className="flex gap-2 items-center relative">
                <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Password..."
                  type="password"
                  className="flex-1 bg-transparent font-mono text-[17px] outline-none px-3 py-1.5 rounded"
                  style={{ color: "var(--color-cyber-text)", border: `1px solid ${neon}15`, caretColor: neon }}
                />
                <button onClick={() => setShowPwGen(!showPwGen)}
                  className="font-mono text-[17px] uppercase px-2.5 py-1.5 rounded transition-all hover:opacity-80 shrink-0"
                  style={{ color: neon, border: `1px solid ${neon}30`, backgroundColor: `${neon}08` }}>
                  Pass Gen
                </button>
                {showPwGen && (
                  <div className={`absolute right-0 top-full mt-1 z-50 ${rad} p-3 min-w-[260px]`}
                    style={{ backgroundColor: "var(--color-cyber-panel)", border: `1px solid ${neon}30`, boxShadow: `0 4px 20px rgba(0,0,0,0.5)`, animation: "scale-in 0.2s ease-out" }}>
                    <div className="font-mono text-[17px] mb-3" style={{ color: `${neon}60` }}>Password Generator</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>Length</span>
                        <div className="flex items-center gap-2">
                          <input type="range" min={6} max={64} value={pwGenLength} onChange={e => setPwGenLength(Number(e.target.value))}
                            className="w-24 accent-current" style={{ color: neon }} />
                          <span className="font-mono text-[17px] w-6 text-right" style={{ color: neon }}>{pwGenLength}</span>
                        </div>
                      </div>
                      {[
                        { label: "Uppercase", value: pwGenUppercase, set: setPwGenUppercase },
                        { label: "Numbers", value: pwGenNumbers, set: setPwGenNumbers },
                        { label: "Symbols", value: pwGenSymbols, set: setPwGenSymbols },
                      ].map(opt => (
                        <div key={opt.label} className="flex items-center justify-between">
                          <span className="font-mono text-[17px]" style={{ color: "var(--color-cyber-text)" }}>{opt.label}</span>
                          <button onClick={() => opt.set(!opt.value)}
                            className="font-mono text-[17px] px-2 py-0.5 rounded"
                            style={{ color: opt.value ? neon : "var(--color-cyber-muted)", border: `1px solid ${opt.value ? neon : "var(--color-cyber-border)"}`, backgroundColor: opt.value ? `${neon}15` : "transparent" }}>
                            {opt.value ? "Yes" : "No"}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={generatePassword}
                        className="flex-1 font-mono text-[17px] uppercase px-3 py-1.5 rounded transition-all hover:opacity-80"
                        style={{ color: neon, border: `1px solid ${neon}40`, backgroundColor: `${neon}10` }}>
                        Generate
                      </button>
                      <button onClick={() => setShowPwGen(false)}
                        className="font-mono text-[17px] uppercase px-3 py-1.5 rounded"
                        style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)..."
                className="w-full bg-transparent font-mono text-[17px] outline-none px-3 py-1.5 rounded"
                style={{ color: "var(--color-cyber-text)", border: `1px solid ${neon}15`, caretColor: neon }}
              />
              <div className="flex gap-2 pt-2">
                <button onClick={addPassword} disabled={!form.service.trim() || pwAtFreeLimit} title={pwAtFreeLimit ? `Free plan: max ${FREE_MAX_ITEMS} passwords` : "Save password"}
                  className="font-mono text-[17px] uppercase px-4 py-1.5 rounded transition-all hover:opacity-80"
                  style={{
                    color: form.service.trim() ? neon : "var(--color-cyber-muted)",
                    border: `1px solid ${form.service.trim() ? neon : "var(--color-cyber-border)"}`,
                    backgroundColor: form.service.trim() ? `${neon}10` : "transparent",
                  }}>
                  Save
                </button>
                <button onClick={() => { setShowAdd(false); setForm({ service: "", url: "", username: "", password: "", notes: "" }); }}
                  className="font-mono text-[17px] uppercase px-4 py-1.5 rounded"
                  style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {filtered.length === 0 && !showAdd && (
            <div className="flex items-center justify-center h-full font-mono text-[17px]" style={{ color: `${neon}20` }}>
              No passwords {sectorFilter ? `in "${sectorFilter}"` : "yet"}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((pw, idx) => {
              const strength = getStrength(pw.password, pw.id);
              const isFlash = flashCard === pw.id;
              const isRevealed = revealed.has(pw.id);
              const isDecryptingPw = decrypting.has(pw.id);
              const isBreach = strength.label === "WEAK";
              const isEditing = editingId === pw.id;
              const age = getPasswordAge(pw);

              return (
                <motion.div key={pw.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.3), ease: "easeOut" }}
                  className={`${rad} p-4 group relative transition-all`}
                  onMouseEnter={() => !isEditing && setHoveredPw(pw.id)}
                  onMouseLeave={() => setHoveredPw(null)}
                  style={{
                    backgroundColor: isFlash ? `${neon}15` : "var(--color-cyber-surface)",
                    border: `1px solid ${isEditing ? `${neon}50` : isFlash ? neon : isBreach ? `${danger}40` : "var(--color-cyber-border)"}`,
                    boxShadow: isEditing ? `0 0 20px ${neon}20` : isFlash ? `0 0 20px ${neon}30, inset 0 0 15px ${neon}08` :
                               isBreach ? "0 0 15px `${danger}25`" : "none",
                    animation: isEditing ? "none" : isBreach
                      ? "breach-pulse 3s ease-in-out infinite"
                      : "none",
                    transition: "all 0.2s ease",
                  }}>

                  {/* ── Edit mode ── */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="font-mono text-[17px] uppercase tracking-widest mb-2" style={{ color: `${neon}60` }}>Edit Entry</div>
                      {([
                        { key: "service" as const, ph: "Service..." },
                        { key: "url" as const, ph: "URL (optional)..." },
                        { key: "username" as const, ph: "Username..." },
                        { key: "password" as const, ph: "Password..." },
                        { key: "notes" as const, ph: "Notes (optional)..." },
                        { key: "totpSecret" as const, ph: "TOTP Secret (base32, optional)..." },
                      ] as const).map(f => (
                        <input key={f.key}
                          value={editForm[f.key]}
                          onChange={e => setEditForm(ef => ({ ...ef, [f.key]: e.target.value }))}
                          placeholder={f.ph}
                          type={f.key === "password" ? "text" : "text"}
                          className="w-full bg-transparent font-mono text-[17px] outline-none px-2.5 py-1.5 rounded"
                          style={{ color: "var(--color-cyber-text)", border: `1px solid ${neon}20`, caretColor: neon }}
                        />
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveEdit} disabled={!editForm.service.trim()}
                          className="font-mono text-[17px] uppercase px-3 py-1 rounded transition-all hover:opacity-80"
                          style={{ color: editForm.service.trim() ? neon : "var(--color-cyber-muted)", border: `1px solid ${editForm.service.trim() ? neon : "var(--color-cyber-border)"}`, backgroundColor: editForm.service.trim() ? `${neon}10` : "transparent" }}>
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="font-mono text-[17px] uppercase px-3 py-1 rounded"
                          style={{ color: "var(--color-cyber-muted)", border: "1px solid var(--color-cyber-border)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Breach tag */}
                      {isBreach && (
                        <div className="absolute top-2 right-2 font-mono text-[17px] uppercase px-1.5 py-0.5 rounded"
                          style={{ color: danger, border: `1px solid ${danger}40`, backgroundColor: `${danger}10`, animation: "neon-flicker 2s infinite, neon-strobe 3s infinite" }}>
                          Weak
                        </div>
                      )}

                      {/* Edit + Delete buttons */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isBreach && <div className="w-10" />}
                        <button onClick={() => startEdit(pw)}
                          className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                          style={{ color: neon, border: `1px solid ${neon}30`, backgroundColor: `${neon}08` }}>✎</button>
                        <button onClick={() => deletePassword(pw.id)}
                          className="font-mono text-[17px] px-1.5 py-0.5 rounded transition-opacity"
                          style={{ color: danger, border: `1px solid ${danger}30` }}>✕</button>
                      </div>

                      {/* Header: Brand icon + Service name */}
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-8 h-8 rounded flex items-center justify-center font-mono text-[17px] font-bold"
                          style={{ backgroundColor: `${neon}18`, color: neon, border: `1px solid ${neon}35`, textShadow: `0 0 8px ${neon}80` }}>
                          {pw.service[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[17px] font-bold uppercase truncate" style={{ color: neon, textShadow: `0 0 10px ${neon}60` }}>{pw.service}</div>
                          {pw.url && <div className="font-mono text-[17px] truncate" style={{ color: `${neon}90`, textShadow: `0 0 6px ${neon}30` }}>{pw.url}</div>}
                        </div>
                        {/* TOTP badge */}
                        {pw.totpSecret && (
                          <span className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded shrink-0"
                            style={{ color: neon, border: `1px solid ${neon}30`, backgroundColor: `${neon}08` }}>2FA</span>
                        )}
                      </div>

                      {/* Strength meter bar */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-cyber-border)" }}>
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${strength.pct}%`,
                            backgroundColor: strength.color,
                            boxShadow: `0 0 6px ${strength.color}60`,
                            animation: "loading-bar 0.5s ease-out",
                          }} />
                        </div>
                        <span className="font-mono text-[17px] uppercase font-semibold" style={{ color: strength.color, textShadow: `0 0 8px ${strength.color}60` }}>{strength.label}</span>
                      </div>

                      {/* Username — glitch masked, resolves on hover */}
                      <div className="flex items-center gap-2 mb-2 py-1 px-2 rounded" style={{ backgroundColor: `${neon}08` }}>
                        <span className="font-mono text-[17px] uppercase w-12" style={{ color: `${neon}90`, textShadow: `0 0 6px ${neon}40` }}>User</span>
                        <span className="font-mono text-[17px] flex-1 truncate" style={{
                          color: hoveredPw === pw.id ? "var(--color-neon-bright)" : `${neon}90`,
                          letterSpacing: hoveredPw === pw.id ? "normal" : "0.5px",
                          textShadow: hoveredPw === pw.id ? `0 0 8px ${neon}60` : `0 0 4px ${neon}20`,
                        }}>
                          {hoveredPw === pw.id ? usernameDisplay(pw) : glitchMask(pw.username.length)}
                        </span>
                        <button onClick={() => copyWithFlash(pw.username, pw.id + "_u")}
                          className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                          style={{ color: neon, border: `1px solid ${neon}25` }}>
                          {"⎘"}
                        </button>
                      </div>

                      {/* Password — glitch masked with decrypt animation */}
                      <div className="flex items-center gap-2 py-1 px-2 rounded" style={{ backgroundColor: `${neon}08` }}>
                        <span className="font-mono text-[17px] uppercase w-12" style={{ color: `${neon}90`, textShadow: `0 0 6px ${neon}40` }}>Pass</span>
                        <span className="font-mono text-[17px] flex-1 truncate" style={{
                          color: isRevealed ? success : `${neon}80`,
                          letterSpacing: isRevealed ? "normal" : "1px",
                          textShadow: isRevealed ? "0 0 10px ${success}80" : `0 0 4px ${neon}20`,
                        }}>
                          {isRevealed ? (decryptedPwCache.current[pw.id] || pw.password) : isDecryptingPw ? (revealText[pw.id] || "") + "█" : glitchMask(encryptedLength(pw.password))}
                        </span>
                        <button onClick={() => handleDecrypt(pw.id, pw.password)}
                          className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                          style={{
                            color: isRevealed ? danger : success,
                            border: `1px solid ${isRevealed ? `${danger}25` : `${success}25`}`,
                          }}>
                          {isRevealed ? "Hide" : isDecryptingPw ? "..." : "Show"}
                        </button>
                        <button onClick={() => copyWithFlash(pw.password, pw.id + "_p")}
                          className="font-mono text-[17px] uppercase px-1.5 py-0.5 rounded transition-all hover:opacity-80"
                          style={{ color: neon, border: `1px solid ${neon}25` }}>
                          {"⎘"}
                        </button>
                      </div>

                      {/* Password age */}
                      <div className="flex items-center justify-between mt-1.5 px-2 py-0.5 rounded" style={{
                        backgroundColor: age.warn ? `${danger}08` : `${neon}04`,
                        border: `1px solid ${age.warn ? `${danger}20` : `${neon}10`}`,
                      }}>
                        <span className="font-mono text-[17px] uppercase tracking-wider" style={{ color: age.warn ? danger : `${neon}70` }}>Age</span>
                        <span className="font-mono text-[17px]" style={{ color: age.warn ? danger : `${neon}80` }}>
                          {age.label}{age.warn ? " · Update recommended" : ""}
                        </span>
                      </div>

                      {pw.notes && (
                        <div className="font-mono text-[17px] mt-2 truncate px-2" style={{ color: `${neon}90`, textShadow: `0 0 4px ${neon}25` }}>{pw.notes}</div>
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>
          </>}
        </div>
      </div>
    </div>
  );
}

// ── Media UI ──
function MediaView({ category, pageColor, onUpdate }: { category: PageCategory; pageColor: string; onUpdate: (c: PageCategory) => void }) {
  refreshCssVarCache();
  const danger = cssVar("--color-status-danger");
  const success = cssVar("--color-status-success");
  const toggleRating = () => {
    onUpdate({ ...category, rating: category.rating === "sfw" ? "nsfw" : "sfw" });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={toggleRating}
          className="font-mono text-[17px] uppercase px-2 py-1 rounded transition-all"
          style={{
            color: category.rating === "nsfw" ? danger : success,
            border: `1px solid ${category.rating === "nsfw" ? `${danger}40` : `${success}40`}`,
            backgroundColor: category.rating === "nsfw" ? `${danger}10` : `${success}10`,
          }}>
          {category.rating === "nsfw" ? "NSFW" : "SFW"}
        </button>
      </div>
    </div>
  );
}

// ── Main Category View ──
export default function PageCategories({ categories, pageColor, onUpdate, themeMode, isPro = false }: Props) {
  const handleCategoryUpdate = (updated: PageCategory) => {
    onUpdate(categories.map(c => c.id === updated.id ? updated : c));
  };

  if (!categories.length) return null;

  // Single category — render directly without tab bar
  const cat = categories[0];

  if (cat.type === "documents") {
    return <DocumentsView category={cat} pageColor={pageColor} onUpdate={handleCategoryUpdate} themeMode={themeMode} isPro={isPro} />;
  }
  if (cat.type === "passwords") {
    return <PasswordsView category={cat} pageColor={pageColor} onUpdate={handleCategoryUpdate} themeMode={themeMode} isPro={isPro} />;
  }
  if (cat.type === "notes") {
    return <NotesView category={cat} pageColor={pageColor} onUpdate={handleCategoryUpdate} themeMode={themeMode} isPro={isPro} />;
  }
  if (cat.type === "media") {
    return <MediaView category={cat} pageColor={pageColor} onUpdate={handleCategoryUpdate} />;
  }

  return null;
}
