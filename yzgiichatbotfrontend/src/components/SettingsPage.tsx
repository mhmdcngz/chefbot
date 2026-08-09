import React, { useMemo, useState } from 'react';
import { X, Palette, Image as ImageIcon, ChefHat, Send } from 'lucide-react';
import { getDerivedThemeVars } from '../utils/themeColors';

export type BackgroundMode = 'none' | 'subtle' | 'dense';

interface SettingsPageProps {
  customColor: string;
  backgroundMode: BackgroundMode;
  onSave: (settings: { color: string; backgroundMode: BackgroundMode }) => void;
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  customColor,
  backgroundMode,
  onSave,
  onClose
}) => {
  const [draftColor, setDraftColor] = useState(customColor);
  const [draftBackgroundMode, setDraftBackgroundMode] = useState<BackgroundMode>(backgroundMode);

  const bgModes: { id: BackgroundMode; name: string }[] = [
    { id: 'none', name: 'Kapalı' },
    { id: 'subtle', name: 'Hafif' },
    { id: 'dense', name: 'Yoğun' }
  ];

  const hasChanges = draftColor !== customColor || draftBackgroundMode !== backgroundMode;

  const previewStyle = useMemo(
    () =>
      ({
        ...getDerivedThemeVars(draftColor)
      }) as React.CSSProperties,
    [draftColor]
  );

  const handleSave = () => {
    onSave({ color: draftColor, backgroundMode: draftBackgroundMode });
    onClose();
  };

  return (
    <div className="settings-page" style={previewStyle}>
      <div className="settings-sidebar">
        <div className="settings-header">
          <h2>Görünüm Ayarları</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-section" style={{ marginTop: '2rem' }}>
          <h3 className="settings-subtitle">
            <Palette size={18} /> Tema Rengi (Color Picker)
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Ana vurgu rengini seçin. Sistem diğer tonları otomatik hesaplar.
          </p>
          <div className="color-picker-container">
            <input 
              type="color" 
              className="color-input" 
              value={draftColor} 
              onChange={(e) => setDraftColor(e.target.value)}
            />
            <span className="color-value">{draftColor}</span>
          </div>
        </div>

        <div className="settings-section" style={{ marginTop: '2rem' }}>
          <h3 className="settings-subtitle">
            <ImageIcon size={18} /> Arka Plan Deseni
          </h3>
          <div className="bg-options">
            {bgModes.map((b) => (
              <button
                key={b.id}
                className={`bg-btn ${draftBackgroundMode === b.id ? 'active' : ''}`}
                onClick={() => setDraftBackgroundMode(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="save-settings-btn"
            disabled={!hasChanges}
            onClick={handleSave}
          >
            Kaydet
          </button>
        </div>
      </div>

      <div className="settings-preview-area">
        <div className="preview-container">
          <div className="preview-title">Canlı Önizleme</div>
          
          <div className="mock-msg user">
            <div className="mock-bubble">
              Akşama misafirim var, hafif ve şık ne yapabilirim?
            </div>
          </div>
          
          <div className="mock-msg bot">
            <div className="avatar bot">
              <ChefHat size={18} />
            </div>
            <div className="mock-bubble">
              Harika! Misafirleriniz için fırında somon ve yanına taze bir kuşkonmaz salatası yapabilirsiniz. Çok şık ve yormayan bir menü olur.
            </div>
          </div>

          <div className="mock-input-area">
            <span className="mock-input-text">Mesajınızı buraya yazın...</span>
            <div className="mock-send-btn">
              <Send size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
