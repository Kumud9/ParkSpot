import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  ArrowUp,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Lightbulb,
  ShieldAlert,
  RotateCcw,
  Bot,
  ExternalLink,
  ChevronRight,
  Clock
} from 'lucide-react';
import { api } from '../../services/api';

const STARTER_PROMPTS = [
  'Which facility needs attention today?',
  'Why is utilization low this morning?',
  'What is expected during peak hours?',
  'What is the demand forecast for tomorrow?',
  'Explain the latest pricing recommendation.',
  'Which spots have been overstaying?'
];

export function ParkSpotCopilot({
  operatorName = 'Lara',
  selectedFacility = null,
  onNavigateTab = () => {},
  isLiveConnected = true,
  onViewRecommendation = null
}) {
  const [messages, setMessages] = useState(() => [
    {
      id: 'msg-welcome',
      role: 'assistant',
      content: `Good morning, ${operatorName}.\nWhat would you like to know about your parking operation?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      showStarters: true
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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
      // Send conversation history bounded to last 6 messages
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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.warn('[ParkSpotCopilot] Chat request fallback note:', err.message);

      // Graceful offline or server error fallback
      const fallbackMsg = {
        id: `asst-err-${Date.now()}`,
        role: 'assistant',
        isError: true,
        content: 'Copilot is temporarily unavailable.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        role: 'assistant',
        content: `Good morning, ${operatorName}.\nWhat would you like to know about your parking operation?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showStarters: true
      }
    ]);
    setInputText('');
  };

  return (
    <div
      className="copilot-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '640px',
        maxHeight: '840px',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--ps-radius-md)',
        border: '1px solid var(--ps-secondary-light)',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(37, 34, 27, 0.04)'
      }}
    >
      {/* 1. COPILOT HEADER */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          backgroundColor: '#25221B',
          color: '#F4F2E7',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#F3F456',
              color: '#25221B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.02em', color: '#F4F2E7' }}>
              ParkSpot Copilot
            </div>
            <div style={{ fontSize: '0.75rem', color: '#E6DFD1', opacity: 0.85 }}>
              Your parking operations copilot · {selectedFacility?.name || 'All Facilities'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleResetChat}
            style={{
              background: 'transparent',
              border: '1px solid rgba(244, 242, 231, 0.2)',
              borderRadius: 'var(--ps-radius-sm)',
              color: '#F4F2E7',
              padding: '0.35rem 0.65rem',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer'
            }}
            title="Reset conversation"
          >
            <RotateCcw size={13} />
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* 2. CHAT MESSAGES BODY */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          backgroundColor: '#FAF9F5'
        }}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '100%'
              }}
            >
              {/* Sender Name */}
              <div
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--ps-secondary-dark)',
                  marginBottom: '4px',
                  paddingLeft: isUser ? 0 : '4px',
                  paddingRight: isUser ? '4px' : 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                {!isUser && <Bot size={12} />}
                <span>{isUser ? operatorName : 'Copilot'}</span>
                <span style={{ fontWeight: 400, opacity: 0.7 }}>· {msg.timestamp}</span>
              </div>

              {/* Message Bubble */}
              <div
                style={{
                  maxWidth: isUser ? '80%' : '88%',
                  backgroundColor: isUser ? '#25221B' : '#FFFFFF',
                  color: isUser ? '#F4F2E7' : '#25221B',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  padding: '1rem 1.25rem',
                  border: isUser ? 'none' : '1px solid #E6DFD1',
                  boxShadow: '0 2px 8px rgba(37, 34, 27, 0.03)',
                  fontSize: '0.925rem',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-line'
                }}
              >
                {/* Regular content */}
                <div>{msg.content}</div>

                {/* Key Metrics Grid */}
                {msg.keyMetrics && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '0.6rem',
                      marginTop: '1rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #E6DFD1'
                    }}
                  >
                    {Object.entries(msg.keyMetrics).map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          backgroundColor: '#F4F2E7',
                          padding: '0.5rem 0.65rem',
                          borderRadius: 'var(--ps-radius-sm)',
                          border: '1px solid rgba(178, 162, 64, 0.2)'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            color: '#707371',
                            textTransform: 'capitalize'
                          }}
                        >
                          {k.replace(/([A-Z])/g, ' $1')}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#25221B' }}>
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* RECOMMENDATION CARD (Requirement 26) */}
                {msg.recommendation && (
                  <div
                    style={{
                      marginTop: '1rem',
                      backgroundColor: '#F4F2E7',
                      border: '1px solid #B2A240',
                      borderRadius: 'var(--ps-radius-sm)',
                      padding: '0.85rem 1rem'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.35rem'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          color: '#707371',
                          textTransform: 'uppercase'
                        }}
                      >
                        Optimization Recommendation
                      </span>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: '#F3F456',
                          color: '#25221B'
                        }}
                      >
                        Confidence: {msg.recommendation.confidence}
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                      {msg.recommendation.title}
                    </div>

                    <div style={{ fontSize: '0.8125rem', color: '#25221B', marginBottom: '0.75rem', lineHeight: 1.45 }}>
                      <strong>Reason:</strong> {msg.recommendation.reason}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onViewRecommendation) {
                          onViewRecommendation(msg.recommendation);
                        } else {
                          onNavigateTab('optimization');
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        backgroundColor: '#25221B',
                        color: '#F4F2E7',
                        border: 'none',
                        borderRadius: 'var(--ps-radius-sm)',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.78125rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <span>View Recommendation</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                {/* Quick Navigation Actions */}
                {msg.quickActions && msg.quickActions.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                      marginTop: '0.85rem'
                    }}
                  >
                    {msg.quickActions.map((qa, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onNavigateTab(qa.tab)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E6DFD1',
                          borderRadius: 'var(--ps-radius-sm)',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#25221B',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>{qa.label}</span>
                        <ChevronRight size={12} color="#707371" />
                      </button>
                    ))}
                  </div>
                )}

                {/* ERROR STATE: FALLBACK BUTTONS (Requirement 33) */}
                {msg.isError && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginTop: '0.5rem'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onNavigateTab('analytics')}
                        style={{
                          backgroundColor: '#25221B',
                          color: '#F4F2E7',
                          border: 'none',
                          borderRadius: 'var(--ps-radius-sm)',
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.78125rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        View Analytics
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('forecast')}
                        style={{
                          backgroundColor: '#25221B',
                          color: '#F4F2E7',
                          border: 'none',
                          borderRadius: 'var(--ps-radius-sm)',
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.78125rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        View Forecast
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('optimization')}
                        style={{
                          backgroundColor: '#25221B',
                          color: '#F4F2E7',
                          border: 'none',
                          borderRadius: 'var(--ps-radius-sm)',
                          padding: '0.4rem 0.75rem',
                          fontSize: '0.78125rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        View Recommendations
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* STARTER PROMPTS CARDS (Requirement 18 & 24) */}
              {msg.showStarters && messages.length === 1 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    width: '100%',
                    maxWidth: '460px',
                    marginTop: '1rem',
                    marginLeft: '4px'
                  }}
                >
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      style={{
                        textAlign: 'left',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E6DFD1',
                        borderRadius: 'var(--ps-radius-sm)',
                        padding: '0.65rem 0.95rem',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: '#25221B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 1px 3px rgba(37, 34, 27, 0.02)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#B2A240';
                        e.currentTarget.style.backgroundColor = '#F4F2E7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E6DFD1';
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                      }}
                    >
                      <span>{prompt}</span>
                      <ArrowUp size={13} style={{ transform: 'rotate(45deg)', color: '#707371' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* LOADING INDICATOR (Requirement 32) */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: 'var(--ps-secondary-dark)',
                marginBottom: '4px',
                paddingLeft: '4px'
              }}
            >
              Copilot
            </div>
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E6DFD1',
                borderRadius: '14px 14px 14px 2px',
                padding: '0.85rem 1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                boxShadow: '0 2px 8px rgba(37, 34, 27, 0.03)'
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#B2A240',
                  animation: 'pulse 1.2s infinite ease-in-out'
                }}
              />
              <span style={{ fontSize: '0.875rem', color: '#25221B', fontWeight: 500 }}>
                Copilot is analyzing your parking data...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. INPUT CHAT FOOTER */}
      <footer
        style={{
          padding: '1rem 1.5rem',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E6DFD1'
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#FAF9F5',
            border: '1px solid #E6DFD1',
            borderRadius: '24px',
            padding: '0.4rem 0.6rem 0.4rem 1.1rem'
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask ParkSpot anything..."
            disabled={isLoading}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.9rem',
              color: '#25221B'
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: inputText.trim() && !isLoading ? '#25221B' : 'rgba(37, 34, 27, 0.15)',
              color: inputText.trim() && !isLoading ? '#F3F456' : '#707371',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() && !isLoading ? 'pointer' : 'default',
              transition: 'all 0.15s ease'
            }}
            title="Send query"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </form>

        <div
          style={{
            fontSize: '0.6875rem',
            color: '#707371',
            textAlign: 'center',
            marginTop: '0.5rem'
          }}
        >
          ParkSpot Copilot is a read-only operations intelligence assistant. Operational adjustments remain under human operator control.
        </div>
      </footer>
    </div>
  );
}
