from rest_framework.routers import DefaultRouter

from .views import CoverLetterViewSet, ResumeVersionViewSet, ResumeViewSet

router = DefaultRouter()
router.register(r"resumes", ResumeViewSet, basename="resume")
router.register(r"cover-letters", CoverLetterViewSet, basename="cover-letter")
router.register(r"resume-versions", ResumeVersionViewSet, basename="resume-version")

urlpatterns = router.urls
