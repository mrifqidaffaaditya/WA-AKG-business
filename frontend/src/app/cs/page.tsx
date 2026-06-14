"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import Modal from "@/components/Modal";
import { useAuth } from "@/hooks/useAuth";
import { setupPushNotifications, showBrowserNotification } from "@/lib/push";
import { connect, getIO } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import { playBeep } from "@/lib/utils";
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
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
              <span className="text-sm">Memuat...</span>
            </div>
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

  const [activeTab, setActiveTab] = useState<TabType>(tabParam || "all");
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
  const activeTabRef = useRef<TabType>(activeTab);
  const selectedIdRef = useRef<string | null>(selectedId);
  const userRef = useRef(user);
  const conversationsRef = useRef(conversations);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

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

      const currentTab = activeTabRef.current;

      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        
        // Add to list if we are in 'all' or 'waiting'
        if (currentTab === "all" || currentTab === "waiting") {
          return [conv, ...prev];
        }
        return prev;
      });

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
      
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId === data.conversationId) {
        setSelectedConv((prev) =>
          prev ? { ...prev, status: "active", claimed_by: data.claimedBy } : null
        );
      }
    });

    socket.on(
      "conversation:status",
      (data: { conversationId: string; status: Conversation["status"]; claimedBy?: string }) => {
        setConversations((prev) => {
          if (prev.some((c) => c.id === data.conversationId)) {
            return prev.map((c) => (c.id === data.conversationId ? { ...c, status: data.status, ...(data.claimedBy ? { claimed_by: data.claimedBy } : {}) } : c));
          }
          return prev;
        });
        
        // Fetch if missing (e.g., claimed by us or transferred)
        apiFetch("/api/conversations/" + data.conversationId)
          .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
          .then(resData => {
            const conv = resData.conversation || resData;
            if (!conv || !conv.id) return;
            setConversations(prev => {
              if (prev.some(c => c.id === conv.id)) return prev;
              const tab = activeTabRef.current;
              if (tab === "all" || (tab === "mine" && conv.claimed_by === user?.id)) {
                return [conv, ...prev];
              }
              return prev;
            });
          }).catch(() => {});
        
        const currentSelectedId = selectedIdRef.current;
        if (currentSelectedId === data.conversationId) {
          setSelectedConv((prev) =>
            prev ? { ...prev, status: data.status, ...(data.claimedBy ? { claimed_by: data.claimedBy } : {}) } : null
          );
        }
      }
    );

    socket.on("conversation:message", (data: any) => {
      const msg = data.message || data;
      const currentSelectedId = selectedIdRef.current;
      
      const playNotify = (c: Conversation) => {
        if (msg.sender === "cs") return;
        if (c.status === "active" && c.claimed_by !== userRef.current?.id) return;
        if (c.status === "bot" || c.status === "resolved") return;
        
        const soundOn = localStorage.getItem("sound_enabled") !== "false";
        if (soundOn) {
          try { playBeep(); } catch {}
        }
        
        const isHidden = document.visibilityState === "hidden";
        if (currentSelectedId !== msg.conversation_id || isHidden) {
           showBrowserNotification(
             "Pesan Baru Masuk", 
             msg.content_type === "text" ? msg.content : "[Media diterima]",
             { url: "/cs?tab=all&chatId=" + msg.conversation_id }
           );
        }
      };

      const existingConv = conversationsRef.current.find(c => c.id === msg.conversation_id);
      if (existingConv) {
         playNotify(existingConv);
      }

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversation_id);
        if (idx !== -1) {
          const conv = prev[idx];
          const isCurrentlyOpen = currentSelectedId === conv.id;
          const updatedConv = {
            ...conv,
            last_message: msg.content_type === "text" ? msg.content : (msg.content_type ? `[${msg.content_type}]` : "Media"),
            updated_at: msg.created_at || new Date().toISOString(),
            unread: (!isCurrentlyOpen && msg.sender !== "cs") ? (conv.unread || 0) + 1 : conv.unread
          };
          
          const newArr = [...prev];
          newArr.splice(idx, 1);
          newArr.unshift(updatedConv); // Move to top
          return newArr;
        }
        return prev;
      });

      // If missing from list, fetch it and add it
      if (!existingConv) {
        apiFetch("/api/conversations/" + msg.conversation_id)
          .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
          .then(data => {
            const conv = data.conversation || data;
            if (!conv || !conv.id) return;
            
            playNotify(conv);
            
            setConversations(prev => {
              if (prev.some(c => c.id === conv.id)) return prev;
              const tab = activeTabRef.current;
              if (tab === "all" || (tab === "waiting" && conv.status === "waiting")) {
                 return [conv, ...prev];
              }
              return prev;
          });
        }).catch(() => {});
      }
    });

    return () => {
      socket.off("queue:update");
      socket.off("conversation:new");
      socket.off("conversation:claimed");
      socket.off("conversation:status");
      socket.off("conversation:message");
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedConv(null);
      return;
    }

    apiFetch("/api/conversations/" + selectedId)
      .then((res) => {
        if (!res.ok) {
          setSelectedConv(null);
          updateUrl(activeTab, null);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setSelectedConv(data.conversation || data);
        setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, unread: 0 } : c));
      })
      .catch(() => {
        setSelectedConv(null);
        updateUrl(activeTab, null);
      });
  }, [selectedId]);

  const updateUrl = (tab: TabType, chatId?: string | null) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (chatId) params.set("chatId", chatId);
    router.replace("/cs?" + params.toString(), { scroll: false });
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
      
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) {
          return prev.map(c => c.id === conv.id ? { ...c, status: "active", claimed_by: user?.id || null } : c);
        }
        return [{ ...conv, status: "active", claimed_by: user?.id || null }, ...prev];
      });
    } catch {
      // ignore
    }
  };

  return (
    <DashboardShell>
      <div className="flex-1 flex min-h-0 bg-[#0A0F1C]">
        <div className={"shrink-0 " + (selectedId ? "hidden md:block" : "block") + " w-full md:w-80"}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            loading={loading}
            activeTab={activeTab}
            onTabChange={(tab) => updateUrl(tab, selectedId)}
          />
        </div>

        <div className={selectedId ? "flex-1 flex flex-col min-w-0 min-h-0" : "hidden md:flex flex-1 flex-col min-w-0 min-h-0"}>
          <ChatWindow
            conversation={selectedConv}
            soundEnabled={soundEnabled}
            onBack={() => {
              setSelectedId(null);
              setSelectedConv(null);
              updateUrl(activeTab, null);
            }}
          />
        </div>
      </div>

      {newChatPopup && newChatPopup.visible && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-6">
          <div className="bg-[#0B1221] border border-emerald-500/30 rounded-2xl p-4 shadow-2xl shadow-emerald-500/10 max-w-sm flex flex-col">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner">
                <Bell size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-100 truncate">
                  Antrean Baru
                </h4>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {newChatPopup.conv.customer_name ||
                    newChatPopup.conv.wa_number}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => handleClaimFromPopup(newChatPopup.conv)}
                    className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all"
                  >
                    Claim Chat
                  </button>
                  <button
                    onClick={() => setNewChatPopup(null)}
                    className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
