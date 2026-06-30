"""Resume serializers.

The resume `content` is modelled with explicit nested serializers (rather than a
raw JSONField) so it validates server-side AND generates a rich TypeScript type
via Orval. Shapes mirror the client Zod schemas and the design mockups.

Validation is **draft-friendly**: while a user edits, most fields may be blank so
autosave never fails on partial input. Formats (email, URL, YYYY-MM) are still
enforced when a value IS present, and the structural shape + list caps always hold.
"""

import re

from rest_framework import serializers

from .models import Resume

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")  # YYYY-MM


class MonthField(serializers.CharField):
    """A YYYY-MM month string (blank allowed mid-edit; format checked when present)."""

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if value and not MONTH_RE.match(value):
            raise serializers.ValidationError("Must be in YYYY-MM format.")
        return value


class PersonalInfoSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    headline = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    location = serializers.CharField(max_length=100, required=False, allow_blank=True)
    linkedin = serializers.URLField(required=False, allow_blank=True)
    github = serializers.URLField(required=False, allow_blank=True)
    website = serializers.URLField(required=False, allow_blank=True)


class WorkExperienceSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=64)
    company = serializers.CharField(max_length=120, required=False, allow_blank=True)
    position = serializers.CharField(max_length=120, required=False, allow_blank=True)
    location = serializers.CharField(max_length=120, required=False, allow_blank=True)
    startDate = MonthField()
    endDate = MonthField(allow_null=True)  # null/blank = current role
    bullets = serializers.ListField(
        child=serializers.CharField(max_length=500, allow_blank=True),
        max_length=12,
        required=False,
        allow_empty=True,
    )


class EducationSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=64)
    school = serializers.CharField(max_length=120, required=False, allow_blank=True)
    degree = serializers.CharField(max_length=120, required=False, allow_blank=True)
    field = serializers.CharField(max_length=120, required=False, allow_blank=True)
    graduationDate = MonthField()
    gpa = serializers.CharField(max_length=10, required=False, allow_blank=True)


class ProjectSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)
    technologies = serializers.ListField(
        child=serializers.CharField(max_length=50), max_length=20, required=False
    )
    url = serializers.URLField(required=False, allow_blank=True)


class ResumeContentSerializer(serializers.Serializer):
    # Upper bounds on list sections to keep stored content reasonable.
    MAX_ITEMS = {"workExperience": 20, "education": 10, "projects": 20}

    personalInfo = PersonalInfoSerializer()
    summary = serializers.CharField(
        max_length=1000, required=False, allow_blank=True
    )
    workExperience = WorkExperienceSerializer(many=True)
    education = EducationSerializer(many=True)
    skills = serializers.ListField(
        child=serializers.CharField(max_length=60), max_length=60
    )
    projects = ProjectSerializer(many=True, required=False)

    def validate(self, attrs):
        for field, cap in self.MAX_ITEMS.items():
            if len(attrs.get(field) or []) > cap:
                raise serializers.ValidationError(
                    {field: f"At most {cap} entries are allowed."}
                )
        return attrs


class ResumeSerializer(serializers.ModelSerializer):
    """Full read + write representation of a resume (retrieve/create/update)."""

    content = ResumeContentSerializer()
    # Custom section order — a list of section keys ("summary", "skills", …). Empty = canonical.
    section_order = serializers.ListField(
        child=serializers.SlugField(), required=False, allow_empty=True, max_length=12
    )

    class Meta:
        model = Resume
        fields = [
            "id", "title", "template", "document_font", "section_order",
            "content", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ResumeListSerializer(serializers.ModelSerializer):
    """Lightweight representation for the dashboard list — omits the heavy
    `content` blob, exposing only what resume cards render (incl. skills for
    the chips)."""

    skills = serializers.SerializerMethodField()

    class Meta:
        model = Resume
        fields = ["id", "title", "template", "skills", "created_at", "updated_at"]
        read_only_fields = fields

    def get_skills(self, obj) -> list[str]:
        skills = (obj.content or {}).get("skills", [])
        return skills if isinstance(skills, list) else []
