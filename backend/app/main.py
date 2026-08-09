"""
FastAPI uygulaması: CORS, /chat (RAG + LLM), /health.
"""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings
from app.llm_service import get_llm_service
from app.rag_engine import RAGEngine, RAGRetrieveResult
from app.schemas import ChatRequest, ChatResponse, SourceItem

# Uvicorn handler'ı yalnızca kendi logger'larına takar; uygulama logları da
# görünsün diye uvicorn'un hata kanalını kullanıyoruz (aksi halde INFO kaybolur).
logger = logging.getLogger("uvicorn.error")

_ORDINAL_TO_INDEX = {
    "ilk": 1, "birinci": 1, "ikinci": 2, "üçüncü": 3, "dördüncü": 4,
    "beşinci": 5, "altıncı": 6, "yedinci": 7, "sekizinci": 8,
    "dokuzuncu": 9, "onuncu": 10,
}
_ORDINAL_WORDS = set(_ORDINAL_TO_INDEX) | {f"{i}." for i in range(1, 11)}


def _is_reference_query(msg: str) -> bool:
    """Sıralı/işaret referansı içeren kısa sorgu mu? (seçim bağlamı sayılır)"""
    words = msg.lower().split()
    return len(words) <= 5 and any(w in _ORDINAL_WORDS for w in words)


_NUMBERED_ITEM = re.compile(r"^\s*(\d+)\.\s+(\S.*)$", re.MULTILINE)


def _offers_selection(assistant_text: str) -> bool:
    """
    Asistan mesajı gerçekten seçilebilir bir liste sundu mu?

    Yalnızca "Hangisini istersiniz?" ifadesine bakmak yetmiyor: model bazen
    hiç liste vermeden bu cümleyi ekliyor (ör. dökümanlarda uygun tarif
    bulunamadığında). O durumda sonraki mesaj bağlamsız kalıyordu. Frontend de
    çipleri numaralı satırlara göre üretiyor; iki taraf aynı ölçütü kullanmalı.
    """
    return "Hangisini istersiniz" in assistant_text and bool(
        _NUMBERED_ITEM.search(assistant_text)
    )


def _is_list_selection(msg: str, history: list) -> bool:
    """Önceki bot mesajında liste varsa ve kullanıcı kısa bir cevap verdiyse seçimdir."""
    if len(msg.split()) > 7 or '?' in msg:
        return False
    for h in reversed(history):
        if h.role == "assistant":
            return _offers_selection(h.content)
    return False


def _last_offered_list(history: list) -> dict[int, str]:
    """Son asistan mesajındaki numaralı listeyi {sıra: tarif adı} olarak çıkarır."""
    for h in reversed(history):
        if h.role == "assistant":
            if not _offers_selection(h.content):
                return {}
            items: dict[int, str] = {}
            for num, rest in _NUMBERED_ITEM.findall(h.content):
                # Satır biçimi "3. Çerkez Tavuğu: kısa açıklama" — adı açıklamadan ayır.
                name = re.sub(r"[*_`]", "", rest.split(":", 1)[0]).strip(" .-")
                if name:
                    items[int(num)] = name
            return items
    return {}


def _resolve_selection(msg: str, items: dict[int, str]) -> str | None:
    """
    Kullanıcının seçimini listedeki tarif adına çözer: rakam ("2"), sıra sözcüğü
    ("ikinci") veya doğrudan isim. Çözülen ad RAG sorgusu olarak kullanılır;
    "2" ile arama yapmak alakasız tarifler getireceği için bu adım şart.
    """
    if not items:
        return None
    lowered = msg.lower()
    for word in lowered.split():
        stripped = word.strip(".,!?:")
        if stripped.isdigit() and int(stripped) in items:
            return items[int(stripped)]
        index = _ORDINAL_TO_INDEX.get(stripped)
        if index in items:
            return items[index]
    for name in items.values():
        if name.lower() in lowered or lowered in name.lower():
            return name
    return None


limiter = Limiter(key_func=get_remote_address, default_limits=["20/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama ömrü: RAG motoru ve LLM servis örnekleri."""
    settings = get_settings()
    if not settings.gemini_api_key:
        # Sunucu yine de açılır (arayüz ve /health çalışsın diye) ama /chat hata döndürür.
        logger.error(
            "GEMINI_API_KEY tanımlı degil — /chat istekleri hata donecek. "
            ".env dosyasi olusturup anahtari girin: https://aistudio.google.com/apikey"
        )
    else:
        logger.info("LLM hazir: %s", settings.gemini_model)
    rag = RAGEngine(settings)
    llm = get_llm_service(settings)
    app.state.settings = settings
    app.state.rag = rag
    app.state.llm = llm
    yield
    rag.close()


app = FastAPI(
    title="Türk Mutfağı RAG Chatbot API",
    description="RAG tabanlı Türk mutfağı asistanı backend'i.",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_settings_for_cors = get_settings()
_origins = _settings_for_cors.cors_origins_list()
_allow_credentials = "*" not in _origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, Any]:
    """Tarayıcıda / açıldığında API özeti (404 yerine)."""
    return {
        "service": app.title,
        "docs": "/docs",
        "health": "/health",
        "chat": "POST /chat",
        "hint": "Sohbet için POST /chat ve JSON gövde: {\"message\": \"...\"}",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    """Tarayıcının otomatik favicon isteğini 404 logu üretmeden sonlandırır."""
    return Response(status_code=204)


@app.get("/health")
async def health() -> dict[str, Any]:
    """Basit sağlık kontrolü ve koleksiyondaki döküman sayısı."""
    rag: RAGEngine = app.state.rag
    settings = app.state.settings
    try:
        count = await rag.collection_document_count()
    except Exception as e:  # noqa: BLE001
        return {
            "status": "degraded",
            "error": str(e),
            "chroma_collection": settings.chroma_collection_name,
        }
    return {
        "status": "ok",
        "chroma_collection": settings.chroma_collection_name,
        "document_count": count,
    }


@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """
    Kullanıcı mesajını alır, Chroma'dan bağlam getirir, LLM ile yanıt üretir.
    """
    msg = body.message.strip()
    # Kısa mesaj koruması yalnızca sohbetin İLK mesajında anlamlı. Devamında
    # "ikinci" ya da tek kelimelik bir tarif adı ("Menemen") geçerli bir seçimdir;
    # burada engellenirse _is_reference_query / _is_list_selection'a hiç ulaşamaz
    # ve seçim çipleri çalışmaz. Ayrıca koşul OR değil AND: "Kısır" (5 harf,
    # tek kelime) meşru bir sorgudur.
    if not body.history and len(msg) < 5 and len(msg.split()) < 2:
        return ChatResponse(
            answer="Lütfen sorunuzu daha ayrıntılı belirtin. "
                   "Örneğin: \"Tavuklu yemek tarifi ver\" veya \"Kolay bir tatlı önerir misin?\"",
        )

    rag: RAGEngine = app.state.rag
    llm = app.state.llm
    settings = app.state.settings

    top_k = body.top_k if body.top_k is not None else settings.default_top_k

    try:
        # Seçim akışında da RAG'dan şaşmıyoruz: kullanıcı "2" ya da "ikinci" dediğinde
        # bu metinle arama yapmak anlamsız, ama aramayı büsbütün atlamak da tarifi
        # modelin belleğine bırakır (uydurma malzeme/miktar üretir). Bunun yerine
        # seçim, önceki listedeki tarif adına çözülüp arama onunla yapılır.
        in_selection = bool(body.history) and (
            _is_reference_query(msg) or _is_list_selection(msg, body.history)
        )
        selection = (
            _resolve_selection(msg, _last_offered_list(body.history)) if in_selection else None
        )

        if selection:
            logger.info("Secim cozuldu: %r -> %r", msg, selection)
            rag_result = await rag.retrieve(selection, top_k)
        elif _is_reference_query(msg) and body.history:
            # "ikinci" listedeki bir maddeye çözülemedi (ör. liste kaymış).
            # Bu metinle arama alakasız tarifler getireceği için bağlamsız gidiyoruz;
            # sistem promptu bu durumda tarif uydurmayı değil, sormayı söylüyor.
            rag_result = RAGRetrieveResult(
                context="", sources=[], raw_documents=[], collection_empty=False
            )
        else:
            # Liste sonrası gelen ama seçime çözülemeyen kısa mesaj ("mercimek çorbası")
            # yeni bir aramadır; normal RAG yolundan geçer.
            rag_result = await rag.retrieve(msg, top_k)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"RAG hatası: {e}") from e

    warning: str | None = None
    if rag_result.collection_empty:
        warning = (
            "Vektör koleksiyonu boş veya henüz veri yüklenmemiş. "
            "Bu yanıt tariflerinize değil, modelin genel Türk mutfağı bilgisine dayanıyor. "
            "Veri yüklemek için: python vector_db_builder.py <dosya.json>"
        )

    # Seçimi modele de bildiriyoruz: ham "üçüncü" mesajıyla model bağlamdaki
    # dökümanlardan hangisinin kastedildiğini bilemiyor (bağlam sırası listedeki
    # sırayla aynı değil) ve yanlış tarifi anlatabiliyor.
    llm_message = (
        f"{msg}\n\n(Seçilen tarif: {selection}. Doğrudan tarif şablonuyla başla, "
        f"giriş cümlesi yazma.)"
        if selection
        else body.message
    )

    try:
        history = [{"role": h.role, "content": h.content} for h in body.history]
        answer = await llm.generate(llm_message, rag_result.context, history)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"LLM hatası: {e}") from e

    sources = [
        SourceItem(
            id=s.id,
            snippet=s.snippet,
            metadata=s.metadata,
        )
        for s in rag_result.sources
    ]

    retrieved = rag_result.raw_documents if body.include_retrieved_chunks else None

    return ChatResponse(
        answer=answer,
        sources=sources,
        retrieved_chunks=retrieved,
        warning=warning,
    )
