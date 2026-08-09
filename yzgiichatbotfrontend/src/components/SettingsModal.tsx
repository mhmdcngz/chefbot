import React from 'react';
import { X, Palette, Image as ImageIcon } from 'lucide-react';
import { ThemeOption, BackgroundMode } from '../theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeOption;
  onChangeTheme: (theme: ThemeOption) => void;
  backgroundMode: BackgroundMode;
  onChangeBackgroundMode: (mode: BackgroundMode) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onChangeTheme,
  backgroundMode,
  onChangeBackgroundMode
}) => {
  if (!isOpen) return null;

  const themes: { id: ThemeOption; name: string; color: string }[] = [
    { id: 'peach', name: 'Şeftali & Krem', color: '#ff8c6b' },
    { id: 'dark', name: 'Karanlık Gece', color: '#8b5cf6' },
    { id: 'forest', name: 'Orman Yeşili', color: '#10b981' },
    { id: 'ocean', name: 'Okyanus Mavisi', color: '#0ea5e9' }
  ];

  const bgModes: { id: BackgroundMode; name: string }[] = [
    { id: 'none', name: 'Kapalı' },
    { id: 'subtle', name: 'Hafif' },
    { id: 'dense', name: 'Yoğun' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Ayarlar</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <h3 className="settings-subtitle">
              <Palette size={18} /> Tema Rengi
            </h3>
            <div className="theme-options">
              {themes.map((t) => (
                <button
                  key={t.id}
                  className={`theme-btn ${currentTheme === t.id ? 'active' : ''}`}
                  onClick={() => onChangeTheme(t.id)}
                >
                  <span className="theme-color-circle" style={{ backgroundColor: t.color }}></span>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <h3 className="settings-subtitle">
              <ImageIcon size={18} /> Arka Plan Deseni
            </h3>
            <div className="bg-options">
              {bgModes.map((b) => (
                <button
                  key={b.id}
                  className={`bg-btn ${backgroundMode === b.id ? 'active' : ''}`}
                  onClick={() => onChangeBackgroundMode(b.id)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
