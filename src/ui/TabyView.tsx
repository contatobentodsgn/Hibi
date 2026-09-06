import React, { useState } from 'react';
import { referenceDate } from '../domain/date-context';
import { LOCAL_CAPABILITIES } from '../domain/capabilities';
import type { StudyData } from '../domain/models';

export function TabyView({ data, onEvent }: { data: StudyData; onEvent: (action: string, detail: string, result?: string) => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([{ role: 'assistant', text: 'Olá! Sou o assistente local do Hibi. Pergunte sobre sua agenda, tarefas ou lembretes.' }]);
  const ask = async () => {
    const question = input.trim(); if (!question) return;
    const q = question.toLowerCase(); const today = referenceDate(data); const todayBlocks = data.blocks.filter((item) => item.start.startsWith(today));
    let answer = `Tenho ${data.tasks.length} tarefas, ${data.reminders.length} lembretes e ${data.blocks.length} blocos agendados. Posso consultar apenas os dados locais desta tela.`;
    if (q.includes('tarefa')) answer = `Você tem ${data.tasks.filter((item) => item.status !== 'completed').length} tarefas abertas.`;
    else if (q.includes('lembrete')) answer = `Você tem ${data.reminders.filter((item) => item.status !== 'paused').length} lembretes ativos.`;
    else if (q.includes('nota')) answer = `Você capturou ${data.notes.length} notas.`;
    else if (q.includes('agenda') || q.includes('hoje')) answer = `Hoje há ${todayBlocks.length} blocos: ${todayBlocks.slice(0, 3).map((item) => `${item.start.slice(11, 16)} ${item.title}`).join(', ')}.`;
    else if (q.includes('próximo') || q.includes('proximo')) { const next = todayBlocks.find((item) => item.start.slice(11, 16) >= '09:00'); answer = next ? `Seu próximo bloco é ${next.title} às ${next.start.slice(11, 16)}.` : 'Não há próximo bloco encontrado.'; }
    else if (/(internet|externa|externo|hardware|microfone|câmera|camera)/i.test(q)) answer = 'Sou um assistente local: não acesso internet, IA externa, microfone, câmera ou outro hardware. Posso consultar e explicar apenas os dados locais disponíveis abaixo.';
    setMessages((current) => [...current, { role: 'user', text: question }]); setInput(''); onEvent('assistant-query', question, 'local');
    try { const remote = await window.hibiDesktop?.runAiTurn?.({ message: question, surface: 'desktop' }); setMessages((current) => [...current, { role: 'assistant', text: remote?.reply ?? answer }]); }
    catch { setMessages((current) => [...current, { role: 'assistant', text: answer }]); }
  };
  return <div className="view"><div className="view-heading"><div><p className="eyebrow">TABY · OFFLINE ASSISTANT</p><h1>Local assistant</h1><p className="muted">Answers are generated from this device's local workspace. No network calls.</p></div></div><section className="list-card" aria-label="Assistant capabilities"><div className="task-row"><span className="tag orange">status</span><div><strong>What I can access</strong><p className="muted">Only the local workspace data and controls listed here.</p></div></div>{LOCAL_CAPABILITIES.map((capability) => <div className="task-row" key={capability.id}><span className={`tag ${capability.status === 'available' ? 'green' : 'muted'}`}>{capability.status}</span><div><strong>{capability.label}</strong><p className="muted">{capability.description}</p></div></div>)}</section><section className="list-card" aria-live="polite">{messages.map((message, index) => <div className="task-row" key={`${message.role}-${index}`}><span className="tag orange">{message.role}</span><div><span>{message.text}</span></div></div>)}</section><div className="quick-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') ask(); }} placeholder="Ask about your workspace" /><button className="primary" onClick={ask}>Send</button></div></div>;
}
