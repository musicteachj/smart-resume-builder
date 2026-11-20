from rest_framework.throttling import SimpleRateThrottle


class _DemoStartThrottle(SimpleRateThrottle):
    """Counts demo start attempts per client IP. Always keyed by IP, even for a signed-in caller,
    so a stale Bearer cannot change the bucket. `get_ident` honors NUM_PROXIES (one trusted hop)."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class DemoStartHourThrottle(_DemoStartThrottle):
    scope = "demo-start-hour"


class DemoStartDayThrottle(_DemoStartThrottle):
    scope = "demo-start-day"
