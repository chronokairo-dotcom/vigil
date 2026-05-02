VIGIL: The Hidden Daemon Mode Inside Claude Code
The Claude Code npm source map exposure revealed VIGIL — an autonomous daemon mode that turns Claude Code into an always-on background agent with memory consolidation.

Published on April 1, 2026
·
Claude Mythos
Claude Code
VIGIL
Daemon Mode
AI Agent
Feature Flag
TL;DR: The Claude Code source code briefly exposed through the March 31 npm source-map incident contains over 150 references to a feature flag called VIGIL. It represents a daemon mode — a persistent background agent that monitors your development environment, maintains context across sessions, and performs autonomous “memory consolidation” while the user is idle. VIGIL has not shipped to users. It is gated behind an internal feature flag. But its architecture reveals where Anthropic appears to be heading with AI coding tools: from reactive assistants to always-on development partners.

What Is VIGIL in Claude Code?
According to the briefly-exposed Claude Code source code, VIGIL is an internal feature flag referenced over 150 times across the codebase. It is not a minor experiment. The volume and distribution of references indicate a deeply integrated subsystem that touches session management, context handling, background task scheduling, and memory operations.

VIGIL represents a fundamental architectural shift. Today, Claude Code operates as a reactive tool. You invoke it, it responds, the interaction ends. VIGIL changes that model entirely. Under VIGIL, Claude Code becomes a persistent process — a daemon — that runs continuously in the background of your development environment.

The feature flag is currently disabled for all external users. There is no public documentation, no announcement, and no toggle in settings. Everything we know comes from publicly reported analysis of the March 31 npm source-map incident.

How Claude Code’s Daemon Mode Works
VIGIL allows Claude Code to operate as a long-lived background process rather than a request-response tool. According to the briefly-exposed source code, the daemon mode introduces two core capabilities: background sessions and persistent context.

Background sessions mean Claude Code does not terminate when you close a conversation. The daemon continues running, maintaining awareness of your project state. It monitors file changes, tracks terminal output, and observes development activity without requiring explicit invocation.

Persistent context means the agent carries forward its understanding across interactions. Today, each Claude Code session starts with a fresh context window (aside from CLAUDE.md files and project indexing). Under VIGIL, the daemon accumulates observations over time, building a progressively richer model of your codebase, your patterns, and your intent.

The combination is significant. A daemon with persistent context is not just a tool you use. It is a process that learns from your environment continuously.

autoDream: Claude Code’s Memory Consolidation
The most striking subsystem within VIGIL is a process the source code calls autoDream.

According to the briefly-exposed code, autoDream activates during periods of user inactivity. When the developer is idle — not typing, not running commands, not interacting with Claude Code — the daemon enters a consolidation phase. During this phase, the agent processes its accumulated observations and restructures its internal context.

The source code describes three specific operations that occur during autoDream:

Merging disparate observations. The agent combines information gathered across different sessions, files, and interactions into unified representations. Isolated facts about your codebase get linked together.

Removing logical contradictions. If the agent has recorded conflicting information — perhaps from observing a refactor that invalidated earlier assumptions — autoDream resolves these conflicts by discarding the outdated data.

Converting vague insights into absolute facts. This is the most aggressive operation. Tentative observations (“this function might handle authentication”) get promoted to firm assertions (“this function handles authentication”) based on accumulated evidence.

All of this happens without user interaction. The developer does not approve the consolidation. They do not review what was merged, discarded, or promoted. The daemon performs these operations autonomously during idle time.

The autoDream process is architecturally similar to memory consolidation in biological systems — the process by which short-term memories are converted to long-term storage during sleep. The naming appears intentional.

Why VIGIL Changes the AI Coding Paradigm
Every major AI coding tool available today — Cursor, GitHub Copilot, Windsurf, and Claude Code in its current form — operates on the same fundamental interaction model: the user asks, the AI responds. The loop is always human-initiated.

VIGIL breaks that loop.

Under daemon mode, the interaction model shifts from “ask AI, get answer” to “AI observes, AI learns, AI acts.” The agent does not wait for a prompt. It watches. It accumulates understanding. It consolidates that understanding autonomously. And based on the architecture visible in the briefly-exposed code, it can surface insights and take actions based on what it has learned.

This is not an incremental improvement. It is a category change.

The closest analogy is the evolution of text editors into integrated development environments. Early text editors were passive tools — they displayed text, you edited it. Modern IDEs actively analyze your code, flag errors before compilation, suggest refactors, and manage dependencies. The tool went from reactive to proactive. VIGIL represents the same transition for AI coding assistants.

The difference in scale is considerable. An IDE’s static analysis operates on syntax and type systems. A daemon-mode AI agent with memory consolidation operates on semantics, intent, and accumulated behavioral patterns. It doesn’t just know your code compiles. It knows what you were trying to build.

If VIGIL ships in a form resembling what the briefly-exposed source describes, it will be the first AI coding tool to operate as a genuine background agent rather than an on-demand assistant. That distinction matters. An assistant helps when asked. An agent acts on your behalf.

What We Don’t Know About VIGIL
Despite the volume of references in the briefly-exposed source, critical questions remain unanswered.

⚠️ When it will ship. There is no public timeline. The feature flag is disabled. Internal feature flags can persist in codebases for months or years before reaching production — or they can be abandoned entirely. The presence of VIGIL in the source does not guarantee it will ever ship.

⚠️ Whether autoDream’s “absolute facts” are reliable. The autonomous promotion of tentative observations to firm assertions is the most consequential operation in the system. If the consolidation process makes incorrect promotions — treating a wrong assumption as established fact — the agent’s subsequent behavior would be built on a flawed foundation. There is no indication in the exposed code of how the system handles or prevents this failure mode.

⚠️ Privacy implications of always-on monitoring. A daemon that continuously observes file changes, terminal output, and development activity raises substantial privacy questions. What data is transmitted to Anthropic’s servers? What is processed locally? Is the monitoring scope configurable? The exposed source does not clearly resolve these questions.

⚠️ Resource consumption of a persistent daemon. Running a large language model as a background process is computationally expensive. The exposed code does not indicate whether VIGIL relies on local inference, continuous API calls, or some hybrid approach. Each option carries different cost and performance implications for the developer’s machine and Anthropic’s infrastructure.

Until Anthropic officially announces VIGIL or independent researchers conduct more thorough analysis of the briefly-exposed codebase, these questions will remain open.