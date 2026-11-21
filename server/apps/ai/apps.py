from django.apps import AppConfig
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def check_configured_models() -> None:
    """Refuse to start if a model we would request has no pinned price: `AI_MODEL_SIMPLE`,
    `AI_MODEL_TAILOR`, and every server-side fallback target. Run from `ready()`, so gunicorn
    won't boot with one (Django's system checks don't run under gunicorn)."""
    from .pricing import unpriced_models
    from .service import _FALLBACKS

    configured = [settings.AI_MODEL_SIMPLE, settings.AI_MODEL_TAILOR, *_FALLBACKS.values()]
    missing = unpriced_models(configured)
    if missing:
        raise ImproperlyConfigured(
            f"No price is pinned in apps/ai/pricing.py for the configured AI model(s): {', '.join(missing)}. "
            "Add the price, or set AI_MODEL_SIMPLE / AI_MODEL_TAILOR to a priced model."
        )


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai"
    label = "ai"

    def ready(self) -> None:
        check_configured_models()
