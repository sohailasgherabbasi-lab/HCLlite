import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../api/client.ts';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  Wrench,
  ShieldCheck,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  toolCalls?: string[];
  isFallback?: boolean;
  time: string;
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'assistant',
      text: `Hello ${user?.name || 'there'}! I am HCM Lite AI, your organizational intelligence assistant. I query live company data with strict role-based access control.\n\nAsk me about attendance, who is on leave, remaining leave balances, headcount, payroll insights, or company policy!`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: 'usr_' + Date.now(),
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.aiChat(text);
      const botMsg: Message = {
        id: 'bot_' + Date.now(),
        sender: 'assistant',
        text: res.reply,
        toolCalls: res.toolCalls,
        isFallback: res.isFallback,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: 'err_' + Date.now(),
        sender: 'assistant',
        text: err.message || 'Sorry, I encountered an issue processing your request.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    { label: 'Who is on leave today?', query: 'Who is on leave today?' },
    { label: 'How many sick leaves do I have left?', query: 'How many sick leaves do I have left this year?' },
    { label: "What is this month's attendance rate?", query: "What is this month's attendance rate?" },
    { label: 'Who came late most often this month?', query: 'Who came late most often this month?' },
    { label: "What is colleague's salary?", query: "What is my colleague Ali's salary?" },
    { label: '🇵🇰 Mera leave balance kitna hai?', query: 'Mera leave balance kitna hai?' },
    { label: '🇵🇰 Aj kon chutti par hai?', query: 'Aj kon chutti par hai?' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm text-neutral-900 dark:text-white leading-tight">
                  HCM Lite Assistant
                </h3>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-900">
                  AI-powered
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Grounding in live database · {user?.role.toUpperCase()} scope
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick judge sample questions */}
        <div className="px-3 py-2 bg-neutral-100/70 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <span className="text-[10px] font-semibold text-neutral-400 shrink-0">Try:</span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p.query)}
              className="text-[11px] whitespace-nowrap px-2 py-1 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-neutral-200 dark:border-neutral-700 rounded-md transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chat message stream */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div key={m.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
                    isUser
                      ? 'bg-neutral-800 text-white dark:bg-neutral-700'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'text-right' : 'text-left'}`}>
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed inline-block text-left ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-tr-xs'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-tl-xs whitespace-pre-wrap'
                    }`}
                  >
                    {m.text}
                  </div>

                  {/* Tool execution badge & AI Generated Label */}
                  {!isUser && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                      <span className="flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                        <ShieldCheck className="w-3 h-3" />
                        <span>AI-generated</span>
                      </span>

                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Wrench className="w-2.5 h-2.5" />
                          <span>Tools: {m.toolCalls.join(', ')}</span>
                        </div>
                      )}

                      <span>·</span>
                      <span>{m.time}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-2xl rounded-tl-xs text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                <span>Querying database tools & reasoning...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input form */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything (English or Roman Urdu)..."
              className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-400">
            <span>Powered by Gemini API</span>
            <span>Rate limit: ~20 req/hr</span>
          </div>
        </div>
      </div>
    </div>
  );
};
