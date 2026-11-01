"use client";

import React, { useEffect, useRef, useState } from "react";
import { PartyMessage, Profile } from "@/types/database";
import { ChevronRight, MessageSquare, Send } from "lucide-react";

interface PartyChatDrawerProps {
  messages: PartyMessage[];
  currentUser: Profile;
  onSendMessage: (content: string) => Promise<void>;
  onInputFocusChange?: (isFocused: boolean) => void;
}

export function PartyChatDrawer({
  messages,
  currentUser,
  onSendMessage,
  onInputFocusChange,
}: PartyChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");
    await onSendMessage(text);
  };

  return (
    <aside
      className={`flex flex-col rounded-2xl border border-slate-800/90 bg-slate-900/80 transition-all ${
        isOpen ? "w-full lg:w-80" : "w-full lg:w-14"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-3">
        {isOpen ? (
          <>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Party Chat ({messages.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className=" hidden rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:inline-flex"
              title="Collapse chat drawer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mx-auto flex flex-col items-center gap-1 py-1 text-slate-400 hover:text-white"
            title="Expand Party Chat"
          >
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            <span className="text-[10px] font-bold">{messages.length}</span>
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div
            ref={scrollRef}
            className="flex-1 space-y-2.5 overflow-y-auto p-3.5"
            style={{ minHeight: "260px", maxHeight: "420px" }}
          >
            {messages.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-slate-500">
                <MessageSquare className="mb-2 h-6 w-6 text-slate-700" />
                <p>Say hello to your team!</p>
                <p className="mt-1 text-[10px] text-slate-600">
                  Clicking the chat box automatically pauses Unity keyboard
                  capture so you can type freely.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.user_id === currentUser.id;
                const senderName =
                  m.profile?.username || (isMe ? currentUser.username : "Guest");
                const senderAvatar =
                  m.profile?.avatar_url ||
                  (isMe
                    ? currentUser.avatar_url
                    : `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${m.user_id}`);

                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 ${
                      isMe ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={senderAvatar}
                      alt={senderName}
                      className="mt-0.5 h-6 w-6 shrink-0 rounded-md bg-slate-800"
                    />
                    <div
                      className={`max-w-[78%] rounded-xl px-3 py-2 text-xs ${
                        isMe
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-800 bg-slate-950 text-slate-200"
                      }`}
                    >
                      <div
                        className={`mb-0.5 text-[10px] font-semibold ${
                          isMe ? "text-indigo-200" : "text-indigo-400"
                        }`}
                      >
                        {senderName}
                      </div>
                      <p className="break-words leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-800 p-2.5"
          >
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => onInputFocusChange?.(true)}
                onBlur={() => onInputFocusChange?.(false)}
                placeholder="Message party..."
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500"
                title="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
