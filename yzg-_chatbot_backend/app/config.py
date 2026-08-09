"""
Uygulama yapılandırması: Chroma yolu, embedding modeli, CORS ve gelecek API anahtarları.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Ortam değişkenleri ve varsayılanlar."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    chroma_persist_dir: str = Field(
        default="./turkish_cuisine_db",
        description="Chroma kalıcı veritabanı klasörü",
        # Sadece APP_*: makinede kalmış genel CHROMA_PERSIST_DIR ile çakışmayı önler.
        validation_alias="APP_CHROMA_PERSIST_DIR",
    )
    chroma_collection_name: str = Field(
        default="turkish_cuisine",
        description="Chroma koleksiyon adı",
        validation_alias="APP_CHROMA_COLLECTION_NAME",
    )
    embedding_model: str = Field(
        default="intfloat/multilingual-e5-small",
        description="SentenceTransformers embedding modeli",
    )
    # CORS: boş string veya virgülle ayrılmış origin listesi; "*" tek başına tüm originlere izin
    cors_origins: str = Field(
        default="*",
        description="İzin verilen CORS origin'leri (virgülle ayrılmış veya *)",
    )
    default_top_k: int = Field(
        default=5,
        ge=1,
        le=50,
        description="RAG varsayılan sonuç sayısı",
        validation_alias="DEFAULT_TOP_K",
    )

    # LLM: Gemini (OpenAI-uyumlu endpoint). Tek sağlayıcı, mock yok.
    gemini_api_key: str | None = Field(default=None)
    gemini_model: str = Field(
        default="gemini-3.5-flash-lite",
        description="Ücretsiz katmanda en yüksek günlük kotaya sahip Flash Lite modeli",
    )
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta/openai/",
        description="Gemini OpenAI-uyumlu API taban URL'i",
    )
    llm_max_tokens: int = Field(
        default=2048,
        ge=256,
        le=8192,
        description="Yanıt üst sınırı; düşünme token'ları da bu bütçeden harcanır",
    )
    llm_reasoning_effort: str = Field(
        default="low",
        description="none | minimal | low | medium | high — yüksek değer gecikmeyi ve token tüketimini artırır",
    )

    def cors_origins_list(self) -> list[str]:
        """CORSMiddleware için origin listesi."""
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Önbellekli ayar örneği (her worker için tek Settings)."""
    return Settings()
