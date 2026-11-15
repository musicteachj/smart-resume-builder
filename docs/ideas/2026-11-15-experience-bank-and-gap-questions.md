# Idea: an experience bank with gap questions

Status: **ideas only, nothing decided.** Brainstormed on 2026-11-15. This note records the ideas so
they aren't lost; a real design comes later.

## Why

- ResumeIQ is a portfolio project. Its main job is to show recruiters and hiring managers what I can
  build, next to Open Door, Packwright, and Folio. Using it for my own job search is a bonus.
- It's the thinnest AI project of the four: six independent single calls to Claude, no evals, and AI
  usage counted in characters instead of tokens or dollars.
- The test for anything new: **a real job seeker needs it, and a single model call can't do it
  well.** Nothing gets added just to show off a tool.

## The two ideas

1. **Experience bank.** The person keeps a fuller record of everything they've done: more roles,
   projects, numbers, and skills than fit on one page (the "master resume" career advice
   recommends). Tailoring then chooses and rewrites from the bank for each job, instead of only
   rewording the one resume.
2. **Gap questions.** When a job asks for something the bank doesn't cover, the workflow pauses and
   asks ("This role wants Terraform. Have you used it? Tell me where.") instead of inventing
   experience. The answer goes into the bank for next time.

## Pieces that would come with them

- **LangGraph for tailoring only.** The flow is a real graph: choose from the bank, find gaps, pause
  to ask, rewrite, fact-check, re-score, loop until good enough or a retry limit is hit. LangGraph's
  pause-for-a-person feature fits the gap questions. Improve-bullet, summary, ATS check, and cover
  letters stay single calls.
- **An independent fact-checking agent.** It reviews the rewrites without seeing the writer's
  reasoning, and every claim in a tailored resume must trace back to a bank entry.
- **Amazon Bedrock** for all AI calls, behind one setting so the direct Claude API stays available.
  Signs in with an IAM role instead of an API key. Contrasts with Open Door, which uses the Claude
  API directly.
- **An eval set built first:** parsing accuracy on labeled resumes, match-score stability, and "no
  invented claims." Run it on today's single call and on the new graph, and show both numbers.
- **Token and dollar tracking** per call, replacing the character counts.
- **A fake model for tests and CI**, so neither needs AWS.
- **Compare newer models** once the evals exist (today: `claude-sonnet-4-6`, `claude-haiku-4-5`).

## Showcase needs

- **A demo path with no sign-up**, with a seeded bank and a sample job posting. Folio and Open Door
  both have one; ResumeIQ doesn't.
- **Visible steps** as the workflow runs, and each tailored claim linked to the bank entry it came
  from (like Open Door's handbook citations).
- **A cost plan for demo traffic.** The current 10-calls-a-day limit per user is wrong for a shared
  demo account.
- **The explainer video** (under 2 minutes, in `portfolio-videos`) would lead with the new flow. The
  gap question is the moment that reads with the sound off. The seeded bank and posting should make
  a gap and a fact-check finding appear reliably with real AI output.

## Leanings, not decisions

- **No vector search for the bank.** One person's bank is a few dozen entries and fits in the prompt.
  Revisit only if banks grow large.
- **Call Bedrock through the Anthropic SDK's Bedrock client** inside the graph's steps, not
  LangChain's model classes, so structured output works as it does today. LangChain's core framework
  stays out; only LangGraph comes in.

## Open questions

- **Where the agent runs:**
  1. Inside the Django app, with the graph's state saved in the existing Postgres. Simplest; Django's
     threaded server limits how many runs can stream at once.
  2. A separate small agent service (FastAPI). Streams more naturally, but adds a second container
     and service-to-service auth.
  3. Bedrock AgentCore. The most AWS-native, but ties development and CI to AWS. Really a hosting
     decision for the AWS strategy later.
- **Streaming:** ResumeIQ doesn't stream today. Visible steps need it.
- **Demo cost plan:** recorded walkthrough, a shared daily budget, or something else.
- **The video:** if someone remembers one moment, what should it be?

## Ruled out

- **Application tracker:** mostly forms and lists, little AI value.
- **Interview prep:** a separate single-call feature, so scope creep.
- **Importing job postings from a URL:** scraping breaks easily.
