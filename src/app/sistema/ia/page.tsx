'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, Sparkles, Trash2, Database, Copy, Check, Bot, FileVideo } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    queriesMade?: number;
    timestamp: Date;
}

const SUGGESTED_PROMPTS = [
    'Quais leilões estão confirmados nos próximos 30 dias?',
    'Mostre os fechamentos por VGV no último trimestre',
    'Quais assessores tiveram melhor performance este mês?',
    'Resuma os leads recentes do CRM por interesse',
    'Quais tarefas de projetos estão atrasadas?',
    'Quantas mensagens WhatsApp foram enviadas este mês?',
];

function maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    if (!domain || user.length <= 2) return email;
    return `${user.slice(0, 2)}***@${domain}`;
}

function formatContent(content: string): string {
    return content.replace(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g, maskEmail);
}

export default function IAPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    async function sendMessage(text?: string) {
        const content = (text ?? input).trim();
        if (!content || isLoading) return;

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const history = [...messages, userMsg].map((m) => ({
                role: m.role,
                content: m.content,
            }));

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `❌ Erro: ${data.error ?? 'Falha na conexão com a IA'}`,
                        timestamp: new Date(),
                    },
                ]);
                return;
            }

            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: data.message,
                    queriesMade: data.queriesMade,
                    timestamp: new Date(),
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: '❌ Falha ao conectar com a IA. Verifique sua conexão.',
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    async function copyMessage(id: string, content: string) {
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    function formatTime(date: Date) {
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A68B4B] to-[#C8A96E] flex items-center justify-center shadow-lg shadow-[#A68B4B]/30">
                            <Sparkles size={20} className="text-black" />
                        </div>
                        Assistente IA
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 ml-13">
                        Consultas em tempo real ao banco de dados
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/sistema/ia/leiloes"
                        className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-[#A68B4B]/40 text-[#A68B4B] hover:bg-[#A68B4B]/10 transition-all"
                    >
                        <FileVideo size={16} />
                        <span className="hidden sm:inline">Análise de Leilões</span>
                    </Link>
                    {messages.length > 0 && (
                        <button
                            onClick={() => setMessages([])}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
                        >
                            <Trash2 size={16} />
                            <span className="hidden sm:inline">Limpar conversa</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] p-4 lg:p-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-[#2e2e2e] scrollbar-track-transparent">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#A68B4B]/20 to-[#C8A96E]/10 flex items-center justify-center mb-4 border border-[#A68B4B]/20">
                            <Bot size={32} className="text-[#A68B4B]" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">
                            Como posso ajudar?
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-md">
                            Faço consultas ao banco de dados em tempo real. Posso analisar produtos, leads, tarefas, contratos e mais.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                            {SUGGESTED_PROMPTS.map((prompt) => (
                                <button
                                    key={prompt}
                                    onClick={() => sendMessage(prompt)}
                                    className="text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#1A1A1A] hover:border-[#A68B4B]/50 hover:bg-[#A68B4B]/5 text-sm text-gray-700 dark:text-gray-300 transition-all group"
                                >
                                    <span className="text-[#A68B4B] mr-1 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#A68B4B] to-[#C8A96E] flex items-center justify-center shrink-0 mt-1 shadow-md shadow-[#A68B4B]/20">
                                        <Sparkles size={14} className="text-black" />
                                    </div>
                                )}

                                <div className={`group max-w-[80%] lg:max-w-[72%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                                    <div
                                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                            msg.role === 'user'
                                                ? 'bg-gradient-to-br from-[#A68B4B] to-[#9A7209] text-white rounded-tr-sm shadow-lg shadow-[#A68B4B]/20'
                                                : 'bg-gray-50 dark:bg-[#1A1A1A] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#333] rounded-tl-sm'
                                        }`}
                                    >
                                        {msg.role === 'assistant'
                                            ? formatContent(msg.content)
                                            : msg.content}
                                    </div>

                                    <div className={`flex items-center gap-2 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-600">
                                            {formatTime(msg.timestamp)}
                                        </span>
                                        {msg.queriesMade !== undefined && msg.queriesMade > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] text-[#A68B4B]/70">
                                                <Database size={10} />
                                                {msg.queriesMade} consulta{msg.queriesMade > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {msg.role === 'assistant' && (
                                            <button
                                                onClick={() => copyMessage(msg.id, msg.content)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                            >
                                                {copiedId === msg.id
                                                    ? <Check size={12} className="text-green-500" />
                                                    : <Copy size={12} />}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-[#363636] flex items-center justify-center shrink-0 mt-1 text-xs font-bold text-gray-600 dark:text-gray-300">
                                        A
                                    </div>
                                )}
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-3 justify-start">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#A68B4B] to-[#C8A96E] flex items-center justify-center shrink-0 mt-1 animate-pulse">
                                    <Sparkles size={14} className="text-black" />
                                </div>
                                <div className="bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-2xl rounded-tl-sm px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 rounded-full bg-[#A68B4B] animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-[#A68B4B] animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-2 h-2 rounded-full bg-[#A68B4B] animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-xs text-gray-400 dark:text-gray-500">Consultando banco de dados...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input Area */}
            <div className="mt-4 shrink-0">
                <div className="flex gap-3 items-end bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#2A2A2A] rounded-2xl p-3 focus-within:border-[#A68B4B]/50 transition-colors shadow-sm">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pergunte sobre produtos, leads, tarefas... (Enter para enviar)"
                        rows={1}
                        disabled={isLoading}
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 resize-none outline-none min-h-[36px] max-h-[120px] leading-relaxed py-1 scrollbar-thin"
                        style={{ scrollbarWidth: 'none' }}
                        onInput={(e) => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                        }}
                    />
                    <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || isLoading}
                        className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#A68B4B] to-[#9A7209] flex items-center justify-center text-black transition-all hover:shadow-lg hover:shadow-[#A68B4B]/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                        <Send size={16} />
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-700 text-center mt-2">
                    Modelo GLM-4.7 · Consultas read-only ao Supabase
                </p>
            </div>
        </div>
    );
}
