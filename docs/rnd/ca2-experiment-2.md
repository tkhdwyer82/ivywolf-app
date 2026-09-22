# CA2 experiment 2 — hybrid thread identity (candidate-thread names, then embeddings)
Date: 22 Sept 2026 · Commit under test: 3a4e605 · Prompt: classify_v4 · Embeddings: Voyage `voyage-3`
R&D core activity: CA2 (thread identity across recordings). Follows [experiment 1](ca2-experiment-1.md).

## Hypothesis
The classifier knows what project an idea belongs to even when the card text doesn't say it. If each card names
candidate threads and one fuzzy-matches an existing thread title, attaching there identifies the thread where
card-text embeddings could not (experiment 1: same-thread and unrelated pairs overlapped, 0.36–0.51 vs 0.33–0.59).

## Method
- Assignment order per card (`packages/pipeline/threading.ts`):
  1. name — best `titleMatch(candidate_thread, thread title)` ≥ `NAME_MATCH_MIN` 0.6 (1.0 when one's content words
     are all in the other, else Jaccard on content words);
  2. embedding — cosine to the nearest thread centroid ≥ 0.80;
  3. otherwise a new thread, titled from the card.
  Merge proposals unchanged: cards in different threads at cosine ≥ 0.85.
- The eval replays the pipeline: Thomas's cards are assigned from an empty graph, and Milton is then classified
  with the resulting thread titles as `recent_thread_titles` (most recent first), as `loadCreatorContext` would
  supply them.

## Results
`recent_thread_titles` given to Milton's classify call:
`["Short video, many hands, seamless flow", "Several creators talking to the device"]`

`candidate_threads` returned:

| Memo | Card | candidate_threads |
|---|---|---|
| Thomas | Several creators talking to the device | ["Launch video"] |
| Thomas | Short video, many hands, seamless flow | ["Launch video"] |
| Milton | Arabella runs the AI chase scene | ["Short video, many hands, seamless flow", "Several creators talking to the device"] |

Assignment, in recording order:

| Card | Thread | Via | Best name match | Nearest centroid |
|---|---|---|---|---|
| Several creators talking to the device | thread-1 | new | — (no threads) | — |
| Short video, many hands, seamless flow | thread-2 | new | "Launch video" ~ "Several creators talking to the device" 0.00 | 0.708 |
| Arabella runs the AI chase scene | thread-2 | name | "Short video, many hands, seamless flow" ~ same 1.00 | 0.492 |

Merge proposals: none. Card-to-card cosine Milton↔Thomas: 0.427, 0.492.

Eval: Thomas PASS. Milton FAIL (3): thread identity **passes** (same thread, via name); the "Actually, one second"
span (21.2–22.6 s) was omitted from segments this run (3 failing checks from that one omission; it passed in the
two previous v4 runs).

## Conclusion
Not established. The thread-identity check passed, but Milton's `candidate_threads` are the two provided titles,
verbatim and in the order given. With two threads that are both the related project, copying the list and judging
correctly are indistinguishable, so this run cannot tell whether the classifier identified the project or echoed
its context.

A second problem is visible in the assignment: both Thomas cards named "Launch video", but threads were titled from
card text, so "Launch video" never matched a title and Thomas's two cards landed in separate threads (their
centroid cosine, 0.708, is below 0.80).

## Next (experiment 3)
- Name a new thread from the card's first `candidate_thread` (threads by purpose, cards by content).
- Scorer check that fails when a card's `candidate_threads` repeat the full `recent_thread_titles` list.
- A negative memo — an unrelated idea recorded after the launch-video memos — to separate echo from judgement.

## Limits
Two memos; one run per condition (classifier output varies between runs — see the omitted span).
`NAME_MATCH_MIN` 0.6 is untuned. The noise floor for embeddings is still synthetic.
