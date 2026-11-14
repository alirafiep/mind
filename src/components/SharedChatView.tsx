import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquarePlus } from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ChatMessage, ChatSession, LanguagePreference } from '../types/app';

export function SharedChatView({
  shareId,
  onExitShare,
}: {
  shareId: string;
  onExitShare: () => void;
}) {
  const { createNewChat, saveChat } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    id: string;
    title: string;
    authorName: string;
    language: LanguagePreference;
    messages: ChatMessage[];
    sharedAt: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getSharedChat(shareId)
      .then((res) => setSnapshot(res.snapshot))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load shared chat.'))
      .finally(() => setLoading(false));
  }, [shareId]);

  const handleContinueInChat = async () => {
    if (!snapshot) return;
    const newChat = createNewChat(false);
    const cloned: ChatSession = {
      ...newChat,
      title: snapshot.title,
      language: snapshot.language,
      messages: snapshot.messages,
      updatedAt: Date.now(),
    };
    await saveChat(cloned);
    onExitShare();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onExitShare}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to MindMaster AI</span>
          </button>

          {snapshot && (
            <button
              type="button"
              onClick={() => void handleContinueInChat()}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Continue Conversation</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading shared conversation...</span>
          </div>
        ) : error || !snapshot ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-red-500">
            {error || 'Shared conversation unavailable.'}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {snapshot.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Shared by {snapshot.authorName} · {new Date(snapshot.sharedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-4">
              {snapshot.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 sm:p-5 rounded-2xl border ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white border-indigo-600 ml-8'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
