"""
LLM katmanı: tek sağlayıcı olarak Gemini'nin OpenAI-uyumlu endpoint'i.

Mock sağlayıcı bilinçli olarak yok — anahtar eksikse veya API hata verirse
sahte yanıt üretmek yerine hata /chat üzerinden arayüze taşınır.
"""

from __future__ import annotations

import asyncio
import re
import httpx
from typing import Protocol, runtime_checkable

from app.config import Settings, get_settings

# Sistem talimatı (sabit)
SYSTEM_PROMPT_TURKISH_CHEF = (
    "Sen bir Türk mutfağı şefisin. "
    "Görevin yalnızca Türk mutfağı, yemek tarifleri, malzemeler ve pişirme teknikleri hakkında yardım etmektir. "
    "Kullanıcının sorusu bu konularla ilgili değilse, kibarca konuya yönlendir ve başka sorulara cevap verme. "
    "Her zaman yalnızca Türkçe yanıt ver, başka bir dil kullanma. "
    "Verilen döküman parçalarına dayan; döküman yoksa genel Türk mutfağı bilgini kullan. "
    "Yanıtlarını sıcak, samimi ve bilgilendirici bir üslupla ver.\n\n"
    "YANIT FORMATI — aşağıdaki kurallara kesinlikle uy:\n\n"
    "KURAL 1 — Döküman metnini asla olduğu gibi kopyalama. Bilgiyi kullanarak kendın yaz.\n"
    "KURAL 2 — Yanıtta seçenek listesini tekrarlama.\n"
    "KURAL 3 — Bir yanıtta yalnızca bir şey yap: ya liste ver, ya tarif ver.\n\n"
    "Kullanıcı genel tarif isterse (kategori: 'tavuklu tarif', 'tatlı öner' vb.):\n"
    "  Sadece numaralı liste: isim ve tek cümle açıklama. Son satır: 'Hangisini istersiniz?'\n"
    "  ASLA malzeme veya yapılış adımı yazma.\n\n"
    "Kullanıcı belirli bir tarif seçerse (isim veya numara), YALNIZCA şu şablonu kullan:\n\n"
    "### [Tarif Adı]\n\n"
    "🕐 **Süre:** [X dk] &nbsp;|&nbsp; 📊 **Zorluk:** [Kolay/Orta/Zor] &nbsp;|&nbsp; 🍳 **Yöntem:** [yöntem]\n\n"
    "---\n\n"
    "#### 🛒 Malzemeler\n\n"
    "- miktar malzeme\n\n"
    "---\n\n"
    "#### 👨‍🍳 Yapılış\n\n"
    "1. Adım\n\n"
    "Şablonun dışına çıkma. Ekstra cümle, tekrar veya liste ekleme."
)


@runtime_checkable
class LLMService(Protocol):
    """Tüm LLM sağlayıcıları bu arayüzü uygular."""

    async def generate(
        self, user_message: str, context: str, history: list[dict] | None = None
    ) -> str:
        """Kullanıcı sorusu, RAG bağlamı ve konuşma geçmişine göre asenkron metin üretir."""
        ...


# Markdown yapı satırları (ayraç, başlık, tablo) meşru olarak tekrar eder; tekrar sayımına girmez.
_STRUCTURAL_LINE = re.compile(r"^(-{3,}|\*{3,}|_{3,}|#{1,6}\s|\||>)")


def _parse_retry_after(raw: str | None, default: float = 10.0) -> float:
    """
    429 yanıtındaki retry-after saniyesini okur.
    Sağlayıcılar bu başlığı ondalıklı ("7.66") döndürebildiği için float ile ayrıştırılır;
    okunamazsa varsayılan, aşırı uzun beklemeyi önlemek için üst sınır 60 sn.
    """
    try:
        seconds = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(0.0, min(seconds, 60.0))


def _trim_repetitions(content: str, max_repeat: int = 2) -> str:
    """
    Küçük modellerin takıldığı tekrar döngüsünü keser: aynı satır max_repeat'ten
    fazla geçtiğinde kalanı atar. Markdown yapı satırları sayılmaz — aksi halde
    tarif şablonundaki üçüncü '---' tüm yanıtı kırpardı.
    """
    seen: dict[str, int] = {}
    kept: list[str] = []
    for line in content.split("\n"):
        key = line.strip()
        if key and not _STRUCTURAL_LINE.match(key):
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > max_repeat:
                break
        kept.append(line)
    return "\n".join(kept).strip()


def _build_user_content(user_message: str, context: str) -> str:
    """Gerçek API entegrasyonunda system / user ayrımı için kullanıcı tarafı metni."""
    if context.strip():
        return (
            "Aşağıdaki döküman parçalarını kullanarak soruyu yanıtla.\n\n"
            f"Dökümanlar:\n{context}\n\n"
            f"Soru: {user_message.strip()}"
        )
    return (
        "Döküman bağlamı yok. Yanıtı yalnızca yukarıdaki konuşma geçmişine ve "
        "Türk mutfağı bilgine dayanarak ver.\n\n"
        f"Soru: {user_message.strip()}"
    )


def _api_error(response: httpx.Response) -> RuntimeError:
    """
    Hata yanıtını gövdesiyle birlikte okunur hale getirir.
    raise_for_status() yalnızca durum kodunu söyler; sağlayıcının asıl mesajı
    ("model bulunamadı", "geçersiz API anahtarı" vb.) gövdede gelir.
    """
    detail = ""
    try:
        data = response.json()
        if isinstance(data, dict):
            err = data.get("error")
            if isinstance(err, dict):
                detail = str(err.get("message") or err)
            elif err:
                detail = str(err)
    except ValueError:
        pass
    if not detail:
        detail = response.text[:500]
    return RuntimeError(f"Gemini API {response.status_code}: {detail}")


class GeminiLLMService:
    """
    Gemini'nin OpenAI-uyumlu endpoint'i üzerinden yanıt üretir.
    Başka bir OpenAI-uyumlu sağlayıcıya geçmek için GEMINI_BASE_URL + GEMINI_MODEL yeterli.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def generate(
        self, user_message: str, context: str, history: list[dict] | None = None
    ) -> str:
        if not self._settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY tanımlı değil. Backend klasöründe .env oluşturup "
                "anahtarı girin (https://aistudio.google.com/apikey)."
            )

        messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT_TURKISH_CHEF}]
        for h in (history or [])[-8:]:  # son 4 tur (8 mesaj)
            role = h.get("role", "")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": _build_user_content(user_message, context)})

        # frequency/presence_penalty bilinçli olarak yok: Gemini'nin uyumluluk katmanı
        # desteklemediği parametreleri sessizce yok sayıyor. Tekrar koruması
        # _trim_repetitions ile yapılıyor.
        payload = {
            "model": self._settings.gemini_model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": self._settings.llm_max_tokens,
            "reasoning_effort": self._settings.llm_reasoning_effort,
        }
        headers = {
            "Authorization": f"Bearer {self._settings.gemini_api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self._settings.gemini_base_url.rstrip('/')}/chat/completions"
        timeout = httpx.Timeout(60.0, connect=15.0)
        max_retries = 3
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(max_retries):
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 429:
                    retry_after = _parse_retry_after(response.headers.get("retry-after"))
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_after)
                        continue
                    raise RuntimeError(
                        f"Gemini API istek limiti aşıldı ({max_retries} deneme yapıldı). "
                        f"Ücretsiz katmanda '{self._settings.gemini_model}' için günlük/dakikalık "
                        f"kota dolmuş olabilir; birkaç dakika bekleyip tekrar deneyin."
                    )
                if response.status_code >= 400:
                    raise _api_error(response)
                data = response.json()
                break

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError(f"Gemini yanıtında choices yok: {str(data)[:300]}")
        message = choices[0].get("message") or {}
        content = (message.get("content") or "").strip()
        if not content:
            finish = choices[0].get("finish_reason")
            raise RuntimeError(
                f"Gemini boş içerik döndü (finish_reason={finish}). "
                "Yanıt tamamen düşünme token'larına gitmiş olabilir; "
                "LLM_MAX_TOKENS'ı artırmayı veya LLM_REASONING_EFFORT'u düşürmeyi deneyin."
            )
        return _trim_repetitions(content)


def get_llm_service(settings: Settings | None = None) -> LLMService:
    """Tek sağlayıcı: Gemini. Mock yok — hata durumunda gerçek hata yüzeye çıkar."""
    return GeminiLLMService(settings or get_settings())


__all__ = [
    "SYSTEM_PROMPT_TURKISH_CHEF",
    "LLMService",
    "GeminiLLMService",
    "get_llm_service",
    "_build_user_content",
]
