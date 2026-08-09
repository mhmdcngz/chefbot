import React from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Heart, Trash2 } from 'lucide-react';

export interface Favorite {
  id: string;
  title: string;
  content: string;
}

interface FavoritesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: Favorite[];
  onRemove: (id: string) => void;
  onSelect: (content: string) => void;
}

const FavoritesPanel: React.FC<FavoritesPanelProps> = ({ isOpen, onClose, favorites, onRemove, onSelect }) => {
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
            {favorites.map((fav) => (
              <li key={fav.id} className="favorite-item">
                <div className="favorite-item-header">
                  <button
                    className="favorite-item-title-btn"
                    onClick={() => onSelect(fav.content)}
                    title="Sohbete gönder"
                  >
                    {fav.title}
                  </button>
                  <button
                    className="fav-remove-btn"
                    onClick={() => onRemove(fav.id)}
                    title="Favorilerden çıkar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="favorite-item-body markdown-body">
                  <ReactMarkdown>{fav.content}</ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FavoritesPanel;
