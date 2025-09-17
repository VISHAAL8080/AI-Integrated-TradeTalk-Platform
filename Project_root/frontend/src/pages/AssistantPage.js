import React, { useState } from 'react';
import { chatAi } from '../api';
import { useNavigate } from 'react-router-dom';


export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I can suggest projects and recommend your next course. Ask me anything.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();

  async function send() {
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    try {
      setSending(true);
      const res = await chatAi(next.map(({ role, content }) => ({ role, content })));
      const reply = (res && res.reply) || 'Sorry, I could not generate a reply.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e?.data?.detail || e?.message || 'AI request failed';
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="pageWrap assistant" style={{ gap: 12 }}>
      <div className="headerWrap">
        <div className="iconBadge">🤖</div>
        <h1 style={{ margin: 8 }}>AI Assistant</h1>
        <p style={{ margin: 0, color: '#667085' }}>
          Ask for project ideas based on your purchases/teaching history or get a next-course recommendation.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 900, width: '100%', display: 'flex', flexDirection: 'column', height: '70vh' }}>
        <div style={{ flex: 1, overflow: 'auto', paddingRight: 6 }}>
          {messages.map((m, idx) => (
            <div key={idx} style={{
              marginBottom: 10,
              textAlign: m.role === 'assistant' ? 'left' : 'right'
            }}>
              <div style={{
                display: 'inline-block',
                background: m.role === 'assistant' ? '#F3F4F6' : '#2563EB',
                color: m.role === 'assistant' ? '#111827' : 'white',
                padding: '8px 12px',
                borderRadius: 10,
                maxWidth: '80%'
              }}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="e.g., Recommend a project based on my recent DBMS purchase"
            style={{ flex: 1, height: 60, resize: 'none' }}
          />
          <button className="btnPrimary" onClick={send} disabled={sending || !input.trim()}>
            {sending ? 'Thinking…' : 'Send'}
          </button>
          <button className="btnSecondary" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    </div>
  );
}
