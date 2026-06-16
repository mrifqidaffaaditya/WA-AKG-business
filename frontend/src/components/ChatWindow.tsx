"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import { formatPhone, timeAgo, playBeep } from "@/lib/utils";
import { getIO } from "@/lib/socket";
import { apiFetch, getAuthenticatedMediaUrl } from "@/lib/api";
import {
  Send,
  Paperclip,
  X,
  Image as ImageIcon,
  File as FileIcon,
  CheckCircle,
  ArrowDown,
  MoreVertical,
  ArrowLeft,
  Clock,
  CornerUpLeft,
  Play,
  Pause,
  StickyNote,
  Star,
  Pencil,
} from "lucide-react";

interface Message {
  id: string;
  conversation_id: string;
  sender: "customer" | "bot" | "cs";
  cs_id: string | null;
  cs_name?: string | null;
  content: string;
  content_type?: "text" | "image" | "video" | "document" | "audio";
  media_url?: string | null;
  file_name?: string | null;
  reply_to_content?: string | null;
  reply_to_sender?: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved" | "hold";
  claimed_by: string | null;
  claimed_by_name?: string | null;
  total_sessions?: number;
}

interface ConversationNote {
  conversation_id: string;
  note: string;
  rating: number | null;
  status: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatWindowProps {
  conversation: Conversation | null;
  soundEnabled?: boolean;
  onBack?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  active: { label: "Active", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  resolved: { label: "Selesai", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  bot: { label: "Bot", color: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  hold: { label: "On Hold", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
};

function avatarGradient(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const gradients = [
    "from-amber-500/40 to-amber-600/40",
    "from-sky-500/40 to-sky-600/40",
    "from-rose-500/40 to-rose-600/40",
    "from-amber-500/40 to-orange-600/40",
    "from-rose-500/40 to-pink-600/40",
    "from-sky-500/40 to-amber-600/40",
  ];
  return gradients[hash % gradients.length];
}

export default function ChatWindow({ conversation, soundEnabled, onBack }: ChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newMessageBadge, setNewMessageBadge] = useState(false);
  const [sending, setSending] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const [resolveModal, setResolveModal] = useState(false);
  const [resolveReview, setResolveReview] = useState("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);

  // ── Notes (per-number history + edit current conversation's note) ──
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [editNoteOpen, setEditNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const handleHoldToggle = async () => {
    if (!conversation) return;
    setHoldLoading(true);
    const action = conversation.status === "hold" ? "unhold" : "hold";
    try {
      const res = await apiFetch(`/api/conversations/${conversation.id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Toggle hold failed");
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal mengubah status hold percakapan",
        type: "error",
      });
    } finally {
      setHoldLoading(false);
    }
  };

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Collapse the auto-grown composer back to one row (used after send/clear).
  const resetTextareaHeight = useCallback(() => {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  // Max upload size. Base64 inflates payload by ~33%, so a client-side guard
  // avoids encoding huge files only to have the server reject them.
  const MAX_FILE_BYTES = 16 * 1024 * 1024;

  // Validate size, then stage the file (with an image preview when relevant).
  const acceptFile = useCallback((f: File): void => {
    if (f.size > MAX_FILE_BYTES) {
      setModal({
        isOpen: true,
        title: "File terlalu besar",
        message:
          "Ukuran file maksimal 16 MB. File ini " +
          (f.size / 1024 / 1024).toFixed(1) +
          " MB.",
        type: "warning",
      });
      return;
    }
    setFile(f);
    setFilePreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }, []);

  // Close the header dropdown when clicking outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messageContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!hasMore || loadingMore || !nextCursor || !conversation) return;
    const el = topRef.current;
    if (!el) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages();
        }
      },
      { root: messageContainerRef.current, threshold: 0.1 }
    );
    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMore, loadingMore, nextCursor, conversation]);

  const loadOlderMessages = () => {
    if (loadingMore || !nextCursor || !conversation) return;
    setLoadingMore(true);

    const el = messageContainerRef.current;
    const prevScrollHeight = el ? el.scrollHeight : 0;

    apiFetch(
      "/api/conversations/" + conversation.id + "/messages?cursor=" + nextCursor + "&limit=30&direction=older"
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load messages");
        return res.json();
      })
      .then((data) => {
        if (data.messages) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));
            return [...newMsgs, ...prev];
          });
          setHasMore(data.has_more);
          setNextCursor(data.next_cursor);

          requestAnimationFrame(() => {
            if (el) {
              const newHeight = el.scrollHeight;
              el.scrollTop = el.scrollTop + (newHeight - prevScrollHeight);
            }
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    const el = messageContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      isAtBottomRef.current = atBottom;
      if (atBottom) setNewMessageBadge(false);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      setHasMore(false);
      setNextCursor(null);
      return;
    }

    setLoading(true);
    setFile(null);
    setFilePreview(null);
    setNewMessageBadge(false);
    setReplyingTo(null);
    isAtBottomRef.current = true;

    apiFetch("/api/conversations/" + conversation.id + "/messages?limit=30&direction=older")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load messages");
        return res.json();
      })
      .then((data) => {
        setMessages(data.messages || []);
        setHasMore(data.has_more);
        setNextCursor(data.next_cursor);
      })
      .catch(() => setMessages([]))
      .finally(() => {
        setLoading(false);
      });
  }, [conversation?.id]);

  useEffect(() => {
    if (!loading && conversation && messages.length > 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToBottom("instant"));
      });
    }
  }, [loading, conversation, messages.length, scrollToBottom]);

  // Fetch all notes recorded for this customer number (history across chats).
  // Declared before the socket effect that depends on it.
  const fetchNotes = useCallback(async (waNumber: string) => {
    setNotesLoading(true);
    try {
      const res = await apiFetch("/api/conversations/by-number/" + encodeURIComponent(waNumber) + "/notes");
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setNotes(data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    const socket = getIO();
    if (!socket || !conversation) return;

    const handleMessage = (data: { conversationId?: string; message?: Message }) => {
      const msg: Message = data.message || (data as unknown as Message);
      if (msg.conversation_id !== conversation.id) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (isAtBottomRef.current || msg.sender === "cs") {
        requestAnimationFrame(() => scrollToBottom("smooth"));
      } else {
        setNewMessageBadge(true);
      }
    };

    const handleNoteUpdated = (data: { waNumber?: string }) => {
      // If another CS edits a note for this number while the panel is open,
      // refresh so everyone sees the latest context.
      if (notesOpen && data.waNumber && data.waNumber === conversation.wa_number) {
        fetchNotes(conversation.wa_number);
      }
    };

    socket.on("conversation:message", handleMessage);
    socket.on("note:updated", handleNoteUpdated);
    return () => {
      socket.off("conversation:message", handleMessage);
      socket.off("note:updated", handleNoteUpdated);
    };
  }, [conversation, scrollToBottom, notesOpen, fetchNotes]);

  const sendMessage = async () => {
    if (!conversation || (!input.trim() && !file) || sending) return;
    setSending(true);

    let contentType = "text";
    let fileData: string | null = null;
    let fileName: string | null = null;

    if (file) {
      if (file.type.startsWith("image/")) {
        contentType = "image";
      } else if (file.type.startsWith("video/")) {
        contentType = "video";
      } else {
        contentType = "document";
      }

      fileName = file.name;

      try {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
        });
      } catch {
        setModal({ isOpen: true, title: "Error", message: "Gagal memproses file", type: "error" });
        setSending(false);
        return;
      }
    }

    const body: Record<string, unknown> = {
      content: input.trim(),
      contentType,
      ...(fileData && { fileData, fileName }),
      ...(replyingTo && { quotedMessageId: replyingTo.id }),
    };

    // Snapshot then optimistically clear the composer; restore on failure so the
    // user doesn't lose their text.
    const prevInput = input;
    const prevFile = file;
    const prevPreview = filePreview;
    const prevReplyingTo = replyingTo;
    setInput("");
    setFile(null);
    setFilePreview(null);
    setReplyingTo(null);
    resetTextareaHeight();

    try {
      const res = await apiFetch("/api/conversations/" + conversation.id + "/messages", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Gagal mengirim");
      scrollToBottom("smooth");
    } catch {
      setInput(prevInput);
      setFile(prevFile);
      setFilePreview(prevPreview);
      setReplyingTo(prevReplyingTo);
      setModal({ isOpen: true, title: "Error", message: "Gagal mengirim pesan", type: "error" });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    apiFetch("/api/conversations/cs-config")
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch cs config");
        return res.json();
      })
      .then(data => {
        if (data.quickReplies) setQuickReplies(data.quickReplies);
      })
      .catch(() => {});
  }, []);

  const handleClaim = async () => {
    if (!conversation) return;
    setClaimLoading(true);
    try {
      const res = await apiFetch("/api/conversations/" + conversation.id + "/claim", { method: "POST" });
      if (res.status === 409) {
        // Lost the claim race — another CS got it first. Show a clear, non-alarming
        // message; the socket "conversation:claimed" event will sync the real owner.
        setModal({
          isOpen: true,
          title: "Sudah diklaim",
          message: "Percakapan ini baru saja diambil oleh CS lain.",
          type: "warning",
        });
        return;
      }
      if (!res.ok) throw new Error("Claim failed");
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal mengklaim percakapan", type: "error" });
    } finally {
      setClaimLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!conversation) return;
    try {
      const res = await apiFetch("/api/conversations/" + conversation.id + "/resolve", {
        method: "POST",
        body: JSON.stringify({ rating: null, review: resolveReview }),
      });
      if (!res.ok) throw new Error("Resolve failed");
      setResolveModal(false);
      setResolveReview("");
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal menyelesaikan percakapan", type: "error" });
    }
  };

  const openNotes = () => {
    if (!conversation) return;
    setNotesOpen(true);
    fetchNotes(conversation.wa_number);
  };

  const openEditNote = () => {
    // Seed the editor with this conversation's existing note (if any in history).
    const current = notes.find((n) => n.conversation_id === conversation?.id);
    setNoteDraft(current?.note || "");
    setEditNoteOpen(true);
  };

  const handleSaveNote = async () => {
    if (!conversation) return;
    setNoteSaving(true);
    try {
      const res = await apiFetch("/api/conversations/" + conversation.id + "/note", {
        method: "PATCH",
        body: JSON.stringify({ note: noteDraft }),
      });
      if (!res.ok) throw new Error("Failed to save note");
      setEditNoteOpen(false);
      // Refresh the history so the edit shows immediately for this CS too.
      fetchNotes(conversation.wa_number);
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal menyimpan catatan", type: "error" });
    } finally {
      setNoteSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    acceptFile(f);
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    acceptFile(f);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center animate-scaleUp">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800/50 shadow-xl flex items-center justify-center mx-auto mb-6">
            <Clock size={36} className="text-slate-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-300 mb-1">Tidak Ada Obrolan</h2>
          <p className="text-slate-500 text-sm">Pilih percakapan dari daftar di samping</p>
        </div>
      </div>
    );
  }

  const isClaimedByMe = conversation.claimed_by === user?.id;
  const isOwnActiveOrHold = (conversation.status === "active" || conversation.status === "hold") && isClaimedByMe;
  const st = statusConfig[conversation.status] || statusConfig.bot;
  const displayName = conversation.customer_name || formatPhone(conversation.wa_number);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0 min-h-0 relative">
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-800/50 glass shrink-0 z-10">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Kembali ke daftar percakapan"
            className="md:hidden p-2 -ml-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br ${avatarGradient(
            displayName
          )} border border-slate-700 flex items-center justify-center shrink-0`}
        >
          <span className="text-xs sm:text-sm font-bold text-slate-200">
            {displayName[0].toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-100 truncate max-w-[100px] sm:max-w-none">
              {displayName}
            </h3>
            <span
              className={
                "shrink-0 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-md font-medium border " +
                st.color
              }
            >
              {st.label}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {formatPhone(conversation.wa_number)}
            {(conversation.status === "active" || conversation.status === "hold") && conversation.claimed_by && (
              <span className="ml-1.5 text-[9px] text-amber-400/80">
                {conversation.claimed_by === user?.id
                  ? " (Anda)"
                  : ` (${conversation.claimed_by_name || "CS lain"})`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {conversation.status === "waiting" && (
            <button
              onClick={handleClaim}
              disabled={claimLoading}
              className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-all duration-200 disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
            >
              <CheckCircle size={14} />
              <span className="hidden sm:inline">Claim</span>
            </button>
          )}
          {(conversation.status === "active" || conversation.status === "hold") &&
            (isClaimedByMe || user?.role !== "cs") && (
              <button
                onClick={handleHoldToggle}
                disabled={holdLoading}
                className={
                  "flex items-center gap-1 rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-95 cursor-pointer " +
                  (conversation.status === "hold"
                    ? "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20"
                    : "bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/20")
                }
              >
                {conversation.status === "hold" ? <Play size={14} /> : <Pause size={14} />}
                <span className="hidden sm:inline">
                  {conversation.status === "hold" ? "Resume" : "Hold"}
                </span>
              </button>
            )}
          {(conversation.status === "active" ||
            conversation.status === "hold" ||
            conversation.status === "waiting") &&
            (isOwnActiveOrHold || user?.role !== "cs") && (
              <button
                onClick={() => setResolveModal(true)}
                className="flex items-center gap-1 rounded-lg bg-slate-800/80 border border-slate-700 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 transition-all duration-200 cursor-pointer"
              >
                <CheckCircle size={14} />
                <span className="hidden sm:inline">Resolve</span>
              </button>
            )}
          <button
            onClick={openNotes}
            aria-label="Lihat catatan customer"
            title="Catatan"
            className="flex items-center gap-1 rounded-lg bg-slate-800/80 border border-slate-700 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/20 transition-all duration-200 cursor-pointer"
          >
            <StickyNote size={14} />
            <span className="hidden sm:inline">Catatan</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu percakapan"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden z-50 animate-scaleUp origin-top-right">
                {onBack && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onBack();
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer md:hidden"
                  >
                    Kembali ke Daftar
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setResolveModal(true);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Tutup Chat (Resolve)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={messageContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth bg-dot-grid"
      >
        <div className="flex flex-col gap-3 max-w-4xl mx-auto">
          <div ref={topRef} className="h-px shrink-0" />

          {!hasMore && messages.length > 0 && (
            <div className="text-center py-6">
              <div className="inline-flex items-center gap-3 text-slate-500 bg-slate-900/50 px-4 py-1.5 rounded-full border border-slate-800/50 backdrop-blur-sm">
                <span className="text-[11px] font-medium uppercase tracking-wider">
                  Awal percakapan
                </span>
              </div>
            </div>
          )}

          {loadingMore && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm">
                <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-amber-500 animate-spin" />
                <span className="text-[12px] font-medium text-slate-300">
                  Memuat riwayat...
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-amber-500 animate-spin" />
                <span className="text-sm font-medium">
                  Memuat percakapan...
                </span>
              </div>
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="text-center text-slate-500 animate-fadeIn">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span className="text-sm font-medium">Belum ada pesan di sini</span>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isCustomer = msg.sender === "customer";
            const isBot = msg.sender === "bot";
            const isCs = msg.sender === "cs";
            const isMine = isCs && msg.cs_id === user?.id;

            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showName =
              isCs && msg.cs_name && (!prevMsg || prevMsg.sender !== msg.sender || prevMsg.cs_id !== msg.cs_id);

            return (
              <div
                key={msg.id}
                className={
                  "flex w-full animate-bubble-in group items-center gap-2 " +
                  (isCustomer || isBot ? "justify-start flex-row" : "justify-start flex-row-reverse")
                }
              >
                <div className="flex flex-col max-w-[85%] sm:max-w-[70%]">
                  {showName && (
                    <span
                      className={
                        "text-[11px] font-medium text-slate-400 mb-1 " +
                        (isMine ? "text-right mr-1" : "ml-1")
                      }
                    >
                      {isMine ? "Anda" : msg.cs_name}
                    </span>
                  )}
                  <div
                    className={
                      "relative rounded-2xl px-4 py-3 " +
                      (isCustomer
                        ? "bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-sm"
                        : isBot
                        ? "bg-sky-500/10 text-sky-100 border border-sky-500/20 rounded-tl-sm"
                        : isMine
                        ? "bg-gradient-to-br from-amber-600 to-amber-700 text-white rounded-tr-sm shadow-lg shadow-amber-900/20"
                        : "bg-slate-700/80 text-slate-100 border border-slate-600/50 rounded-tr-sm")
                    }
                  >
                    {msg.reply_to_content && (
                      <div className="mb-2 p-2 border-l-2 border-amber-500 bg-black/20 rounded-r-lg text-xs max-w-full">
                        <span className="font-semibold text-amber-400 block mb-0.5">
                          {msg.reply_to_sender || "Pesan"}
                        </span>
                        <p className="text-slate-300 truncate">
                          {msg.reply_to_content}
                        </p>
                      </div>
                    )}
                    {msg.content_type === "image" && (
                      <div className="mb-2 overflow-hidden rounded-xl border border-white/10">
                        <img
                          src={getAuthenticatedMediaUrl(msg.media_url || msg.content)}
                          alt="Gambar"
                          className="max-w-full max-h-[300px] object-cover transition-transform hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                    )}

                    {msg.content_type === "video" && (
                      <div className="mb-2 overflow-hidden rounded-xl border border-white/10">
                        <video
                          src={getAuthenticatedMediaUrl(msg.media_url || msg.content)}
                          controls
                          className="max-w-full max-h-[300px] object-cover"
                        />
                      </div>
                    )}

                    {msg.content_type === "document" && (
                      <a
                        href={getAuthenticatedMediaUrl(msg.media_url || msg.content)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          "flex items-center gap-3 p-3 rounded-xl mb-2 transition-colors cursor-pointer " +
                          (isMine
                            ? "bg-amber-700 hover:bg-amber-800"
                            : "bg-slate-900/50 hover:bg-slate-900/80")
                        }
                      >
                        <div
                          className={
                            "w-8 h-8 rounded-lg flex items-center justify-center " +
                            (isMine ? "bg-white/20" : "bg-slate-700")
                          }
                        >
                          <FileIcon size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">
                            {msg.file_name || "Dokumen"}
                          </span>
                          <span
                            className={
                              "text-[10px] " +
                              (isMine ? "text-amber-200" : "text-slate-400")
                            }
                          >
                            Klik untuk mengunduh
                          </span>
                        </div>
                      </a>
                    )}

                    {msg.content && msg.content_type !== "image" && (
                      <p
                        className={
                          "text-sm whitespace-pre-wrap break-words leading-relaxed " +
                          (isMine ? "text-white" : "text-slate-200")
                        }
                      >
                        {msg.content}
                      </p>
                    )}

                    <div
                      className={
                        "flex items-center justify-end gap-1 mt-1 " +
                        (isMine ? "text-amber-200" : "text-slate-400")
                      }
                    >
                      <span className="text-[10px] font-medium">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setReplyingTo(msg)}
                  className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                  title="Balas pesan ini"
                >
                  <CornerUpLeft size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {newMessageBadge && (
        <button
          onClick={() => {
            scrollToBottom("smooth");
            setNewMessageBadge(false);
          }}
          className="absolute bottom-[90px] right-6 z-20 flex items-center gap-2 rounded-full bg-amber-500 pl-3 pr-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-black/40 hover:bg-amber-400 hover:-translate-y-0.5 transition-all animate-slide-in-from-bottom cursor-pointer"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <ArrowDown size={14} />
          </div>
          Ada Pesan Baru
        </button>
      )}

      {conversation?.status === "active" && quickReplies.length > 0 && (
        <div className="bg-slate-900/90 backdrop-blur-sm border-t border-slate-800/50 px-4 py-3 flex gap-2 overflow-x-auto shrink-0 z-10">
          {quickReplies.map((qr, i) => (
            <button
              key={i}
              onClick={() => {
                setInput((prev) => (prev ? prev + " " + qr : qr));
              }}
              className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {qr}
            </button>
          ))}
        </div>
      )}

      <div
        className={
          "bg-slate-900/90 backdrop-blur-sm p-3 sm:p-4 z-10 shrink-0 " +
          (conversation?.status === "active" && quickReplies.length > 0
            ? ""
            : "border-t border-slate-800/50")
        }
      >
        {replyingTo && (
          <div className="mb-3 p-3 border border-slate-800 rounded-xl bg-slate-800/40 flex items-start justify-between gap-3 animate-slideUp relative overflow-hidden animate-fadeIn">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
            <div className="flex-1 min-w-0 pl-1.5">
              <span className="text-[10px] font-semibold text-amber-400 block mb-0.5">
                Membalas ke {replyingTo.sender === "customer" ? (conversation?.customer_name || formatPhone(conversation?.wa_number)) : (replyingTo.cs_name || "CS")}
              </span>
              <p className="text-xs text-slate-300 truncate font-normal">
                {replyingTo.content_type === "image" ? "[Gambar]" :
                 replyingTo.content_type === "video" ? "[Video]" :
                 replyingTo.content_type === "document" ? `[Dokumen] ${replyingTo.file_name || ""}` :
                 replyingTo.content}
              </p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {filePreview && (
          <div className="mb-3 p-2 border border-slate-700 rounded-xl bg-slate-800/50 flex items-center gap-3 w-max animate-slideUp">
            <img
              src={filePreview}
              alt="Preview"
              className="h-12 w-12 rounded-lg object-cover"
            />
            <span className="text-xs font-medium text-slate-300 max-w-[150px] truncate">
              {file?.name}
            </span>
            <button
              onClick={() => {
                setFile(null);
                setFilePreview(null);
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {file && !filePreview && (
          <div className="mb-3 p-3 border border-slate-700 rounded-xl bg-slate-800/50 flex items-center gap-3 w-max max-w-sm animate-slideUp">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300 shrink-0">
              <FileIcon size={20} />
            </div>
            <span className="text-xs font-medium text-slate-300 flex-1 truncate">
              {file.name}
            </span>
            <button
              onClick={() => {
                setFile(null);
                setFilePreview(null);
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div
          className={
            "relative flex items-end gap-2 p-2 rounded-2xl transition-all duration-200 " +
            (dragOver
              ? "bg-amber-500/10 border-2 border-dashed border-amber-500"
              : "bg-slate-900/80 border border-slate-700")
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Lampirkan file"
            className="shrink-0 p-3 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all cursor-pointer"
            title="Lampirkan File"
          >
            <Paperclip size={20} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-grow: reset to measure scrollHeight, then clamp to maxHeight.
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ketik balasan Anda..."
            aria-label="Ketik balasan"
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px" }}
            className="flex-1 resize-none bg-transparent py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />

          <button
            onClick={sendMessage}
            disabled={(!input.trim() && !file) || sending}
            aria-label="Kirim pesan"
            className={
              "shrink-0 p-3 rounded-xl transition-all duration-200 flex items-center justify-center " +
              ((!input.trim() && !file) || sending
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer")
            }
          >
            {sending ? (
              <span className="w-5 h-5 rounded-full border-2 border-slate-500 border-t-slate-300 animate-spin" />
            ) : (
              <Send
                size={20}
                className={input.trim() || file ? "translate-x-0.5" : ""}
              />
            )}
          </button>
        </div>
      </div>

      <Modal
        isOpen={resolveModal}
        onClose={() => setResolveModal(false)}
        type="warning"
        isConfirm
        title="Selesaikan Percakapan"
        message="Berikan catatan penyelesaian (opsional) sebelum menutup percakapan ini. Customer akan otomatis diminta memberikan rating 1-5 via WhatsApp."
        confirmText="Selesaikan"
        cancelText="Batal"
        onConfirm={handleResolve}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-300 font-semibold mb-2">
              Catatan Penyelesaian (Opsional)
            </label>
            <textarea
              value={resolveReview}
              onChange={(e) => setResolveReview(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 resize-none h-24"
              placeholder="Contoh: Kendala paket tertunda sudah diatasi..."
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal((m) => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />

      <Modal
        isOpen={notesOpen}
        onClose={() => setNotesOpen(false)}
        title="Catatan Customer"
      >
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs text-slate-500">
              Riwayat catatan untuk {formatPhone(conversation.wa_number)}
            </p>
            <button
              onClick={openEditNote}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer shrink-0"
            >
              <Pencil size={13} />
              Edit Catatan Chat Ini
            </button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 -mx-1 px-1">
            {notesLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <span className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin mr-2" />
                <span className="text-xs">Memuat catatan...</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
                <StickyNote size={28} className="text-slate-600" aria-hidden="true" />
                <span className="text-xs">Belum ada catatan untuk nomor ini</span>
              </div>
            ) : (
              notes.map((n) => {
                const isCurrent = n.conversation_id === conversation.id;
                return (
                  <div
                    key={n.conversation_id}
                    className={
                      "rounded-xl border p-3 " +
                      (isCurrent
                        ? "bg-amber-500/5 border-amber-500/30"
                        : "bg-slate-900 border-slate-800")
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-300 truncate">
                          {n.author_name || "CS"}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/25 font-semibold">
                            Chat ini
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.rating != null && (
                          <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                            <Star size={11} className="fill-amber-400" />
                            {n.rating}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">{timeAgo(n.updated_at)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">{n.note}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editNoteOpen}
        onClose={() => setEditNoteOpen(false)}
        title="Edit Catatan"
      >
        <div className="mt-2 space-y-4">
          <p className="text-xs text-slate-500">
            Catatan ini terlihat oleh semua CS pada chat dengan {formatPhone(conversation.wa_number)}.
          </p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            aria-label="Isi catatan"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 resize-none h-32"
            placeholder="Contoh: Customer minta dihubungi setelah jam 5 sore..."
          />
          <button
            onClick={handleSaveNote}
            disabled={noteSaving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-2.5 text-sm font-semibold text-slate-950 transition-all disabled:opacity-50 cursor-pointer"
          >
            {noteSaving ? (
              <span className="w-4 h-4 rounded-full border-2 border-slate-700 border-t-slate-900 animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            Simpan Catatan
          </button>
        </div>
      </Modal>
    </div>
  );
}
