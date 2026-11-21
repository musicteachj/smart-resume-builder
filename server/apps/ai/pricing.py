"""What a Claude call costs, at list price, in whole micro-dollars.

Prices are per million tokens and pinned here, per model, because the budget caps are about money.
A price per million tokens in dollars equals the price per token in micro-dollars, so token counts
times these rates give micro-dollars directly. Money is `Decimal`, never `float`.

Source: Anthropic, "Pricing", platform.claude.com/docs/en/about-claude/pricing. The Sonnet 5.5 and
Haiku 5.5 rows were read on 2026-10-14 and the Sonnet 5 row on 2026-11-01 (the same rows open-door
pins in `apps/api/app/ai/pricing.py`).

This module has no Django models, no SDK import, and no network: it is pure math over token counts.
"""

import json
import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_HALF_EVEN, Decimal
from types import MappingProxyType

logger = logging.getLogger(__name__)

# Tokens the request carries beyond its text (message framing, tool and format scaffolding).
INPUT_OVERHEAD_TOKENS = 2_000

# Haiku 5.5 costs more above this many prompt tokens (input, cache reads, and cache writes). The call
# has been billed by then, so it is priced at the higher tier, never refused.
HAIKU = "claude-haiku-5-5"
HAIKU_PROMPT_LIMIT_TOKENS = 100_000

_ONE = Decimal(1)
_MICROS_PER_USD = Decimal(1_000_000)


@dataclass(frozen=True)
class Price:
    """Dollars per million tokens."""

    input_usd_per_mtok: Decimal
    cache_write_5m_usd_per_mtok: Decimal
    cache_read_usd_per_mtok: Decimal
    output_usd_per_mtok: Decimal


# Claude Haiku 5.5 "for prompts over 100,000 tokens".
HAIKU_LONG_PROMPT_PRICE = Price(
    input_usd_per_mtok=Decimal("0.50"),
    cache_write_5m_usd_per_mtok=Decimal("0.625"),
    cache_read_usd_per_mtok=Decimal("0.05"),
    output_usd_per_mtok=Decimal("2.50"),
)

PRICES: Mapping[str, Price] = MappingProxyType(
    {
        "claude-sonnet-5-5": Price(
            input_usd_per_mtok=Decimal("2.00"),
            cache_write_5m_usd_per_mtok=Decimal("2.50"),
            cache_read_usd_per_mtok=Decimal("0.10"),
            output_usd_per_mtok=Decimal("10.00"),
        ),
        # The fallback target when Sonnet 5.5 declines a request; a declined attempt is billed.
        "claude-sonnet-5": Price(
            input_usd_per_mtok=Decimal("2.00"),
            cache_write_5m_usd_per_mtok=Decimal("2.50"),
            cache_read_usd_per_mtok=Decimal("0.20"),
            output_usd_per_mtok=Decimal("10.00"),
        ),
        # Prompts up to 100,000 tokens; HAIKU_LONG_PROMPT_PRICE covers the rest.
        HAIKU: Price(
            input_usd_per_mtok=Decimal("0.10"),
            cache_write_5m_usd_per_mtok=Decimal("0.125"),
            cache_read_usd_per_mtok=Decimal("0.01"),
            output_usd_per_mtok=Decimal("0.50"),
        ),
    }
)


@dataclass(frozen=True)
class Attempt:
    """One model the request may be served by, and the most output it may produce."""

    model: str
    max_tokens: int


def _dearest_price() -> Price:
    """The highest of each rate across every pinned price, so an unknown model is never undercounted
    on any rate, even if no single row is the dearest on all four."""
    prices = (*PRICES.values(), HAIKU_LONG_PROMPT_PRICE)
    return Price(
        input_usd_per_mtok=max(p.input_usd_per_mtok for p in prices),
        cache_write_5m_usd_per_mtok=max(p.cache_write_5m_usd_per_mtok for p in prices),
        cache_read_usd_per_mtok=max(p.cache_read_usd_per_mtok for p in prices),
        output_usd_per_mtok=max(p.output_usd_per_mtok for p in prices),
    )


class UnpricedModelError(LookupError):
    """A model we would request has no pinned price. The app refuses to start with one configured
    (`apps.ai.apps.check_configured_models`), so this only fires if that check was bypassed."""


def unpriced_models(models: Sequence[str]) -> list[str]:
    """The models in `models` with no pinned price, in order, without duplicates."""
    return list(dict.fromkeys(m for m in models if m not in PRICES))


def _price_of(model: str, prompt_tokens: int, *, served: bool) -> Price:
    """The pinned price for this model and prompt size.

    A model we request must have a price (reserving at a guess would let the budget undercount), so an
    unknown one raises. A model Anthropic served that we didn't request can't be refused after the fact:
    the call is already billed and must still be counted, so it gets the dearest rates and a warning
    naming it."""
    price = PRICES.get(model)
    if price is None:
        if not served:
            raise UnpricedModelError(f"No price is pinned for the model {model}")
        logger.warning(
            "No price is pinned for the served model %s; counting it at the dearest price", model
        )
        return _dearest_price()
    if model == HAIKU and prompt_tokens > HAIKU_PROMPT_LIMIT_TOKENS:
        return HAIKU_LONG_PROMPT_PRICE
    return price


def usd_to_micros(usd: Decimal) -> int:
    """Dollars to whole micro-dollars, rounding a half to the even digit."""
    return int((usd * _MICROS_PER_USD).quantize(_ONE, rounding=ROUND_HALF_EVEN))


def cost_micros(
    model: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> int:
    """The cost of one model's usage in whole micro-dollars (half to even). This prices what was
    served, so an unknown model is counted at the dearest rates rather than refused.

    `input_tokens` is the plain input only; cache reads and writes are reported separately by the
    API. The Haiku long-prompt tier is chosen from all three together.
    """
    prompt_tokens = input_tokens + cache_read_tokens + cache_write_tokens
    price = _price_of(model, prompt_tokens, served=True)
    exact = (
        Decimal(input_tokens) * price.input_usd_per_mtok
        + Decimal(cache_write_tokens) * price.cache_write_5m_usd_per_mtok
        + Decimal(cache_read_tokens) * price.cache_read_usd_per_mtok
        + Decimal(output_tokens) * price.output_usd_per_mtok
    )
    return int(exact.quantize(_ONE, rounding=ROUND_HALF_EVEN))


def reservation_micros(attempts: Sequence[Attempt], input_tokens: int) -> int:
    """The most a request could cost, in whole micro-dollars rounded up, reserved before the call.

    Every attempt may be billed (a declined attempt is, then a fallback runs), so the attempts are
    summed. Input is priced at the dearer of the plain and cache-write rates, which bounds every
    split of the same input between plain and cached; output is priced in full at `max_tokens`.
    Raises UnpricedModelError for an attempt whose model has no pinned price.
    """
    total = Decimal(0)
    for attempt in attempts:
        price = _price_of(attempt.model, input_tokens, served=False)
        input_rate = max(price.input_usd_per_mtok, price.cache_write_5m_usd_per_mtok)
        total += (
            Decimal(input_tokens) * input_rate
            + Decimal(attempt.max_tokens) * price.output_usd_per_mtok
        )
    return int(total.quantize(_ONE, rounding=ROUND_CEILING))


def _count(value: int | None) -> int:
    return value or 0


def served_cost_micros(resp, *, requested_model: str) -> int:
    """What a response cost, in whole micro-dollars.

    When `resp.usage.iterations` is non-empty, every entry is priced at its own model (falling back
    to `resp.model`) and summed, so a declined attempt and its fallback both count. Otherwise
    `resp.usage` is priced at `resp.model`, falling back to `requested_model`.
    """
    usage = resp.usage
    iterations = getattr(usage, "iterations", None)
    if iterations:
        return sum(
            cost_micros(
                getattr(item, "model", None) or resp.model,
                input_tokens=_count(item.input_tokens),
                output_tokens=_count(item.output_tokens),
                cache_read_tokens=_count(getattr(item, "cache_read_input_tokens", None)),
                cache_write_tokens=_count(getattr(item, "cache_creation_input_tokens", None)),
            )
            for item in iterations
        )
    return cost_micros(
        getattr(resp, "model", None) or requested_model,
        input_tokens=_count(usage.input_tokens),
        output_tokens=_count(usage.output_tokens),
        cache_read_tokens=_count(getattr(usage, "cache_read_input_tokens", None)),
        cache_write_tokens=_count(getattr(usage, "cache_creation_input_tokens", None)),
    )


def input_token_bound(*, system: str, messages: list[dict], output_config: dict | None = None) -> int:
    """An upper bound on a request's input tokens, from its UTF-8 byte length.

    Assumes no token is shorter than one byte, so the byte length of the serialized request can
    never be below its token count. Bytes, not characters: one character can be four bytes and
    still cost more than one token. `INPUT_OVERHEAD_TOKENS` covers what the text does not.
    `surrogatepass` keeps a lone surrogate from a JSON body from raising (it counts 3 bytes, still an
    upper bound).
    """
    def size_of(text: str) -> int:
        return len(text.encode("utf-8", errors="surrogatepass"))

    size = (
        size_of(system)
        + size_of(json.dumps(messages, ensure_ascii=False))
        + size_of(json.dumps(output_config or {}, ensure_ascii=False))
    )
    return size + INPUT_OVERHEAD_TOKENS
