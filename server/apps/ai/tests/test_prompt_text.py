"""What Claude is told about a résumé (no network): every AI feature reads this text."""

from apps.ai import service

CONTENT = {
    "personalInfo": {
        "name": "Jordan Ellis",
        "headline": "Senior Full-Stack Engineer",
        "email": "jordan.ellis@example.com",
        "phone": "(503) 555-0172",
        "location": "Portland, OR",
        "linkedin": "https://linkedin.com/in/jordanellis",
        "github": "",
        "website": "",
    },
    "summary": "",
    "workExperience": [
        {
            "id": "w1", "company": "Northwind Freight", "position": "Software Engineer", "location": "Portland, OR",
            "startDate": "2022-03", "endDate": "", "bullets": ["Built APIs."],
        },
        {
            "id": "w2", "company": "Larkspur Pay", "position": "Software Engineer", "location": "",
            "startDate": "2019-06", "endDate": "2022-02", "bullets": ["Shipped onboarding."],
        },
    ],
    "education": [
        {"id": "e1", "school": "Oregon State University", "degree": "B.S.", "field": "Computer Science",
         "graduationDate": "2016-06", "gpa": ""},
    ],
    "skills": ["Python"],
}


def test_prompt_includes_employment_and_graduation_dates():
    text = service._content_to_text(CONTENT)
    assert "Mar 2022 to Present" in text
    assert "Jun 2019 to Feb 2022" in text
    assert "Jun 2016" in text


def test_prompt_includes_headline_and_locations():
    text = service._content_to_text(CONTENT)
    assert "Headline: Senior Full-Stack Engineer" in text
    assert "Location: Portland, OR" in text
    assert "Software Engineer at Northwind Freight, Portland, OR" in text


def test_prompt_says_which_contact_details_exist_without_their_values():
    text = service._content_to_text(CONTENT)
    assert "Contact details on the résumé: email, phone, LinkedIn" in text
    assert "jordan.ellis@example.com" not in text
    assert "555-0172" not in text


def test_missing_contact_details_are_reported_as_none():
    content = {**CONTENT, "personalInfo": {"name": "A"}}
    assert "Contact details on the résumé: none" in service._content_to_text(content)


def test_duplicate_bullets_each_get_their_own_id():
    content = {**CONTENT, "workExperience": [{"id": "w1", "position": "P", "bullets": ["Same.", "Same."]}]}
    text = service._content_to_text(content, with_bullet_ids=True)
    assert "[w1::0] Same." in text
    assert "[w1::1] Same." in text


def _freeze_today(monkeypatch, year, month, day):
    from datetime import datetime, timezone as dt_timezone

    monkeypatch.setattr(service.timezone, "now", lambda: datetime(year, month, day, 15, 0, tzinfo=dt_timezone.utc))


def test_prompt_starts_with_todays_date(monkeypatch):
    # Without it the model guesses the current year, and "years of experience" comes out wrong
    # for any role that runs to the present.
    _freeze_today(monkeypatch, 2026, 11, 18)
    text = service._content_to_text(CONTENT)
    assert text.splitlines()[0] == "Today's date: November 18, 2026"


def test_todays_date_survives_the_length_cap(monkeypatch, settings):
    _freeze_today(monkeypatch, 2026, 1, 5)
    settings.AI_MAX_PROMPT_CHARS = 200
    content = {**CONTENT, "summary": "x" * 5000}
    text = service._content_to_text(content)
    assert len(text) == 200
    assert text.startswith("Today's date: January 5, 2026")


def test_summary_and_cover_letter_count_years_from_todays_date():
    from apps.ai import prompts

    for prompt in (prompts.GENERATE_SUMMARY, prompts.COVER_LETTER):
        assert "today's date" in prompt
        assert "years of experience" in prompt
