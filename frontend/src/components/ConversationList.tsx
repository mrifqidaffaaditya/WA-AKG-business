"use client";

import { useRef, useCallback, useEffect } from "react";
import { formatPhone, timeAgo } from "@/lib/utils";

interface Conversation {
  id: string;
  wa_number: string;
  customer_name: string | null;
  status: "bot" | "waiting" | "active" | "resolved";
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
  activeTab?: "waiting" | "mine" | "all";
  onTabChange?: (tab: "waiting" | "mine" | "all") => void;
}

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  waiting: { label: "Waiting", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", dot: "bg-amber-500" },
  active: { label: "Active", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  bot: { label: "Bot", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400" },
  resolved: { label: "Resolved", color: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-500" },
};

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onLoadMore,
  hasMore,
  loading,
  activeTab,
  onTabChange,
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
      className="h-full overflow-y-auto bg-[#0A0F1C] border-r border-slate-800/60 custom-scrollbar"
    >
      {/* List Header */}
      <div className="sticky top-0 z-10 bg-[#0A0F1C]/95 backdrop-blur-md border-b border-slate-800/60 pb-2">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Percakapan</h2>
          <span className="text-[10px] font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
            {conversations.length} total
          </span>
        </div>
        
        {/* Tabs */}
        {activeTab && onTabChange && (
          <div className="px-4 flex items-center gap-1">
            <button
              onClick={() => onTabChange("mine")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === "mine" ? "bg-emerald-500/15 text-emerald-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"}`}
            >
              My Chat
            </button>
            <button
              onClick={() => onTabChange("waiting")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === "waiting" ? "bg-emerald-500/15 text-emerald-400 relative" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"}`}
            >
              Antrean
            </button>
            <button
              onClick={() => onTabChange("all")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === "all" ? "bg-emerald-500/15 text-emerald-400" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-300"}`}
            >
              Semua
            </button>
          </div>
        )}
      </div>

      {conversations.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <span className="text-xs font-medium">Belum ada percakapan</span>
        </div>
      )}

      <div className="p-2 space-y-1">
        {conversations.map((conv) => {
          const status = statusConfig[conv.status] || statusConfig.bot;
          const isSelected = conv.id === selectedId;

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={
                "w-full text-left p-3 rounded-xl transition-all duration-200 cursor-pointer group " +
                (isSelected
                  ? "bg-emerald-500/10 border border-emerald-500/30 shadow-sm"
                  : "bg-transparent border border-transparent hover:bg-slate-800/40 hover:border-slate-700/50")
              }
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative shrink-0">
                    <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-inner " + 
                      (isSelected ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 border border-slate-700")}>
                      {(conv.customer_name || "G")[0].toUpperCase()}
                    </div>
                    {conv.unread && conv.unread > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold px-1 shadow-sm border border-slate-900">
                        {conv.unread}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={"text-sm font-semibold truncate " + (isSelected ? "text-emerald-400" : "text-slate-200 group-hover:text-emerald-300 transition-colors")}>
                        {conv.customer_name || formatPhone(conv.wa_number)}
                      </span>
                      {conv.status === "active" && conv.claimed_by_name && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 truncate max-w-[80px]">
                          {conv.claimed_by_name}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 truncate">
                      {formatPhone(conv.wa_number)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                    {timeAgo(conv.updated_at)}
                  </span>
                  <div className="flex items-center gap-1">
                    {conv.total_sessions != null && conv.total_sessions > 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                        {conv.total_sessions}x
                      </span>
                    )}
                    <span className={"flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md font-semibold border " + status.color}>
                      <span className={"w-1.5 h-1.5 rounded-full " + status.dot} />
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>

              {conv.last_message && (
                <p className={"text-xs truncate ml-10 " + (isSelected ? "text-slate-300" : "text-slate-500")}>
                  {conv.last_message}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm shadow-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
            <span className="text-[11px] font-medium text-slate-300">Memuat...</span>
          </div>
        </div>
      )}

      {!loading && hasMore && (
        <div className="py-4 text-center">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Scroll untuk lebih banyak</span>
        </div>
      )}
    </div>
  );
}
