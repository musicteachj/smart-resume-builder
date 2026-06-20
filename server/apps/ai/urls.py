from django.urls import path

from .views import GenerateSummaryView, ImproveBulletView, TailorJDView

urlpatterns = [
    path("improve-bullet", ImproveBulletView.as_view(), name="improve-bullet"),
    path("generate-summary", GenerateSummaryView.as_view(), name="generate-summary"),
    path("tailor-jd", TailorJDView.as_view(), name="tailor-jd"),
]
