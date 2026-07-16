from rest_framework.routers import DefaultRouter

from .views import CoverLetterViewSet, ResumeViewSet

router = DefaultRouter()
router.register(r"resumes", ResumeViewSet, basename="resume")
router.register(r"cover-letters", CoverLetterViewSet, basename="cover-letter")

urlpatterns = router.urls
