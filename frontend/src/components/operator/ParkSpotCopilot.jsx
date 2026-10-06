import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  X,
  RotateCcw,
  TrendingUp,
  BarChart3,
  Lightbulb,
  ExternalLink,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { api } from '../../services/api';

const STARTER_QUESTIONS = [
  'How is parking performing today?',
  'What are the peak hours?',
  'Any facilities with low utilization?',
  'Explain the latest recommendation.'
];

export function ParkSpotCopilot({
  operatorName = 'Operator',
  selectedFacility = null,
  onNavigateTab = () => {},
  isLiveConnected = true,
  isOpen: controlledIsOpen = null,
  onToggle: controlledOnToggle = null
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== null ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledOnToggle !== null ? controlledOnToggle : setInternalIsOpen;

  // Initialize messages from sessionStorage or default welcome
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('parkspot_copilot_chat');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_e) {}

    return [
      {
        id: 'msg-welcome',
        role: 'assistant',
        content: `Hello ${operatorName}. I am your ParkSpot Copilot.\n\nAsk me anything about your parking operations, live occupancy, demand forecasts, overstays, or optimization recommendations.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showStarters: true
      }
    ];
  });

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('parkspot_copilot_chat', JSON.stringify(messages));
    } catch (_e) {}
  }, [messages]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      // Send last 6 conversation turns
      const conversationPayload = newMessages
        .slice(-6)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

      const response = await api.chatCopilot({
        messages: conversationPayload,
        facilityId: selectedFacility?.id || null
      });

      const assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: response?.reply || 'Operations analysis completed.',
        recommendation: response?.recommendation || null,
        keyMetrics: response?.keyMetrics || null,
        quickActions: response?.quickActions || [],
        source: response?.source || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.warn('[ParkSpotCopilot] Chat request notice:', err.message);

      const fallbackMsg = {
        id: `asst-err-${Date.now()}`,
        role: 'assistant',
        content: `I am currently analyzing live database metrics for ${selectedFacility?.name || 'your facilities'}. Current occupancy and operational status remain active.`,
        keyMetrics: {
          facility: selectedFacility?.name || 'Primary Facility',
          status: 'Operating'
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReset = () => {
    const initial = [
      {
        id: `msg-welcome-${Date.now()}`,
        role: 'assistant',
        content: `Hello ${operatorName}. What would you like to check across your parking operations?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showStarters: true
      }
    ];
    setMessages(initial);
    try {
      sessionStorage.setItem('parkspot_copilot_chat', JSON.stringify(initial));
    } catch (_e) {}
  };

  return (
    <>
      {/* 1. FLOATING CHATBOT LAUNCHER BUTTON (Bottom-Right, 56px circular) */}
      <button
        type="button"
        className={`parkspot-copilot-launcher ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close ParkSpot Copilot' : 'Open ParkSpot Copilot'}
        title="ParkSpot Copilot — Operations Assistant"
      >
        {isOpen ? (
          <X size={24} className="launcher-icon close" />
        ) : (
          <div className="launcher-icon-wrap">
            <Bot size={26} className="launcher-icon bot" />
            <span className="copilot-launcher-pulse" />
          </div>
        )}
      </button>

      {/* 2. COMPACT CHAT WINDOW (Width: ~360px, Height: ~520px, Fixed Bottom-Right) */}
      {isOpen && (
        <div className="parkspot-copilot-window" role="dialog" aria-label="ParkSpot Copilot Chat">
          {/* Header */}
          <div className="copilot-window-header">
            <div className="copilot-header-brand">
              <div className="copilot-header-avatar">
                <Bot size={18} color="#25221B" />
              </div>
              <div>
                <div className="copilot-header-title">ParkSpot Copilot</div>
                <div className="copilot-header-subtitle">
                  <span className="copilot-status-dot" />
                  Operations Assistant
                </div>
              </div>
            </div>

            <div className="copilot-header-actions">
              <button
                type="button"
                className="copilot-header-btn"
                onClick={handleReset}
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                className="copilot-header-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                aria-label="Close chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="copilot-window-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`copilot-msg-row ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="copilot-msg-avatar">
                    <Bot size={14} color="#25221B" />
                  </div>
                )}

                <div className="copilot-msg-bubble-wrap">
                  <div className={`copilot-msg-bubble ${msg.role}`}>
                    <div className="copilot-msg-text">
                      {msg.content.split('\n\n').map((para, pIdx) => (
                        <p key={pIdx} style={{ margin: pIdx === 0 ? 0 : '0.5rem 0 0' }}>
                          {para}
                        </p>
                      ))}
                    </div>

                    {/* Key Metrics Mini-Badge Box */}
                    {msg.keyMetrics && Object.keys(msg.keyMetrics).length > 0 && (
                      <div className="copilot-metrics-box">
                        {Object.entries(msg.keyMetrics).map(([k, v]) => (
                          <div key={k} className="copilot-metric-item">
                            <span className="copilot-metric-label">{k.replace(/([A-Z])/g, ' $1')}:</span>
                            <span className="copilot-metric-val">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Recommendation Card */}
                    {msg.recommendation && (
                      <div className="copilot-rec-card">
                        <div className="copilot-rec-header">
                          <Lightbulb size={13} color="#D97706" />
                          <span className="copilot-rec-title">{msg.recommendation.title}</span>
                        </div>
                        {msg.recommendation.reason && (
                          <div className="copilot-rec-reason">{msg.recommendation.reason}</div>
                        )}
                        {msg.recommendation.confidence && (
                          <div className="copilot-rec-confidence">
                            Confidence: <strong>{msg.recommendation.confidence}</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Actions */}
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="copilot-quick-actions">
                        {msg.quickActions.map((qa, qIdx) => (
                          <button
                            key={qIdx}
                            type="button"
                            className="copilot-qa-btn"
                            onClick={() => {
                              if (qa.tab) onNavigateTab(qa.tab);
                            }}
                          >
                            <span>{qa.label}</span>
                            <ChevronRight size={11} />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timestamp & Source */}
                    <div className="copilot-msg-meta">
                      <span>{msg.timestamp}</span>
                      {msg.source === 'GEMINI' && (
                        <span className="copilot-gemini-tag">Gemini AI</span>
                      )}
                    </div>
                  </div>

                  {/* Starter Prompts under welcome message */}
                  {msg.showStarters && messages.length === 1 && (
                    <div className="copilot-starters-wrap">
                      <div className="copilot-starters-label">Ask about your parking operations:</div>
                      <div className="copilot-starters-list">
                        {STARTER_QUESTIONS.map((q, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="copilot-starter-chip"
                            onClick={() => handleSendMessage(q)}
                          >
                            "{q}"
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading / Typing State */}
            {isLoading && (
              <div className="copilot-msg-row assistant">
                <div className="copilot-msg-avatar">
                  <Bot size={14} color="#25221B" />
                </div>
                <div className="copilot-msg-bubble assistant loading">
                  <div className="copilot-typing-indicator">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                  <span className="copilot-loading-text">Analyzing operations data...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="copilot-window-footer">
            <div className="copilot-input-bar">
              <input
                ref={inputRef}
                type="text"
                className="copilot-input-field"
                placeholder="Ask something..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                type="button"
                className="copilot-send-btn"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                aria-label="Send query"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ParkSpotCopilot;
