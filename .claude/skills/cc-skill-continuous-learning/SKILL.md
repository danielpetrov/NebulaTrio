---
name: continuous-learning
description: >
  End-of-session pattern extraction. Triggers when a session involved debugging,
  user corrections, workarounds, or project-specific discoveries. Extracts reusable
  patterns and saves them to memory for future sessions.
---

# Continuous Learning — Pattern Extraction

At the end of substantial sessions, extract patterns worth remembering.

## What to Extract

### 1. Error Resolutions
A bug or error that took multiple steps to diagnose.

**Save when:** The root cause was non-obvious and could recur.
**Format:**
```
Problem: [symptom]
Root cause: [why it happened]
Fix: [what resolved it]
Prevention: [how to avoid it next time]
```

### 2. User Corrections
The user corrected your approach or rejected a suggestion.

**Save when:** The correction reveals a preference or principle, not a one-time mistake.
**Memory type:** `feedback`
**Include:** The rule + why + how to apply it.

### 3. Workarounds
You found a non-obvious solution to a framework/tooling limitation.

**Save when:** The workaround is stable and likely to be needed again.
**Example:** "PrimeFlex `.grid` class conflicts with custom grid — use `.pricing-grid` instead."

### 4. Debugging Techniques
A specific debugging approach that was effective for this codebase.

**Save when:** The technique is tied to the project's stack or architecture.
**Example:** "To debug RTK Query cache issues, check `store.getState().api` in console."

### 5. Project-Specific Discoveries
Conventions, patterns, or constraints that aren't documented but affect how code should be written.

**Save when:** You discovered it through trial-and-error, not from docs.
**Memory type:** `project`

## Extraction Process

```
1. SCAN the session for:
   - Errors that took 2+ attempts to fix
   - User messages containing "no", "don't", "stop", "not like that"
   - User confirmations of non-obvious approaches ("yes exactly", "perfect")
   - Repeated patterns (same type of fix applied 2+ times)

2. FILTER out:
   - Simple typos and syntax errors
   - One-time external issues (API downtime, network errors)
   - Context that's already saved in memory or CLAUDE.md
   - Ephemeral state (current branch, in-progress work)

3. PROPOSE each extraction:
   "I noticed a reusable pattern from this session:
    [description]
    Save as [memory type] memory? [y/n]"

4. SAVE approved patterns to memory with proper frontmatter
```

## Ignore Patterns

Do NOT extract:
- `simple_typos` — misspelled variable names, missing semicolons
- `one_time_fixes` — issues caused by stale cache, restart-fixed problems
- `external_api_issues` — third-party service errors outside our control
- `obvious_conventions` — things any developer would know from reading the code
- `stale_state` — what branch we're on, what PR is open, current TODO items
