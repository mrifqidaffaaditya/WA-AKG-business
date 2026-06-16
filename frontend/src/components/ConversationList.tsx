"use client";

import { useMemo, forwardRef, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { formatPhone, timeAgo } from "@/lib/utils";

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved" | "hold";
  claimed_by: string | null;
  claimed_by_name?: string | null;
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
  search?: string;
  onSearchChange?: (v: string) => void;
  activeTab?: "waiting" | "mine" | "all";
  onTabChange?: (tab: "waiting" | "mine" | "all") => void;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  waiting: { label: "Waiting", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  active: { label: "Active", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
  bot: { label: "Bot", color: "bg-sky-500/10 text-sky-400 border-sky-500/20", dot: "bg-sky-400" },
  resolved: { label: "Selesai", color: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-500" },
  hold: { label: "On Hold", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-400" },
};

function avatarGradient(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const gradients = [
    "from-amber-500/30 to-amber-600/30",
    "from-sky-500/30 to-sky-600/30",
    "from-rose-500/30 to-rose-600/30",
    "from-amber-500/30 to-orange-600/30",
    "from-rose-500/30 to-pink-600/30",
    "from-sky-500/30 to-amber-600/30",
  ];
  return gradients[hash % gradients.length];
}

function SkeletonCard() {
  return (
    <div className="w-full p-3 rounded-xl bg-slate-800/20 border border-slate-800/30 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-700/50 shimmer" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-24 rounded-full bg-slate-700/50 shimmer" />
            <div className="h-2.5 w-16 rounded-full bg-slate-700/30 shimmer" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="h-2 w-8 rounded-full bg-slate-700/30 shimmer" />
          <div className="h-3 w-14 rounded-md bg-slate-700/30 shimmer" />
        </div>
      </div>
      <div className="h-2.5 w-44 rounded-full bg-slate-700/20 shimmer ml-10" />
    </div>
  );
}

const ConvRow = forwardRef<HTMLDivElement, {
  conv: Conversation;
  isSelected: boolean;
  onSelect: (conv: Conversation) => void;
}>(({ conv, isSelected, onSelect }, ref) => {
  const status = statusConfig[conv.status] || statusConfig.bot;
  const displayName = conv.customer_name || formatPhone(conv.wa_number);

  return (
    <div ref={ref} className="px-2 pb-1">
      <button
        onClick={() => onSelect(conv)}
        className={
          "w-full text-left p-3 rounded-xl transition-all duration-200 cursor-pointer border " +
          (isSelected
            ? "bg-amber-500/10 border-amber-500/30 shadow-sm"
            : "bg-transparent border-transparent hover:bg-slate-800/30 hover:border-slate-700/40 hover:shadow-sm")
        }
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br ${
                  isSelected
                    ? "from-amber-500/40 to-amber-600/40 text-white border border-amber-500/30"
                    : avatarGradient(displayName) + " text-slate-200 border border-slate-700"
                }`}
              >
                {displayName[0].toUpperCase()}
              </div>
              {conv.unread && conv.unread > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold px-1 shadow-sm border-2 border-slate-950">
                  {conv.unread > 99 ? "99+" : conv.unread}
                </span>
              ) : null}
              {conv.status === "active" && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-slate-950 animate-pulse-dot" />
              )}
            </div>
            <div className="min-w-0">
              <span
                className={
                  "text-sm font-semibold truncate block " +
                  (isSelected ? "text-amber-400" : "text-slate-200")
                }
              >
                {displayName}
              </span>
              <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                {formatPhone(conv.wa_number)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
              {timeAgo(conv.updated_at)}
            </span>
            <div className="flex items-center gap-1">
              {conv.total_sessions != null && conv.total_sessions > 1 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                  {conv.total_sessions}x
                </span>
              )}
              <span
                className={
                  "flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-semibold border " +
                  status.color
                }
              >
                <span
                  className={
                    "w-1.5 h-1.5 rounded-full " + status.dot +
                    (conv.status === "active" ? " animate-pulse-dot" : "")
                  }
                />
                {status.label}
              </span>
            </div>
          </div>
        </div>

        {conv.last_message && (
          <p
            className={
              "text-xs truncate ml-11 " +
              (isSelected ? "text-slate-300" : "text-slate-500")
            }
          >
            {conv.last_message}
          </p>
        )}
      </button>
    </div>
  );
});
ConvRow.displayName = "ConvRow";

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onLoadMore,
  hasMore,
  loading,
  search = "",
  onSearchChange,
  activeTab,
  onTabChange,
}: ConversationListProps) {
  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
        c.wa_number.includes(q) ||
        (c.last_message && c.last_message.toLowerCase().includes(q))
    );
  }, [conversations, search]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !loading && !search.trim()) {
      onLoadMore();
    }
  }, [hasMore, loading, search, onLoadMore]);

  const itemContent = useCallback(
    (_: number, conv: Conversation) => (
      <ConvRow conv={conv} isSelected={conv.id === selectedId} onSelect={onSelect} />
    ),
    [selectedId, onSelect]
  );

  const Footer = useCallback(() => {
    if (loading && conversations.length > 0) {
      return (
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
            <span className="text-[11px] font-medium text-slate-300">
              Memuat...
            </span>
          </div>
        </div>
      );
    }
    if (!loading && hasMore && !search.trim()) {
      return (
        <div className="py-4 text-center">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            Scroll untuk lebih banyak
          </span>
        </div>
      );
    }
    return null;
  }, [loading, hasMore, search, conversations.length]);

  const EmptyPlaceholder = useCallback(() => {
    if (filtered.length > 0) return null;
    if (loading) {
      return (
        <div className="p-2 space-y-1">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500 animate-fadeIn">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <span className="text-xs font-medium">{search ? "Tidak ada hasil" : "Belum ada percakapan"}</span>
      </div>
    );
  }, [filtered.length, loading, search]);

  return (
    <div className="h-full bg-slate-950 flex flex-col">
      <div className="shrink-0 bg-slate-950 border-b border-slate-800/50">
        <div className="px-3 py-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Percakapan</h2>
          <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
            {conversations.length}
          </span>
        </div>
        {activeTab && onTabChange && (
          <div className="px-3 pb-2.5">
            <div className="flex items-center gap-1">
              {(["mine", "waiting", "all"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => onTabChange(tab)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
                    activeTab === tab
                      ? "bg-amber-500/10 text-amber-400"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                  }`}
                >
                  {tab === "mine" ? "My Chat" : tab === "waiting" ? "Antrean" : "Semua"}
                </button>
              ))}
            </div>
            {onSearchChange && (
              <div className="relative mt-2">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Cari nama, nomor, atau pesan..."
                  aria-label="Cari percakapan"
                  className="w-full rounded-lg bg-slate-800/50 border border-slate-700/60 pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                />
                {search && (
                  <button
                    onClick={() => onSearchChange("")}
                    aria-label="Hapus pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <Virtuoso
          style={{ height: "100%" }}
          data={filtered}
          computeItemKey={(_, conv) => conv.id}
          itemContent={itemContent}
          endReached={handleEndReached}
          increaseViewportBy={200}
          components={{
            Footer,
            EmptyPlaceholder,
          }}
        />
      </div>
    </div>
  );
}
