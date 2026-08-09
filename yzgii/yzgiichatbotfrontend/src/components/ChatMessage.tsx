import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ChefHat, User, Heart, AlertTriangle } from 'lucide-react';

interface ChatMessageProps {
  message: {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    warning?: string | null;
  };
  onToggleFavorite?: (id: string, text: string) => void;
  onSelect?: (text: string) => void;
  isFavorite?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onToggleFavorite, onSelect, isFavorite = false }) => {
  const isBot = message.sender === 'bot';

  // Seçim listesi mi? ("Hangisini istersiniz?" içeriyorsa)
  const isSelectionList = isBot && message.text.includes('Hangisini istersiniz?');
  const selectionItems: string[] = isSelectionList
    ? message.text
        .split('\n')
        .filter(line => /^\d+\./.test(line.trim()))
        .map(line =>
          line
            .replace(/^\d+\.\s*/, '')
            .replace(/\*\*/g, '')
            .split(' — ')[0]
            .split(' - ')[0]
            .trim()
        )
        .filter(Boolean)
    : [];

  return (
    <div className={`message-wrapper ${message.sender}`}>
      <div className={`avatar ${message.sender}`}>
        {isBot ? <ChefHat size={20} /> : <User size={20} />}
      </div>
      <div className="message-content">
        <div className="markdown-body">
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>

        {isSelectionList && selectionItems.length > 0 && onSelect && (
          <div className="selection-chips">
            {selectionItems.map((item, i) => (
              <button
                key={i}
                className="selection-chip"
                onClick={() => onSelect(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {message.warning && (
          <div className="chat-warning">
            <AlertTriangle size={14} />
            <span>{message.warning}</span>
          </div>
        )}

        {isBot && onToggleFavorite && (
          <div className="message-actions">
            <button
              className={`fav-msg-btn ${isFavorite ? 'active' : ''}`}
              onClick={() => onToggleFavorite(message.id, message.text)}
              title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            >
              <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
              <span>{isFavorite ? 'Favoride' : 'Favorile'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
