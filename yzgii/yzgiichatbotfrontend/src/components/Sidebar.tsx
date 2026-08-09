import React from 'react';
import { MessageSquare, Plus, Settings, Trash2 } from 'lucide-react';

interface SidebarProps {
  history: { id: string; title: string }[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  history,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={20} />
          <span>Yeni Sohbet</span>
        </button>
      </div>

      <div className="sidebar-history">
        <h3 className="history-title">Geçmiş</h3>
        <ul className="history-list">
          {history.length === 0 && (
            <li className="history-empty">Henüz sohbet yok</li>
          )}
          {history.map((item) => (
            <li
              key={item.id}
              className={`history-item ${activeSessionId === item.id ? 'active' : ''}`}
              onClick={() => onSelectSession(item.id)}
            >
              <MessageSquare size={16} className="history-icon" />
              <span className="history-text">{item.title}</span>
              <button
                className="history-delete-btn"
                title="Sohbeti sil"
                onClick={(e) => { e.stopPropagation(); onDeleteSession(item.id); }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <button className="history-item" onClick={onOpenSettings} style={{ width: '100%', background: 'transparent' }}>
          <Settings size={18} className="history-icon" />
          <span className="history-text">Ayarlar</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
