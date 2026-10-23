import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ChefHat, User, Heart, AlertTriangle } from 'lucide-react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  onToggleFavorite?: (id: string, text: string) => void;
  onSelect?: (text: string) => void;
  isFavorite?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onToggleFavorite, onSelect, isFavorite = false }) => {
  const isBot = message.sender === 'bot';

  // Seçim listesi mi? Ölçüt backend'deki main.py:_offers_selection ile aynı:
  // ifade + en az bir numaralı satır.
  const selectionItems: string[] = isBot && message.text.includes('Hangisini istersiniz')
    ? message.text
        .split('\n')
        .filter(line => /^\d+\.\s/.test(line.trim()))
        .map(line =>
          line
            .trim()
            .replace(/^\d+\.\s*/, '')
            // Ayraç kümesi main.py:_ITEM_NAME_SEPARATOR ile aynı olmalı.
            .split(/:| — | – | - /)[0]
            .replace(/[*_`]/g, '')
            .trim()
        )
        .filter(Boolean)
    : [];
  const isSelectionList = selectionItems.length > 0;

  return (
    <div className={`message-wrapper ${message.sender}`}>
      <div className={`avatar ${message.sender}`}>
        {isBot ? <ChefHat size={20} /> : <User size={20} />}
      </div>
      <div className="message-content">
        <div className="markdown-body">
          <ReactMarkdown>{message.text}</ReactMarkdown>
        </div>

        {isSelectionList && onSelect && (
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

        {/* Seçim listesi favorilenmez: başlığı "Elbette, işte tarifler:" gibi
            anlamsız çıkıyor ve içeriği tarif değil. */}
        {isBot && !isSelectionList && onToggleFavorite && (
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
