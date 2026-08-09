import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, isLoading }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <div className="input-area-wrapper">
      <form onSubmit={handleSubmit} className="input-container">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Evde ne var? Yaz bana, sana tarif çıkarayım 👀"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className="send-btn"
          disabled={!message.trim() || isLoading}
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;
