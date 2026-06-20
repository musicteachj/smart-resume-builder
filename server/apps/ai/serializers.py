from rest_framework import serializers

from apps.accounts.serializers import AIUsageSerializer
from apps.resumes.serializers import ResumeContentSerializer


# --- requests ---------------------------------------------------------------

class ImproveBulletRequestSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000)
    role = serializers.CharField(max_length=120, required=False, allow_blank=True)


class GenerateSummaryRequestSerializer(serializers.Serializer):
    content = ResumeContentSerializer()


class TailorJDRequestSerializer(serializers.Serializer):
    content = ResumeContentSerializer()
    job_description = serializers.CharField(max_length=8000)


# --- responses (shape the generated TS types) -------------------------------

class ImproveBulletResponseSerializer(serializers.Serializer):
    suggestion = serializers.CharField()
    ai_usage = AIUsageSerializer()


class GenerateSummaryResponseSerializer(serializers.Serializer):
    summary = serializers.CharField()
    ai_usage = AIUsageSerializer()


class TailorSuggestionSerializer(serializers.Serializer):
    bullet_id = serializers.CharField()
    current = serializers.CharField()
    suggested = serializers.CharField()
    adds = serializers.ListField(child=serializers.CharField())


class TailorJDResponseSerializer(serializers.Serializer):
    match_score = serializers.IntegerField()
    missing_keywords = serializers.ListField(child=serializers.CharField())
    suggestions = TailorSuggestionSerializer(many=True)
    ai_usage = AIUsageSerializer()
