from django.urls import path

from .views import (
    GenerateSummaryView,
    ImproveBulletView,
    ParseResumeView,
    TailorJDView,
)

urlpatterns = [
    path("improve-bullet", ImproveBulletView.as_view(), name="improve-bullet"),
    path("generate-summary", GenerateSummaryView.as_view(), name="generate-summary"),
    path("tailor-jd", TailorJDView.as_view(), name="tailor-jd"),
    path("parse-resume", ParseResumeView.as_view(), name="parse-resume"),
]
