"""A fake Anthropic client for service tests (no network, no key).

Import `fake` into a conftest or test module; `install(response, on_call=None)` swaps the service's
client for one that records every request and returns (or raises) `response`.
"""

from types import SimpleNamespace

import pytest

from apps.ai import service

# 3,000 input and 1,500 output tokens: 21,000 micro-dollars at Sonnet 5.5 rates.
SONNET_USAGE = SimpleNamespace(
    input_tokens=3_000,
    output_tokens=1_500,
    cache_read_input_tokens=0,
    cache_creation_input_tokens=0,
    iterations=None,
)


def _response(*blocks, stop_reason="end_turn", category=None, usage=SONNET_USAGE, model="claude-sonnet-5-5"):
    details = SimpleNamespace(type="refusal", category=category, explanation="") if stop_reason == "refusal" else None
    return SimpleNamespace(
        content=list(blocks), stop_reason=stop_reason, stop_details=details, usage=usage, model=model
    )


def _text(text):
    return SimpleNamespace(type="text", text=text)


# The new models can open a response with thinking blocks (empty text by default).
THINKING = SimpleNamespace(type="thinking", thinking="", signature="sig")


class _Messages:
    def __init__(self, response, on_call):
        self.response = response
        self.on_call = on_call
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.on_call:
            self.on_call(kwargs)
        if isinstance(self.response, BaseException):
            raise self.response
        return self.response


class _FakeClient:
    def __init__(self, response, on_call=None):
        self.messages = _Messages(response, on_call)
        self.beta = SimpleNamespace(messages=_Messages(response, on_call))

    def with_options(self, **_kwargs):
        return self


@pytest.fixture
def fake(monkeypatch):
    def install(response, *, on_call=None):
        client = _FakeClient(response, on_call)
        monkeypatch.setattr(service, "_client", lambda: client)
        return client

    return install
