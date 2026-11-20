"""The sample résumé every demo guest starts with: a fictional, ready-to-edit senior engineer.

Contact details use reserved example values (example.com, 555-01xx). Keep this valid against
ResumeContentSerializer; test_sample.py checks it.
"""

SAMPLE_TITLE = "Sample resume: Riley Chen"

SAMPLE_CONTENT: dict = {
    "personalInfo": {
        "name": "Riley Chen",
        "headline": "Senior Software Engineer",
        "email": "riley.chen@example.com",
        "phone": "555-0142",
        "location": "Portland, OR",
        "linkedin": "https://www.example.com/in/riley-chen",
        "github": "https://www.example.com/rileychen",
        "website": "https://www.example.com/riley",
    },
    "summary": (
        "Senior software engineer with 9 years of experience building web platforms and the data services "
        "behind them. Led a checkout rebuild that raised conversion by 11 percent, cut API latency by "
        "half, and mentors a team of five engineers. Looking for a role where product sense and "
        "dependable engineering matter equally."
    ),
    "workExperience": [
        {
            "id": "sample-exp-1",
            "company": "Brightwell Commerce",
            "position": "Senior Software Engineer",
            "location": "Portland, OR",
            "startDate": "2021-03",
            "endDate": None,
            "bullets": [
                "Led a team of five engineers through a checkout rebuild that raised conversion by 11 percent "
                "across 2 million monthly shoppers.",
                "Cut p95 API latency from 840 ms to 390 ms by adding read replicas and caching hot catalog queries.",
                "Introduced contract tests between 14 services, reducing production rollbacks by 60 percent.",
                "Mentored four engineers to promotion and ran the hiring loop that grew the team from 5 to 9.",
            ],
        },
        {
            "id": "sample-exp-2",
            "company": "Larkspur Analytics",
            "position": "Software Engineer",
            "location": "Seattle, WA",
            "startDate": "2018-06",
            "endDate": "2021-02",
            "bullets": [
                "Built a reporting service in Python and React used by 1,200 customers, replacing a nightly "
                "spreadsheet export.",
                "Reduced warehouse query costs by 35 percent by partitioning event tables and retiring unused "
                "dashboards.",
                "Shipped a self-serve onboarding flow that cut support tickets by 28 percent in the first quarter.",
            ],
        },
        {
            "id": "sample-exp-3",
            "company": "Fernhill Software",
            "position": "Junior Developer",
            "location": "Seattle, WA",
            "startDate": "2016-07",
            "endDate": "2018-05",
            "bullets": [
                "Delivered 40 customer-facing features across a Django and jQuery codebase, averaging one "
                "release per week.",
                "Raised automated test coverage from 31 to 78 percent while migrating the build to continuous "
                "integration.",
                "Wrote the runbook that shortened on-call incident response from 45 to 20 minutes.",
            ],
        },
    ],
    "education": [
        {
            "id": "sample-edu-1",
            "school": "University of Washington",
            "degree": "B.S.",
            "field": "Computer Science",
            "graduationDate": "2016-06",
            "gpa": "3.7",
        }
    ],
    "skills": [
        "Python",
        "TypeScript",
        "React",
        "Django",
        "PostgreSQL",
        "AWS",
        "System design",
        "Technical leadership",
        "Mentoring",
        "Test automation",
    ],
    "projects": [
        {
            "id": "sample-proj-1",
            "name": "Trailhead Notes",
            "description": (
                "Open source offline-first note app for hikers, with 1,800 GitHub stars and 40 contributors."
            ),
            "technologies": ["TypeScript", "React", "SQLite"],
            "url": "https://www.example.com/rileychen/trailhead-notes",
        },
        {
            "id": "sample-proj-2",
            "name": "Pantry Planner",
            "description": (
                "Weekend project that turns a shopping list into a meal plan, used by about 300 people each week."
            ),
            "technologies": ["Python", "Django", "PostgreSQL"],
            "url": "https://www.example.com/rileychen/pantry-planner",
        },
    ],
}
