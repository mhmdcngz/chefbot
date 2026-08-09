# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

ŞefBot — Türk mutfağı RAG sohbet asistanı. İki bağımsız uygulama:

- `yzg-_chatbot_backend/` — FastAPI + ChromaDB + sentence-transformers
- `yzgiichatbotfrontend/` — React 18 + TypeScript + Vite (kütüphanesiz CSS)

**Dil kuralı:** Tüm kullanıcıya görünen metinler, docstring'ler ve yorumlar Türkçe. Kod tanımlayıcıları İngilizce, veri alanları Türkçe (`tarif_adi`, `malzemeler`, `yapilis_adimlari`).

## Komutlar

Backend (`yzg-_chatbot_backend/` içinden çalıştır — importlar `app.*` mutlak yolunu kullanır):

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload          # http://localhost:8000, /docs
```

Veri yükleme (Chroma boşken /chat `warning` döner):

```bash
python vector_db_builder.py data/sample_tarifler.json   # argümansız varsayılan: recipes_groq_cleaned.json (repoda yok, .gitignore'da)
python -m app.ingestion_service data/sample_tarifler.json
```

Frontend:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # eslint 9 flat config
```

Notlar:
- Projede hiç test yok; test koşucusu da bağımlılıklarda yok.
- İlk `/chat` isteği embedding modelini (`intfloat/multilingual-e5-small`) indirip belleğe alır; ilk yanıt yavaştır. `RAGEngine.close()` modeli bilerek bellekte bırakır.

## Mimari

### İstek akışı

`App.tsx` → `fetch('/api/chat')` → Vite proxy (`/api` öneki soyulur) → FastAPI `POST /chat` → RAG (Chroma) → LLM sağlayıcısı → `ChatResponse`.

Frontend üretim derlemesinde proxy yoktur; deploy edilecekse `/api` yönlendirmesi reverse proxy ile sağlanmalı veya istek URL'i değiştirilmeli.

### E5 önek sözleşmesi (`rag_engine.py`)

Doküman metni Chroma'ya **ham** yazılır; embedding üretimi sırasında önek eklenir: ingestion `embed_passages_sync` ile `passage: `, sorgu `embed_query_sync` ile `query: `. Yeni bir yazma yolu eklenirken bu iki fonksiyon dışına çıkılırsa geri getirme kalitesi sessizce bozulur. Ingestion ve API aynı `embedding_model` ve `chroma_collection_name` değerlerini kullanmak zorunda.

Bloklayan tüm çağrılar (`encode`, Chroma sorgusu, ingestion) `asyncio.to_thread` ile sarmalanır.

### "Hangisini istersiniz?" sözleşmesi — üç yerde bağlı

`llm_service.py`'deki `SYSTEM_PROMPT_TURKISH_CHEF` modelden iki mod ister: numaralı liste (son satır `Hangisini istersiniz?`) veya tek tarif şablonu. Bu ifade üç yerde string olarak aranır:

1. `llm_service.py` — sistem promptu bunu üretmesini söyler
2. `main.py:_is_list_selection` — son asistan mesajında görürse ve kullanıcı kısa cevap verdiyse **RAG atlanır** (seçim, arama değil)
3. `ChatMessage.tsx` — bu ifadeyi içeren yanıtta numaralı satırları ayrıştırıp tıklanabilir "seçim çipi" üretir

İfadeyi ya da liste biçimini değiştiriyorsan üçünü birlikte değiştir.

### RAG atlama sezgileri (`main.py`)

- 5 karakterden kısa veya 2 kelimeden az mesaj → RAG/LLM'e hiç gitmeden hazır uyarı yanıtı
- `_is_reference_query`: ≤5 kelime ve sıra sözcüğü içeriyorsa ("ikinci", "3.") → RAG atlanır, LLM geçmişten cevaplar
- Atlama durumunda boş `RAGRetrieveResult` üretilir; LLM bağlamsız çağrılır

### LLM soyutlaması (`llm_service.py`)

`LLMService` Protocol'ünü uygulayan üç sınıf, `LLM_PROVIDER` ile seçilir (`get_llm_service`):
- `mock` (varsayılan) — anahtarsız geliştirme
- `groq` — OpenAI uyumlu endpoint; 429'da `retry-after` ile 3 deneme; yanıtta aynı satır 2'den fazla tekrarlıyorsa kesilir (küçük modellerde döngü koruması)
- `anthropic`/`claude` — `NotImplementedError` → `/chat` bunu HTTP 501'e çevirir

Geçmiş: frontend son 8 mesajı gönderir, Groq katmanı yine son 8'i modele iletir.

### Ingestion (`ingestion_service.py`)

Girdi biçimleri: JSON kök listesi, `{"chunks": [...]}`, veya `text|content|chunk|body` sütunlu CSV. `text` alanı yoksa ama `tarif_adi` varsa `_recipe_page_content` ile Türkçe tek parça metin sentezlenir. `malzemeler` ve `yapilis_adimlari` metadata'ya yazılmaz (Chroma skalar sınırı + gürültü). ID yoksa metin sha256'sından türetilir ve `upsert` kullanılır → aynı dosyayı tekrar yüklemek idempotenttir.

### Yapılandırma (`config.py`)

Chroma ayarları bilinçli olarak `APP_` önekli alias kullanır (`APP_CHROMA_PERSIST_DIR`) — makinede kalmış genel `CHROMA_PERSIST_DIR` ile çakışmayı önlemek için. `get_settings()` `lru_cache`'lidir; testte ayar değiştirmek için cache temizlenmeli. `CORS_ORIGINS=*` ise `allow_credentials` otomatik olarak kapanır.

Hız sınırı: slowapi, IP başına 20/dakika. `/chat` imzasındaki `request: Request` parametresi slowapi için zorunludur, kullanılmıyor görünse de silinmemeli.

### Frontend durum ve tema

- Tüm uygulama durumu `App.tsx` içinde `useState`; sohbet oturumları yalnızca bellekte tutulur (yenilemede kaybolur).
- Tema tek bir `--primary-color`'dan türetilir: `utils/themeColors.ts:getDerivedThemeVars` CSS değişkenlerini hesaplayıp `document.documentElement`'e yazar. `index.css`'te aynı değişkenlerin `color-mix()` tabanlı başlangıç değerleri var. Kalıcılık: `localStorage` `chefbot-color` ve `chefbot-bg`.
- Paylaşılan tipler: `src/types.ts` (`Message`, `ChatSession`), `src/theme.ts` (`BackgroundMode`). Mesaj şeklini bileşen içinde yeniden tanımlama.

## Repo durumu

Klasörler yakın zamanda `yzgii/` altından kök dizine taşındı; `git status` bunu eski yolların silinmesi + iki takipsiz dizin olarak gösteriyor (henüz commit edilmedi). `git log --follow` olmadan dosya geçmişi kopuk görünür.
