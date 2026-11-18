"""Django settings for the Playwright e2e run (client/e2e). Never used by the app itself.

Layered on the real settings so the suite exercises production code paths, with three
test-only changes:
- no Anthropic key, so an AI call a spec forgot to mock fails fast (502) instead of
  reaching the real API (specs mock every /api/ai/ request with page.route);
- generous throttles, since one IP signs up and logs in many users per minute;
- the database comes from E2E_DATABASE_URL, a dedicated throwaway database.
"""

import os

import dj_database_url

from config.settings import *  # noqa: F401,F403
from config.settings import REST_FRAMEWORK

ANTHROPIC_API_KEY = ""

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        scope: "10000/min" for scope in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    },
}

DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get(
            "E2E_DATABASE_URL",
            "postgres://resume_user:resume_pass@localhost:5432/resume_builder_e2e",
        )
    )
}
