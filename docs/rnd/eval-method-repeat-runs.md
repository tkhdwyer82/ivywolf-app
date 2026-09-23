# Eval method — repeat runs for checks that vary
Date: 23 Sept 2026 · Commit under test: 3894a86 · Prompts: classify_v5 (shipping) vs classify_v6 (candidate)
R&D core activity: CA1 (per-segment classification). Applies to every prompt ratchet from classify_v6 on.

## Why the method changed
The ratchet (CLAUDE.md) compared single runs: a candidate shipped if it failed no check the shipping version passed.
The classifier is not deterministic, and one check in the set flips between runs of the *same* version: milton-st's
"Actually, one second" span (21.2–22.6 s) is sometimes typed `filler` and sometimes folded into the following
`action`. Segment-type accuracy fails whenever it does. This had already shown up:

- classify_v5 ratchet (22 Sept): v4 failed it; v4 had scored 1 fail on the same memos the day before.
- CA2 experiment 2 (22 Sept): the span was omitted on one run, passed on another.
- classify_v6 ratchet (23 Sept): on one pass v5 failed it and v6 passed; on the next, in dependency order, v5 passed
  and v6 failed.

Under single runs, whether a candidate shipped came down to which way that coin landed.

## The rule
A check that gives different results on repeated runs of the same version is scored by **pass rate over 3 runs of each
version**; the candidate ships only if its pass rate on every such check is **≥ the shipping version's**. Checks that
don't vary stay single-run. Thresholds and the scorer are unchanged. Per-run outputs are kept in
`packages/pipeline/eval/runs/repeat/<memo>.<version>.run<n>.actual.json`.

## Results — milton-st, 3 runs each
Same scorer, `expected.json`, audio (`eval/2026-09-21_milton-st.m4a`) and creator context; thomas-st's committed
v5 / v6 actuals supplied the thread-identity state for each version.

| Check | v5 | v6 |
|---|---|---|
| segment filler @21205–22565 ("one second") | 2/3 | 2/3 |
| segment-type accuracy | 2/3 | 2/3 |
| boundary_marker "one second" | 2/3 | 3/3 |
| action "milk" frame_brief | 1/3 | 3/3 |
| frame briefs name no one | 0/3 | 3/3 |
| every other check (21: segments, markers, trigger, card, candidate_project, card frame_brief, precision, recall, must_not, actions, loose ends, requests, entities, thread identity) | 3/3 | 3/3 |

v6 ≥ v5 on every check. The two frame_brief checks vary for v5 only because v5 fills `frame_brief` with no
instruction (the field reaches every version through the shared schema).

Single-run memos, unchanged: thomas-st v5 fails 1 (card precision: extra reference card), v6 fails 0; rooftop-chase
both fail 0.

**Outcome:** classify_v6 ships (`PROMPT_VERSION`).

## Limits
- Three runs separate "always" from "sometimes", not 2/3 from 3/3 reliably; a 1-run gap on a varying check is weak
  evidence either way. Enough for a ratchet that only asks "not worse".
- Only milton-st was repeated; thomas-st and rooftop-chase checks were assumed stable because they have not been seen
  to vary. If one does, it is repeated at the next ratchet.
- The frame_brief check tests for a key noun, not drawability ("Errand dropped in mid-note: office milk needed by
  Thursday." passes). No eval card is abstract, so "empty when abstract" is untested.
