"use client";

import { useRef, useCallback, useEffect } from "react";
import { formatPhone, timeAgo } from "@/lib/utils";

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved";
  claimed_by: string | null;
  updated_at: string;
  last_message?: string;
  unread?: number;
  total_sessions?: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  badge?: "returning" | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: "bg-amber-500/15 text-amber-400" },
  active: { label: "Active", color: "bg-emerald-500/15 text-emerald-400" },
  bot: { label: "Bot", color: "bg-blue-500/15 text-blue-400" },
  resolved: { label: "Resolved", color: "bg-slate-500/15 text-slate-400" },
};

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onLoadMore,
  hasMore,
  loading,
}: ConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto bg-slate-950 border-r border-slate-800"
    >
      {conversations.length === 0 && !loading && (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          Belum ada percakapan
        </div>
      )}

      {conversations.map((conv) => {
        const status = statusConfig[conv.status] || statusConfig.bot;
        const isSelected = conv.id === selectedId;

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={
              "w-full text-left px-4 py-3 border-b border-slate-800/50 transition-colors " +
              (isSelected
                ? "bg-slate-800"
                : "hover:bg-slate-900")
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">
                    {conv.customer_name || formatPhone(conv.wa_number)}
                  </span>
                  {conv.total_sessions != null && conv.total_sessions > 1 && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                      {conv.total_sessions}x
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatPhone(conv.wa_number)}
                </p>
              </div>
              <span
                className={
                  "shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                  status.color
                }
              >
                {status.label}
              </span>
            </div>

            {conv.last_message && (
              <p className="text-xs text-slate-400 mt-1.5 truncate">
                {conv.last_message}
              </p>
            )}

            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-slate-500">
                {timeAgo(conv.updated_at)}
              </span>
              {conv.unread && conv.unread > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-medium">
                  {conv.unread}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}

      {loading && (
        <div className="flex items-center justify-center py-4 text-slate-500 text-xs">
          <span className="animate-pulse">Memuat...</span>
        </div>
      )}
    </div>
  );
}
