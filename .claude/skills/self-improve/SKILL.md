---
name: self-improve
description: >
  Self-improvement loop for Claude. Triggers after completing non-trivial tasks,
  encountering unexpected failures, repeating patterns, or discovering better approaches.
  Proposes updates to CLAUDE.md, memory, and skills. Always asks for approval first.
---

# Self-Improvement Loop

You are a self-improving system. After meaningful work, reflect and compound your knowledge.

## The Loop

```
1. DO WORK → Solve problems, write code, debug
       ↓
2. NOTICE → "This pattern worked well"
          → "This failed because X"
          → "I keep doing this manually"
          → "User corrected me — I should remember this"
       ↓
3. CLASSIFY → Is it a feedback, project, user, or reference memory?
            → Does it belong in CLAUDE.md as a project convention?
            → Is it a reusable skill worth extracting?
       ↓
4. PROPOSE → Show current vs proposed, explain reasoning
       ↓
5. WAIT FOR APPROVAL → Never apply without confirmation
       ↓
6. APPLY → Save to the appropriate place
```

## When to Trigger

**Automatic — reflect after:**
- Completing a non-trivial task (not simple one-liners)
- Something fails unexpectedly and you find the root cause
- You repeat a pattern 2+ times across the session
- You discover a better approach than what's documented
- User corrects your approach or confirms a non-obvious choice

**Explicit — user says:**
- "remember this", "save this", "don't forget"
- "update the config", "add this to CLAUDE.md"
- "this should be a skill"

## Where to Save

| What you learned | Where it goes |
|---|---|
| User preference or correction | Memory: `feedback` type |
| Project convention or decision | Memory: `project` type |
| Who the user is, their role | Memory: `user` type |
| External resource location | Memory: `reference` type |
| Coding standard for this repo | `CLAUDE.md` update |
| Reusable multi-step workflow | New skill in `.claude/skills/` |

## Proposal Format

When proposing an update:

```
I noticed something worth saving: [what you learned]

**Type:** [memory / CLAUDE.md / new skill]
**Target:** [file path]

<current>
[current content, if modifying]
</current>

<proposed>
[new content]
</proposed>

**Why:** [concrete reasoning — not "might be useful" but "this failed/worked because X"]

Apply this update?
```

## Quality Gates

Before proposing, ask yourself:

1. **Is this actually an improvement, or just different?** — Don't save stylistic preferences unless the user expressed them.
2. **Will this help in future sessions?** — If it's only relevant now, skip it.
3. **Is it specific enough to be actionable?** — "Write good code" is useless. "Use `dispatch(toggleFavorite(id))` for optimistic updates" is useful.
4. **Is it already documented?** — Check CLAUDE.md and existing memory before creating duplicates.
5. **Can I verify it's still true?** — Don't save assumptions. Check the code first.

## Anti-Patterns — Do NOT Save

- Things derivable from code or git history
- Temporary debugging state
- One-time fixes unlikely to recur
- Vague observations ("the codebase is complex")
- Anything already in CLAUDE.md or existing memory
