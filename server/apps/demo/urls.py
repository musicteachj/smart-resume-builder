from django.urls import path

from .views import DemoStartView, DemoStatusView

urlpatterns = [
    path("status", DemoStatusView.as_view(), name="demo-status"),
    path("start", DemoStartView.as_view(), name="demo-start"),
]
