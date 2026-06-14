"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import { formatPhone, timeAgo, playBeep } from "@/lib/utils";
import { getIO } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import {
  Send,
  Paperclip,
  X,
  Image,
  File,
  CheckCircle,
  ArrowDown,
  Clock,
} from "lucide-react";

interface Message {
  id: string;
  conversation_id: string;
  sender: "customer" | "bot" | "cs";
  cs_id: string | null;
  cs_name?: string | null;
  content: string;
  content_type?: "text" | "image" | "document" | "audio";
  created_at: string;
}

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved";
  claimed_by: string | null;
  total_sessions?: number;
}

interface ChatWindowProps {
  conversation: Conversation | null;
  soundEnabled?: boolean;
}

export default function ChatWindow({
  conversation,
  soundEnabled,
}: ChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
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
  const [claimLoading, setClaimLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const firstMessageRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = messageContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;

    if (atBottom) {
      setNewMessageBadge(false);
    }

    if (el.scrollTop < 50 && hasMore && !loadingMore && nextCursor) {
      el.style.overflowAnchor = "none";
      const prevHeight = el.scrollHeight;

      setLoadingMore(true);
      apiFetch(
        "/api/conversations/" +
          conversation?.id +
          "/messages?cursor=" +
          nextCursor +
          "&limit=30&direction=older"
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMsgs = data.messages.filter(
                (m: Message) => !existingIds.has(m.id)
              );
              firstMessageRef.current = newMsgs[newMsgs.length - 1]?.id || null;
              return [...newMsgs, ...prev];
            });
            setHasMore(data.has_more);
            setNextCursor(data.next_cursor);
          }
        })
        .finally(() => {
          setLoadingMore(false);
          requestAnimationFrame(() => {
            if (el) {
              el.scrollTop = el.scrollHeight - prevHeight;
              el.style.overflowAnchor = "";
            }
          });
        });
    }
  }, [hasMore, loadingMore, nextCursor, conversation?.id]);

  useEffect(() => {
    const el = messageContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

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
    firstMessageRef.current = null;

    apiFetch(
      "/api/conversations/" +
        conversation.id +
        "/messages?limit=30&direction=older"
    )
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || []);
        setHasMore(data.has_more);
        setNextCursor(data.next_cursor);
      })
      .catch(() => {
        setMessages([]);
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => scrollToBottom("auto"), 50);
      });

    return () => {};
  }, [conversation?.id]);

  useEffect(() => {
    const socket = getIO();
    if (!socket || !conversation) return;

    const handleMessage = (data: { conversationId: string; message: Message }) => {
      const msg = data.message || (data as any);
      if (msg.conversation_id !== conversation.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if (msg.sender !== "cs" && soundEnabled) {
        playBeep();
      }

      if (isAtBottomRef.current) {
        setTimeout(() => scrollToBottom("smooth"), 50);
      } else if (msg.sender !== "cs") {
        setNewMessageBadge(true);
      }
    };

    socket.on("conversation:message", handleMessage);

    return () => {
      socket.off("conversation:message", handleMessage);
    };
  }, [conversation, soundEnabled, scrollToBottom]);

  const sendMessage = async () => {
    if (!conversation || (!input.trim() && !file)) return;

    const body: Record<string, unknown> = {
      content: input.trim(),
      contentType: "text",
    };

    setInput("");
    setFile(null);
    setFilePreview(null);

    try {
      const res = await apiFetch(
        "/api/conversations/" + conversation.id + "/messages",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error("Gagal mengirim");
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal mengirim pesan",
        type: "error",
      });
    }
  };

  const handleClaim = async () => {
    if (!conversation) return;
    setClaimLoading(true);
    try {
      const res = await apiFetch(
        "/api/conversations/" + conversation.id + "/claim",
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Claim failed");
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal mengklaim percakapan",
        type: "error",
      });
    } finally {
      setClaimLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!conversation) return;
    try {
      const res = await apiFetch(
        "/api/conversations/" + conversation.id + "/resolve",
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Resolve failed");
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal menyelesaikan percakapan",
        type: "error",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(null);
    }
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
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Clock size={28} className="text-slate-500" />
          </div>
          <p className="text-slate-500 text-sm">Pilih percakapan</p>
        </div>
      </div>
    );
  }

  const isOwnClaim =
    conversation.status === "active" && conversation.claimed_by === user?.id;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-200 truncate">
              {conversation.customer_name || formatPhone(conversation.wa_number)}
            </h3>
            <span
              className={
                "shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                (conversation.status === "waiting"
                  ? "bg-amber-500/15 text-amber-400"
                  : conversation.status === "active"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : conversation.status === "resolved"
                  ? "bg-slate-500/15 text-slate-400"
                  : "bg-blue-500/15 text-blue-400")
              }
            >
              {conversation.status === "waiting"
                ? "Waiting"
                : conversation.status === "active"
                ? "Active"
                : conversation.status === "resolved"
                ? "Resolved"
                : "Bot"}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {formatPhone(conversation.wa_number)}
            {conversation.total_sessions != null && conversation.total_sessions > 1 && (
              <span className="ml-2 inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">
                Pelanggan Lama ({conversation.total_sessions}x)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {conversation.status === "waiting" && (
            <button
              onClick={handleClaim}
              disabled={claimLoading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              <CheckCircle size={14} />
              {claimLoading ? "..." : "Claim"}
            </button>
          )}
          {(conversation.status === "active" || conversation.status === "waiting") &&
            (isOwnClaim || user?.role !== "cs") && (
              <button
                onClick={() => setResolveModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
              >
                <X size={14} />
                Resolve
              </button>
            )}
        </div>
      </div>

      <div
        ref={messageContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {loadingMore && (
          <div className="text-center text-xs text-slate-500 py-2 animate-pulse">
            Memuat pesan...
          </div>
        )}

        {!hasMore && messages.length > 0 && (
          <div className="text-center text-[10px] text-slate-600 py-2">
            Awal percakapan
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-slate-500 animate-pulse">Memuat...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-slate-500">Belum ada pesan</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isCustomer = msg.sender === "customer";
            const isBot = msg.sender === "bot";
            const isCs = msg.sender === "cs";
            const isMine = isCs && msg.cs_id === user?.id;

            return (
              <div
                key={msg.id}
                className={
                  "flex " +
                  (isCustomer || isBot ? "justify-start" : "justify-end")
                }
              >
                <div
                  className={
                    "max-w-[75%] rounded-xl px-3.5 py-2.5 " +
                    (isCustomer
                      ? "bg-slate-800 text-slate-200"
                      : isBot
                      ? "bg-teal-500/15 text-teal-300 border border-teal-500/20"
                      : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20")
                  }
                >
                  {isCs && !isMine && msg.cs_name && (
                    <p className="text-[10px] text-slate-400 mb-0.5">{msg.cs_name}</p>
                  )}

                  {msg.content_type === "image" && (
                    <img
                      src={msg.content}
                      alt="Image"
                      className="max-w-[200px] rounded-lg mb-1"
                    />
                  )}

                  {msg.content_type === "document" && (
                    <a
                      href={msg.content}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-400 hover:underline mb-1"
                    >
                      <File size={14} />
                      Dokumen
                    </a>
                  )}

                  {msg.content && msg.content_type !== "image" && (
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  )}

                  <p className="text-[10px] mt-1 opacity-60 text-right">
                    {timeAgo(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {newMessageBadge && (
          <button
            onClick={() => {
              scrollToBottom("smooth");
              setNewMessageBadge(false);
            }}
            className="sticky bottom-0 mx-auto flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            <ArrowDown size={12} />
            Pesan baru
          </button>
        )}

        <div ref={bottomRef} />
      </div>

      {filePreview && (
        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-3">
          <img
            src={filePreview}
            alt="Preview"
            className="h-10 w-10 rounded-lg object-cover"
          />
          <span className="text-xs text-slate-400 truncate flex-1">
            {file?.name}
          </span>
          <button
            onClick={() => {
              setFile(null);
              setFilePreview(null);
            }}
            className="text-slate-500 hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {file && !filePreview && (
        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-3">
          <File size={16} className="text-slate-400" />
          <span className="text-xs text-slate-400 truncate flex-1">
            {file.name}
          </span>
          <button
            onClick={() => {
              setFile(null);
              setFilePreview(null);
            }}
            className="text-slate-500 hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div
        className={
          "border-t border-slate-800 px-4 py-3 " +
          (dragOver ? "bg-emerald-500/10" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Paperclip size={18} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan..."
            rows={1}
            className="flex-1 resize-none rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
          />

          <button
            onClick={sendMessage}
            disabled={!input.trim() && !file}
            className="shrink-0 rounded-lg bg-emerald-500 p-2 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <Modal
        isOpen={resolveModal}
        onClose={() => setResolveModal(false)}
        type="warning"
        isConfirm
        title="Selesaikan Percakapan"
        message="Anda yakin ingin menyelesaikan percakapan ini? Ringkasan akan dibuat otomatis."
        confirmText="Selesaikan"
        cancelText="Batal"
        onConfirm={handleResolve}
      />

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
