"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import Modal from "@/components/Modal";
import { useAuth } from "@/hooks/useAuth";
import { showBrowserNotification } from "@/lib/push";
import { setupPushNotifications } from "@/lib/push";
import { connect, getIO } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import { Bell } from "lucide-react";

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

type TabType = "waiting" | "mine" | "all";

export default function CSPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="flex items-center justify-center h-full text-slate-500">
            <span className="animate-pulse">Memuat...</span>
          </div>
        </DashboardShell>
      }
    >
      <CSContent />
    </Suspense>
  );
}

function CSContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const tabParam = searchParams.get("tab") as TabType | null;
  const chatIdParam = searchParams.get("chatId");

  const [activeTab, setActiveTab] = useState<TabType>(tabParam || "waiting");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(chatIdParam);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(
    typeof window !== "undefined"
      ? localStorage.getItem("sound_enabled") !== "false"
      : true
  );
  const [newChatPopup, setNewChatPopup] = useState<{
    conv: Conversation;
    visible: boolean;
  } | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(
    async (tab: TabType, reset = true) => {
      if (reset) setLoading(true);

      let url = "/api/conversations?limit=20";
      if (tab === "waiting") url += "&status=waiting";
      else if (tab === "mine") url += "&claimed_by=me";
      if (!reset && cursor) url += "&cursor=" + cursor;

      try {
        const res = await apiFetch(url);
        const data = await res.json();

        if (reset) {
          setConversations(data.conversations || []);
        } else {
          setConversations((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            const newConvs = (data.conversations || []).filter(
              (c: Conversation) => !ids.has(c.id)
            );
            return [...prev, ...newConvs];
          });
        }
        setCursor(data.next_cursor);
        setHasMore(data.has_more);
      } catch (err) {
        console.error("Fetch conversations error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor]
  );

  useEffect(() => {
    setSelectedId(null);
    setSelectedConv(null);
    setCursor(null);
    fetchConversations(activeTab, true);
  }, [activeTab]);

  useEffect(() => {
    setupPushNotifications();

    const socket = connect();

    socket.on("queue:update", (data: { count: number }) => {
      setQueueCount(data.count);
    });

    socket.on("conversation:new", (conv: Conversation) => {
      setQueueCount((prev) => prev + 1);

      if (activeTab === "waiting") {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) return prev;
          return [conv, ...prev];
        });
      }

      showBrowserNotification(
        "Customer Baru",
        (conv.customer_name || conv.wa_number) + " menunggu dilayani CS"
      );

      setNewChatPopup({ conv, visible: true });
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      popupTimerRef.current = setTimeout(() => {
        setNewChatPopup((prev) =>
          prev?.conv.id === conv.id ? { ...prev, visible: false } : prev
        );
      }, 6000);
    });

    socket.on("conversation:claimed", (data: { conversationId: string; claimedBy: string; status: string }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId
            ? { ...c, status: "active" as const, claimed_by: data.claimedBy }
            : c
        )
      );
      if (selectedId === data.conversationId) {
        setSelectedConv((prev) =>
          prev ? { ...prev, status: "active", claimed_by: data.claimedBy } : null
        );
      }
    });

    socket.on(
      "conversation:status",
      (data: { conversationId: string; status: Conversation["status"]; claimedBy?: string }) => {
        setConversations((prev) =>
          prev.map((c) => (c.id === data.conversationId ? { ...c, status: data.status, ...(data.claimedBy ? { claimed_by: data.claimedBy } : {}) } : c))
        );
        if (selectedId === data.conversationId) {
          setSelectedConv((prev) =>
            prev ? { ...prev, status: data.status, ...(data.claimedBy ? { claimed_by: data.claimedBy } : {}) } : null
          );
        }
      }
    );

    return () => {
      socket.off("queue:update");
      socket.off("conversation:new");
      socket.off("conversation:claimed");
      socket.off("conversation:status");
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedConv(null);
      return;
    }

    apiFetch("/api/conversations/" + selectedId)
      .then((res) => res.json())
      .then((data) => {
        setSelectedConv(data.conversation || data);
      })
      .catch(() => setSelectedConv(null));
  }, [selectedId]);

  const updateUrl = (tab: TabType, chatId?: string | null) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (chatId) params.set("chatId", chatId);
    router.replace("/cs?" + params.toString(), { scroll: false });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    updateUrl(tab, selectedId);
  };

  const handleSelect = (conv: Conversation) => {
    setSelectedId(conv.id);
    setSelectedConv(conv);
    updateUrl(activeTab, conv.id);
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchConversations(activeTab, false);
  };

  const handleClaimFromPopup = async (conv: Conversation) => {
    setNewChatPopup(null);
    try {
      await apiFetch("/api/conversations/" + conv.id + "/claim", {
        method: "POST",
      });
      setSelectedId(conv.id);
      setSelectedConv({ ...conv, status: "active", claimed_by: user?.id || null });
      updateUrl(activeTab, conv.id);
    } catch {
      // ignore
    }
  };

  const tabs: { key: TabType; label: string; badge?: number }[] = [
    { key: "waiting", label: "Waiting", badge: queueCount },
    { key: "mine", label: "My Chats" },
    { key: "all", label: "All" },
  ];

  return (
    <DashboardShell>
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b border-slate-800 px-4 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={
                "relative px-4 py-2.5 text-sm font-medium transition-colors " +
                (activeTab === tab.key
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-200")
              }
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[10px] font-bold text-white px-1">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 flex min-h-0">
          <div className={"shrink-0 " + (selectedId ? "hidden md:block" : "block") + " w-full md:w-80"}>
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={handleSelect}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              loading={loading}
            />
          </div>

          <div className={selectedId ? "flex-1" : "hidden md:flex flex-1"}>
            <ChatWindow
              conversation={selectedConv}
              soundEnabled={soundEnabled}
            />
          </div>
        </div>
      </div>

      {newChatPopup && newChatPopup.visible && (
        <div className="fixed bottom-6 right-6 z-40 animate-slideUp">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl max-w-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Bell size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Percakapan Baru
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {newChatPopup.conv.customer_name ||
                    newChatPopup.conv.wa_number}
                </p>
                <button
                  onClick={() => handleClaimFromPopup(newChatPopup.conv)}
                  className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
                >
                  Claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
