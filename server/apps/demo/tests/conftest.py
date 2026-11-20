import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache(db):
    """The status payload is cached for a minute; keep each test's view of it separate."""
    cache.clear()
    yield
    cache.clear()
