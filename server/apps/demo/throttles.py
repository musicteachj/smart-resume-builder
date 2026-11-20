import ipaddress

from rest_framework.throttling import SimpleRateThrottle


def _network_ident(ident: str) -> str:
    """An IPv6 address counts as its /64 (one subscriber usually holds a whole /64, so rotating within
    it would otherwise reset the limit). IPv4 stays per address; anything that isn't an IP is used as is."""
    try:
        address = ipaddress.ip_address(ident)
    except ValueError:
        return ident
    if address.version == 6:
        if address.ipv4_mapped:  # ::ffff:a.b.c.d is one IPv4 client
            return str(address.ipv4_mapped)
        return str(ipaddress.IPv6Network((int(address), 64), strict=False))  # int: drops any %zone
    return ident


class _DemoStartThrottle(SimpleRateThrottle):
    """Counts demo start attempts per client IP (IPv4 per address, IPv6 per /64). Always keyed by IP, even
    for a signed-in caller, so a stale Bearer cannot change the bucket. `get_ident` honors NUM_PROXIES (one
    trusted hop)."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": _network_ident(self.get_ident(request))}


class DemoStartHourThrottle(_DemoStartThrottle):
    scope = "demo-start-hour"


class DemoStartDayThrottle(_DemoStartThrottle):
    scope = "demo-start-day"
