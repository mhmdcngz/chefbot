/** Sohbetteki tek bir mesaj. */
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  /** Backend uyarısı (ör. vektör koleksiyonu boş). */
  warning?: string | null;
  /** İstek hatası balonu; backend'e giden geçmişe eklenmez. */
  isError?: boolean;
}

/** Kenar çubuğunda listelenen sohbet oturumu (yalnızca bellekte tutulur). */
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}
