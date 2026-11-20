from django.urls import path

from .views import DemoStatusView

urlpatterns = [
    path("status", DemoStatusView.as_view(), name="demo-status"),
]
