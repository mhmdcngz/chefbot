import React, { useState } from 'react';
import ChatMessage from './components/ChatMessage';
import MessageInput from './components/MessageInput';
import Sidebar from './components/Sidebar';
import FavoritesPanel, { Favorite } from './components/FavoritesPanel';
import BackgroundPattern from './components/BackgroundPattern';
import SettingsPage from './components/SettingsPage';
import { BackgroundMode } from './theme';
import { Message, ChatSession } from './types';
import { ChefHat, Heart, Menu } from 'lucide-react';
import { getDerivedThemeVars } from './utils/themeColors';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  /** Yanıtı beklenen sohbet. Doluyken yeni istek gönderilmez. */
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const isLoading = pendingSessionId !== null;
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** Favoriden açılan mesaj: kaydırılır ve kısa süre vurgulanır. */
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [customColor, setCustomColor] = useState<string>(() => {
    return localStorage.getItem('chefbot-color') || '#ff8c6b';
  });
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    return (localStorage.getItem('chefbot-bg') as BackgroundMode) || 'subtle';
  });

  React.useEffect(() => {
    localStorage.setItem('chefbot-color', customColor);
    const vars = getDerivedThemeVars(customColor);
    Object.entries(vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [customColor]);

  React.useEffect(() => {
    localStorage.setItem('chefbot-bg', backgroundMode);
  }, [backgroundMode]);

  // Yanıt gelene kadar kullanıcı başka sohbete geçebilir; async handler'daki
  // activeSessionId closure'da eski kalacağı için güncel değer ref'ten okunur.
  const activeSessionRef = React.useRef<string | null>(activeSessionId);
  React.useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  const syncSession = (id: string, msgs: Message[]) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, messages: msgs } : s));
  };

  /** Oturum kaydını her zaman günceller; ekranı yalnızca o oturum hâlâ açıksa. */
  const commitMessages = (id: string, msgs: Message[]) => {
    syncSession(id, msgs);
    if (activeSessionRef.current === id) setMessages(msgs);
  };

  React.useEffect(() => {
    if (!highlightedMessageId) return;
    document
      .getElementById(`msg-${highlightedMessageId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const timer = setTimeout(() => setHighlightedMessageId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedMessageId]);

  /**
   * freshSession: mevcut sohbete eklemek yerine yeni oturum açar. Aynı handler
   * içinde setMessages([]) sonrası çağrılsa bile closure'daki eski `messages`
   * kullanılacağı için bu ayrımın parametreyle yapılması gerekiyor.
   */
  const handleSendMessage = async (text: string, freshSession = false) => {
    // Tek giriş noktası: yazma kutusu, seçim çipleri ve favori butonu buradan geçer.
    if (isLoading) return;
    const newUserMsg: Message = { id: Date.now().toString(), text, sender: 'user' };
    const base = freshSession ? [] : messages;

    let sessionId = freshSession ? null : activeSessionId;

    if (base.length === 0 || !sessionId) {
      sessionId = Date.now().toString();
      const title = text.length > 40 ? text.slice(0, 40) + '…' : text;
      setSessions(prev => [{ id: sessionId!, title, messages: [] }, ...prev]);
      setActiveSessionId(sessionId);
      activeSessionRef.current = sessionId;
    }
    const sid: string = sessionId;

    const withUser = [...base, newUserMsg];
    commitMessages(sid, withUser);
    setPendingSessionId(sid);

    try {
      // Hata balonları geçmişe girmez: aksi halde 429 sonrası "2" yazıldığında son
      // asistan mesajı hata metni olur, seçim çözülmez ve LLM geçmişi kirlenir.
      const history = withUser.slice(0, -1).filter((m) => !m.isError).slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Sunucu hatası: ${res.status}`);
      }

      const data = await res.json();
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: data.answer,
        sender: 'bot',
        warning: data.warning,
      };
      commitMessages(sid, [...withUser, botMsg]);
    } catch (err) {
      const detay = err instanceof Error ? err.message : String(err);
      const withError: Message[] = [...withUser, {
        id: (Date.now() + 1).toString(),
        text: `Bir hata oluştu: ${detay}`,
        sender: 'bot',
        isError: true,
      }];
      commitMessages(sid, withError);
    } finally {
      setPendingSessionId(null);
    }
  };

  const handleSelectSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setMessages(session.messages);
      setActiveSessionId(id);
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setMessages([]);
      setActiveSessionId(null);
    }
  };

  /**
   * Favori başlığını çıkarır. Tarif şablonu `### Tarif Adı` ile başladığı için önce
   * ilk başlık satırı aranır; ilk satırı almak "Elbette, işte tarif:" gibi giriş
   * cümlelerini başlık yapıyordu.
   */
  const extractFavoriteTitle = (text: string): string => {
    const heading = text.match(/^#{1,6}\s+(.+)$/m);
    const raw = (heading?.[1] ?? text.split('\n').find(line => line.trim()) ?? 'Favori')
      .replace(/\*+/g, '')
      .trim();
    return raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
  };

  const handleToggleFavorite = (id: string, text: string) => {
    setFavorites(prev => {
      if (prev.find(f => f.id === id)) {
        return prev.filter(f => f.id !== id);
      }
      return [...prev, { id, title: extractFavoriteTitle(text), content: text, sessionId: activeSessionId }];
    });
  };

  /**
   * Favoriyi tarifin geçtiği sohbette açar ve mesaja kaydırır; yeni istek gitmez.
   * Oturum silinmişse tarif adı yeni bir sohbette sorulur.
   */
  const handleOpenFavorite = (fav: Favorite) => {
    setIsFavoritesOpen(false);
    const session = sessions.find(s => s.id === fav.sessionId);
    if (session && session.messages.some(m => m.id === fav.id)) {
      setMessages(session.messages);
      setActiveSessionId(session.id);
      setIsSidebarOpen(false);
      setHighlightedMessageId(fav.id);
    } else {
      handleSendMessage(fav.title, true);
    }
  };

  const handleRemoveFavorite = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  const handleSaveSettings = ({ color, backgroundMode: newBackgroundMode }: { color: string; backgroundMode: BackgroundMode }) => {
    setCustomColor(color);
    setBackgroundMode(newBackgroundMode);
  };

  return (
    <div className="layout-container">
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay d-mobile" 
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`sidebar-wrapper ${isSidebarOpen ? 'open' : ''}`}>
        <Sidebar
          onNewChat={() => { setMessages([]); setActiveSessionId(null); }}
          history={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {/* Main Content */}
      <div className="main-area">
          {/* key vermiyoruz: mesaj sayısına bağlı remount, deseni her mesajda
              sıfırdan kurup animasyonu başa sardırıyordu. */}
          <BackgroundPattern mode={backgroundMode} />
        <header className="header">
          <div className="header-left">
            <button 
              className="menu-btn d-mobile"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div className="header-icon">
              <ChefHat size={32} />
            </div>
            <div>
              <h1>ŞefBot</h1>
              <p>Yapay Zeka Destekli Yemek Tarifi Asistanı</p>
            </div>
          </div>
          
          <button 
            className="icon-btn fav-toggle-btn"
            onClick={() => setIsFavoritesOpen(true)}
            title="Favorileri Göster"
          >
            <Heart size={24} className={favorites.length > 0 ? "text-primary" : ""} />
            {favorites.length > 0 && (
              <span className="badge">{favorites.length}</span>
            )}
          </button>
        </header>
        
        <main className="chat-container">
          {messages.length === 0 ? (
            <div className="hero-section">
              <div className="hero-icon">
                <ChefHat size={64} />
              </div>
              <h2 className="hero-title">Bugün ne pişirelim? 🍳</h2>
              <p className="hero-subtitle">
                Evde olan malzemeleri yazabilir veya canının çektiği bir yemeği söyleyebilirsin. Sana en lezzetli ve pratik tarifleri hazırlamak için buradayım!
              </p>
              
              <div className="hero-chips">
                <button className="suggestion-chip" onClick={() => handleSendMessage("Tavuklu yemek tarifi ver")}>
                  🍗 Tavuk yemekleri
                </button>
                <button className="suggestion-chip" onClick={() => handleSendMessage("Sağlıklı ve düşük kalorili tarif öner")}>
                  🥗 Sağlıklı tarifler
                </button>
                <button className="suggestion-chip" onClick={() => handleSendMessage("15 dakikada hazırlayabileceğim pratik bir tarif ver")}>
                  ⚡ 15 dakikalık tarifler
                </button>
                <button className="suggestion-chip" onClick={() => handleSendMessage("Güzel bir tatlı tarifi ver")}>
                  🍰 Tatlı öner
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onToggleFavorite={handleToggleFavorite}
                onSelect={handleSendMessage}
                selectionDisabled={isLoading}
                isFavorite={favorites.some(f => f.id === msg.id)}
                isHighlighted={msg.id === highlightedMessageId}
              />
            ))
          )}
          
          {/* Yazıyor göstergesi yalnızca yanıtı beklenen sohbette görünür */}
          {isLoading && pendingSessionId === activeSessionId && (
            <div className="message-wrapper bot">
              <div className="avatar bot">
                <ChefHat size={20} />
              </div>
              <div className="message-content">
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
        </main>
        
        <MessageInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>

      {/* Favorites Drawer */}
      {isFavoritesOpen && (
        <div 
          className="favorites-overlay"
          onClick={() => setIsFavoritesOpen(false)}
        ></div>
      )}
      <FavoritesPanel
        isOpen={isFavoritesOpen}
        favorites={favorites}
        onClose={() => setIsFavoritesOpen(false)}
        onRemove={handleRemoveFavorite}
        onOpen={handleOpenFavorite}
      />

      {isSettingsOpen && (
        <SettingsPage 
          customColor={customColor}
          backgroundMode={backgroundMode}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
