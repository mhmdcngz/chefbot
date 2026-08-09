/** Sohbetteki tek bir mesaj. */
export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  /** Backend uyarısı (ör. vektör koleksiyonu boş). */
  warning?: string | null;
}

/** Kenar çubuğunda listelenen sohbet oturumu (yalnızca bellekte tutulur). */
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}
