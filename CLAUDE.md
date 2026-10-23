# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

ŞefBot — Türk mutfağı RAG sohbet asistanı. İki bağımsız uygulama:

- `backend/` — FastAPI + ChromaDB + sentence-transformers
- `frontend/` — React 18 + TypeScript + Vite (kütüphanesiz CSS)

**Dil kuralı:** Tüm kullanıcıya görünen metinler, docstring'ler ve yorumlar Türkçe. Kod tanımlayıcıları İngilizce, veri alanları Türkçe (`tarif_adi`, `malzemeler`, `yapilis_adimlari`).

## Komutlar

Backend (`backend/` içinden çalıştır — importlar `app.*` mutlak yolunu kullanır):

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
2. `main.py:_offers_selection` — son asistan mesajı ifadeyi (soru işaretsiz aranır) **ve** en az bir numaralı satır içeriyorsa liste sunulmuş sayılır; `_is_list_selection` buna bakıp kısa kullanıcı cevabını **seçim** sayar, `_last_offered_list` numaralı satırlardan tarif adlarını çıkarır
3. `ChatMessage.tsx` — aynı ölçütle (ifade + numaralı satır) tıklanabilir "seçim çipi" üretir; liste mesajında favori butonu gizlenir

Tarif adı satırdan aynı ayraç kümesiyle ayrılır: `:`, ` — `, ` – `, ` - ` (`main.py:_ITEM_NAME_SEPARATOR` ve `ChatMessage.tsx`'teki regex). Model `1. **Ad** — açıklama` biçimini kullanıyor; ayraçlar uyuşmazsa açıklama RAG sorgusuna ve `(Seçilen tarif: ...)` notuna karışır.

İfadeyi, liste biçimini ya da ayraçları değiştiriyorsan üçünü birlikte değiştir.

### Seçim akışı ve RAG (`main.py`)

Her yolda RAG'dan geçilir; tarif metni bağlama girmeden yanıt üretilmez. Kullanıcı "2" ya da "ikinci" dediğinde bu metinle arama yapmak anlamsız, aramayı atlamak ise tarifi modelin belleğine bırakır (uydurma malzeme/miktar üretir). Bu yüzden seçim önce **çözülür**:

- `_is_reference_query` (≤5 kelime + sıra sözcüğü) veya `_is_list_selection` → seçim bağlamı
- `_last_offered_list` son asistan mesajındaki numaralı listeyi `{sıra: tarif adı}` olarak çıkarır
- `_resolve_selection` rakam ("2"), sıra sözcüğü ("ikinci") veya isimle eşleştirir. `_ordinal_index` Türkçe ekleri kabul eder ("üçüncüsü", "ikincisini", "ilki", "2.si", "3'ü"; ek ≤4 harf). Yalın rakam yalnızca ≤2 kelimelik mesajda seçimdir — "2 kişilik menemen" yeni aramadır. Karşılaştırmalar `_tr_lower` ile yapılır (`str.lower()` "İ"yi bozar)
- Çözülen **tarif adı** RAG sorgusu olur; ayrıca LLM'e giden mesaja `(Seçilen tarif: X ...)` notu eklenir — bağlam sırası listedeki sırayla aynı olmadığı için model aksi halde yanlış tarifi anlatıyor
- Yalnızca seçim çözülemezse boş `RAGRetrieveResult` üretilir (kısa mesajla arama alakasız tarif getirir)
- 5 karakterden kısa **ve** 2 kelimeden az ilk mesaj → RAG/LLM'e hiç gitmeden hazır uyarı yanıtı

### LLM soyutlaması (`llm_service.py`)

**Tek sağlayıcı: Gemini**, OpenAI-uyumlu endpoint üzerinden (`GeminiLLMService`). Groq ve Anthropic yolları bilinçli olarak kaldırıldı — geri eklenmemeli.

**Uydurma yasağı — sistem promptunun temel kuralı.** Tarifler yalnızca dökümanlardan verilir; malzeme, miktar, süre, yöntem ve adımlar uydurulmaz, istenen tarif yoksa model bunu söyler. `_build_user_content` bağlamsız dalda da tarif vermeyi yasaklar. Bu yasak **liste modunu kapsamaz**: KURAL 5 modele gelen dökümanların hepsini değerlendirip en az 3 madde listelemesini söyler. Bu kural olmadan model "kolay tatlı" gibi sorgularda kritere tam uymayanları eleyip tek maddelik liste üretiyordu.

**Mock sağlayıcı yok, bilinçli bir karar.** Anahtar eksikse veya API hata verirse sahte yanıt üretilmez; hata `/chat`'ten 500 + `detail` olarak döner ve frontend bunu sohbet balonunda gösterir. Bu yüzden hata mesajları kullanıcıya okunur olmalı: `_api_error` sağlayıcının gövdedeki mesajını çıkarır (`raise_for_status()` sadece durum kodunu verir, "model bulunamadı" gibi asıl bilgi gövdededir).

Model varsayılanı `gemini-3.5-flash-lite`. Seçim sebebi ücretsiz katman kotası: Flash Lite **500 RPD**, tam Flash modelleri yalnızca **20 RPD**. TPM (250K) hiç bağlayıcı değil, tek sınır günlük istek sayısı. Model değiştirirken bu kotayı kontrol et.

Diğer davranışlar:
- 429'da `retry-after` ile 3 deneme (`_parse_retry_after` ondalıklı başlığı okur, 60 sn üst sınır). Ücretsiz katmanda 429 rutindir, bu yol sık çalışır.
- `frequency_penalty`/`presence_penalty` **gönderilmiyor** — Gemini'nin uyumluluk katmanı desteklemediği parametreleri sessizce yok sayar, dolayısıyla yanıltıcı olurlardı. Tekrar koruması `_trim_repetitions` ile yapılır.
- `_trim_repetitions`: aynı satır 2'den fazla geçerse kalanı atar. Markdown yapı satırları (`---`, `####`, `|`, `>`) sayıma girmez — tarif şablonu birden çok `---` içerdiği için bunlar sayılsaydı yanıt ortadan kırpılırdı.
- `LLM_MAX_TOKENS` (2048) düşünme token'larını da kapsar; `LLM_REASONING_EFFORT` (low) yükseltilirse yanıt kesilebilir. Boş içerik hatası bu ikisine yönlendirir.

Geçmiş: frontend son 8 mesajı gönderir (`isError` işaretli hata balonları hariç — aksi halde hata sonrası seçim çözülmez), LLM katmanı yine son 8'i modele iletir.

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

Klasörler `yzgii/` altından kök dizine taşındı (commit `fb70ed2`). `git log --follow` olmadan dosya geçmişi kopuk görünür.

Vektör veritabanı `backend/turkish_cuisine_db/` içinde, **3320 tarif** (`.gitignore`'da, repoda tutulmuyor). Kaynak `backend/recipes_groq_cleaned.json` da `.gitignore`'da; asıl kopyası https://github.com/mbesirkesen/yzg-_chatbot_backend reposunun `main` dalında. DB kaybolursa `python vector_db_builder.py` ile yeniden üretilir (GPU'da ~1 dk); ID olmadığı için upsert idempotenttir.

Kaynak JSON'da 5288 malzemenin `miktar`/`birim` alanı `null`. Eski DB'de bunlar metne `None None kırmızı toz biber` olarak girmişti; `_format_ingredients` artık null alanları atlıyor. `rag_engine.py:_retrieve_sync` içindeki `None` temizliği eski biçimde üretilmiş DB'ler için savunma olarak duruyor.
