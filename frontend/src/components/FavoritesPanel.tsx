import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Heart, Trash2, ChevronRight, MessageCircle } from 'lucide-react';

export interface Favorite {
  id: string;
  title: string;
  content: string;
  /** Tarifin favorilendiği sohbet; sohbet butonu buraya döner. */
  sessionId: string | null;
}

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: Favorite[];
  onRemove: (id: string) => void;
  /** Favoriyi geçtiği sohbette gösterir (bkz. App.tsx:handleOpenFavorite). */
  onOpen: (fav: Favorite) => void;
}

const FavoritesPanel: React.FC<FavoritesPanelProps> = ({ isOpen, onClose, favorites, onRemove, onOpen }) => {
  // Gövdeler varsayılan olarak kapalı: panel birkaç favoriyle devasa bir kaydırma alanına dönüşmesin.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={`favorites-panel ${isOpen ? 'open' : ''}`}>
      <div className="favorites-header">
        <h2>
          <Heart size={20} className="text-primary" /> Favorilerim
        </h2>
        <button className="icon-btn" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      <div className="favorites-content">
        {favorites.length === 0 ? (
          <div className="empty-state">
            <Heart size={48} className="empty-icon" />
            <p>Henüz favori tarifiniz yok.</p>
          </div>
        ) : (
          <ul className="favorites-list">
            {favorites.map((fav) => {
              const isExpanded = expandedIds.has(fav.id);
              return (
                <li key={fav.id} className={`favorite-item ${isExpanded ? 'open' : ''}`}>
                  <div className="favorite-item-header">
                    <button
                      className="favorite-item-title-btn"
                      onClick={() => toggleExpanded(fav.id)}
                      aria-expanded={isExpanded}
                      title={isExpanded ? 'Tarifi kapat' : 'Tarifi göster'}
                    >
                      <ChevronRight size={14} className="fav-chevron" />
                      <span>{fav.title}</span>
                    </button>
                    <div className="favorite-item-actions">
                      <button
                        className="fav-ask-btn"
                        onClick={() => onOpen(fav)}
                        title="Sohbette göster"
                      >
                        <MessageCircle size={14} />
                      </button>
                      <button
                        className="fav-remove-btn"
                        onClick={() => onRemove(fav.id)}
                        title="Favorilerden çıkar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="favorite-item-body markdown-body">
                      <ReactMarkdown>{fav.content}</ReactMarkdown>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FavoritesPanel;
