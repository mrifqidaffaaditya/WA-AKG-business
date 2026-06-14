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
  created_at: string;
}

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved";
  claimed_by: string | null;
  claimed_by_name?: string | null;
  total_sessions?: number;
}

interface ChatWindowProps {
  conversation: Conversation | null;
  soundEnabled?: boolean;
  onBack?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  active: { label: "Active", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  resolved: { label: "Selesai", color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  bot: { label: "Bot", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

function avatarGradient(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const gradients = [
    "from-emerald-500/40 to-teal-600/40",
    "from-blue-500/40 to-cyan-600/40",
    "from-violet-500/40 to-purple-600/40",
    "from-amber-500/40 to-orange-600/40",
    "from-rose-500/40 to-pink-600/40",
    "from-sky-500/40 to-indigo-600/40",
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

  const messageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

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

    socket.on("conversation:message", handleMessage);
    return () => { socket.off("conversation:message", handleMessage); };
  }, [conversation, scrollToBottom]);

  const sendMessage = async () => {
    if (!conversation || (!input.trim() && !file)) return;

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
        return;
      }
    }

    const body: Record<string, unknown> = {
      content: input.trim(),
      contentType,
      ...(fileData && { fileData, fileName }),
    };

    setInput("");
    setFile(null);
    setFilePreview(null);

    try {
      const res = await apiFetch("/api/conversations/" + conversation.id + "/messages", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Gagal mengirim");
      scrollToBottom("smooth");
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal mengirim pesan", type: "error" });
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) setFilePreview(URL.createObjectURL(f));
    else setFilePreview(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) setFilePreview(URL.createObjectURL(f));
    else setFilePreview(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A0F1C]">
        <div className="text-center animate-scaleUp">
          <div className="w-20 h-20 rounded-2xl bg-[#0B1221] border border-slate-800/50 shadow-xl flex items-center justify-center mx-auto mb-6">
            <Clock size={36} className="text-slate-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-300 mb-1">Tidak Ada Obrolan</h2>
          <p className="text-slate-500 text-sm">Pilih percakapan dari daftar di samping</p>
        </div>
      </div>
    );
  }

  const isOwnClaim = conversation.status === "active" && conversation.claimed_by === user?.id;
  const st = statusConfig[conversation.status] || statusConfig.bot;
  const displayName = conversation.customer_name || formatPhone(conversation.wa_number);

  return (
    <div className="flex-1 flex flex-col bg-[#0A0F1C] min-w-0 min-h-0 relative">
      <div className="flex items-center gap-2 px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-800/50 glass shrink-0 z-10">
        {onBack && (
          <button
            onClick={onBack}
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
            {conversation.status === "active" && conversation.claimed_by && (
              <span className="ml-1.5 text-[9px] text-emerald-400/80">
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
              className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-600 transition-all duration-200 disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
            >
              <CheckCircle size={14} />
              <span className="hidden sm:inline">Claim</span>
            </button>
          )}
          {(conversation.status === "active" ||
            conversation.status === "waiting") &&
            (isOwnClaim || user?.role !== "cs") && (
              <button
                onClick={() => setResolveModal(true)}
                className="flex items-center gap-1 rounded-lg bg-slate-800/80 border border-slate-700 px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all duration-200 cursor-pointer"
              >
                <CheckCircle size={14} />
                <span className="hidden sm:inline">Resolve</span>
              </button>
            )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
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
                  className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-700 transition-colors cursor-pointer"
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
                <div className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-emerald-500 animate-spin" />
                <span className="text-[12px] font-medium text-slate-300">
                  Memuat riwayat...
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
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
                  "flex w-full animate-bubble-in " +
                  (isCustomer || isBot ? "justify-start" : "justify-end")
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
                        ? "bg-blue-500/10 text-blue-100 border border-blue-500/20 rounded-tl-sm"
                        : isMine
                        ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-tr-sm shadow-lg shadow-emerald-900/20"
                        : "bg-slate-700/80 text-slate-100 border border-slate-600/50 rounded-tr-sm")
                    }
                  >
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
                            ? "bg-emerald-700 hover:bg-emerald-800"
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
                              (isMine ? "text-emerald-200" : "text-slate-400")
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
                        (isMine ? "text-emerald-200" : "text-slate-400")
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
          className="absolute bottom-[90px] right-6 z-20 flex items-center gap-2 rounded-full bg-emerald-500 pl-3 pr-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/40 hover:bg-emerald-600 hover:-translate-y-0.5 transition-all animate-slide-in-from-bottom cursor-pointer"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
            <ArrowDown size={14} />
          </div>
          Ada Pesan Baru
        </button>
      )}

      {conversation?.status === "active" && quickReplies.length > 0 && (
        <div className="bg-[#0B1221]/90 backdrop-blur-sm border-t border-slate-800/50 px-4 py-3 flex gap-2 overflow-x-auto shrink-0 z-10">
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
          "bg-[#0B1221]/90 backdrop-blur-sm p-3 sm:p-4 z-10 shrink-0 " +
          (conversation?.status === "active" && quickReplies.length > 0
            ? ""
            : "border-t border-slate-800/50")
        }
      >
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
              ? "bg-emerald-500/10 border-2 border-dashed border-emerald-500"
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
            className="shrink-0 p-3 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all cursor-pointer"
            title="Lampirkan File"
          >
            <Paperclip size={20} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik balasan Anda..."
            rows={1}
            style={{ minHeight: "44px", maxHeight: "120px" }}
            className="flex-1 resize-none bg-transparent py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />

          <button
            onClick={sendMessage}
            disabled={!input.trim() && !file}
            className={
              "shrink-0 p-3 rounded-xl transition-all duration-200 flex items-center justify-center " +
              (!input.trim() && !file
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer")
            }
          >
            <Send
              size={20}
              className={input.trim() || file ? "translate-x-0.5" : ""}
            />
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
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none h-24"
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
    </div>
  );
}
