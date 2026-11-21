from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.ai import pricing
from apps.ai.apps import check_configured_models
from apps.ai.pricing import Attempt


def _usage(model=None, inp=0, out=0, kind="message"):
    return SimpleNamespace(type=kind, model=model, input_tokens=inp, output_tokens=out,
                           cache_read_input_tokens=0, cache_creation_input_tokens=0)


def test_prices_match_the_design():
    s55, s5, h = (pricing.PRICES[m] for m in ("claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-5-5"))
    assert (s55.input_usd_per_mtok, s55.output_usd_per_mtok) == (Decimal("2.00"), Decimal("10.00"))
    assert (s5.input_usd_per_mtok, s5.output_usd_per_mtok) == (Decimal("2.00"), Decimal("10.00"))
    assert (h.input_usd_per_mtok, h.output_usd_per_mtok) == (Decimal("0.10"), Decimal("0.50"))


def test_cost_is_whole_micro_dollars():
    assert pricing.cost_micros("claude-sonnet-5-5", input_tokens=3_000, output_tokens=1_500) == 21_000
    assert pricing.cost_micros("claude-haiku-5-5", input_tokens=1_000, output_tokens=200) == 200
    # Haiku's long-prompt tier above 100,000 prompt tokens
    assert pricing.cost_micros("claude-haiku-5-5", input_tokens=120_000, output_tokens=100) == 60_250


def test_an_unknown_served_model_is_priced_at_the_dearest_rates(caplog):
    # Anthropic served a model we didn't request: the call is billed, so it is counted, not refused.
    unknown = pricing.cost_micros("claude-mystery", input_tokens=1_000, output_tokens=1_000)
    assert unknown >= pricing.cost_micros("claude-sonnet-5-5", input_tokens=1_000, output_tokens=1_000)
    assert "claude-mystery" in caplog.text


def test_reservation_covers_every_attempt_at_its_worst():
    both = [Attempt("claude-sonnet-5-5", 8_000), Attempt("claude-sonnet-5", 8_000)]
    assert pricing.reservation_micros(both, input_tokens=37_000) == 345_000  # 2 x (37,000 x 2.50 + 8,000 x 10)
    assert pricing.reservation_micros([Attempt("claude-haiku-5-5", 1_024)], input_tokens=5_500) == 1_200


def test_reservation_uses_haiku_long_prompt_rates_above_100k_tokens():
    # 120,000 x 0.625 (long cache write rate) + 100 x 2.50 (long output rate)
    assert pricing.reservation_micros([Attempt("claude-haiku-5-5", 100)], input_tokens=120_000) == 75_250


def test_served_cost_sums_fallback_iterations():
    usage = SimpleNamespace(input_tokens=3_000, output_tokens=1_500, cache_read_input_tokens=0,
                            cache_creation_input_tokens=0, iterations=[
                                _usage("claude-sonnet-5-5", 3_000, 400),
                                _usage("claude-sonnet-5", 3_000, 1_500, kind="fallback_message")])
    resp = SimpleNamespace(model="claude-sonnet-5", usage=usage)
    assert pricing.served_cost_micros(resp, requested_model="claude-sonnet-5-5") == 31_000


def test_served_cost_without_iterations_uses_the_serving_model():
    usage = SimpleNamespace(input_tokens=1_000, output_tokens=200, cache_read_input_tokens=None,
                            cache_creation_input_tokens=None, iterations=None)
    resp = SimpleNamespace(model="claude-haiku-5-5", usage=usage)
    assert pricing.served_cost_micros(resp, requested_model="claude-haiku-5-5") == 200


def test_input_bound_counts_bytes_not_characters():  # Review Focus 4
    text = "\U0001d49c" * 20_000  # four UTF-8 bytes each
    bound = pricing.input_token_bound(system="", messages=[{"role": "user", "content": text}])
    assert bound >= 80_000 + pricing.INPUT_OVERHEAD_TOKENS
    assert pricing.input_token_bound(system="ab", messages=[]) >= 2 + pricing.INPUT_OVERHEAD_TOKENS


def test_input_bound_survives_a_lone_surrogate():
    # A JSON body can carry "\ud800"; the bound must still be computed (3 bytes under surrogatepass).
    bound = pricing.input_token_bound(system="s", messages=[{"role": "user", "content": "a\ud800b"}])
    assert bound > pricing.INPUT_OVERHEAD_TOKENS


def test_a_requested_model_without_a_price_is_refused_not_guessed():
    with pytest.raises(pricing.UnpricedModelError, match="claude-mystery"):
        pricing.reservation_micros([Attempt("claude-mystery", 1_000)], input_tokens=1_000)


def test_the_configured_models_all_have_prices():
    check_configured_models()  # the real settings and fallbacks: no error


@pytest.mark.parametrize("setting", ["AI_MODEL_SIMPLE", "AI_MODEL_TAILOR"])
def test_an_unpriced_configured_model_stops_startup(settings, setting):
    setattr(settings, setting, "claude-mystery")
    with pytest.raises(ImproperlyConfigured, match="claude-mystery"):
        check_configured_models()


def test_an_unpriced_fallback_target_stops_startup(monkeypatch):
    monkeypatch.setattr("apps.ai.service._FALLBACKS", {"claude-sonnet-5-5": "claude-mystery-fallback"})
    with pytest.raises(ImproperlyConfigured, match="claude-mystery-fallback"):
        check_configured_models()
