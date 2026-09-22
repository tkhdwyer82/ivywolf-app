# CA2 experiment 1 — embeddings-only thread identity
Date: 22 Sept 2026 · Commit under test: 7a0c0d3 · Prompt: classify_v4 · Embeddings: Voyage `voyage-3` (1024-d, unit length)
R&D core activity: CA2 (thread identity across recordings).

## Hypothesis
Cards that belong to the same thread can be identified by cosine similarity between embeddings of the card text
(`title + "\n" + gist`), with a card joining a thread at ≥ 0.80 against the thread centroid and a merge proposed
between cards in different threads at ≥ 0.85.

## Method
- Memos: `2026-09-21_thomas-st` then `2026-09-21_milton-st`, in recording order. Hand labels say Milton's card belongs
  with Thomas's ("Launch video"; Milton `expect_merge_suggestion_with: 2026-09-21_thomas-st`).
- Cards from the committed classify_v4 eval runs. Assignment and merge logic from `packages/pipeline/threading.ts`
  (the same functions the pipeline calls), replayed by `packages/pipeline/eval/run.ts`.
- Noise floor: three synthetic cards on unrelated topics (candle restock, mug price reveal, burnout podcast clip),
  written for this measurement only. They are not eval data and are a weak baseline — see Limits.
- A variant appending the classifier's `candidate_threads` to the embedded text was also measured.

## Results — cosine, title + gist

| Pair | Kind | Cosine |
|---|---|---|
| "Several creators talking to the device" ↔ "Short video, many hands, seamless flow" | same memo (Thomas) | 0.651 |
| "Several creators talking to the device" ↔ "Borrow the viral YouTube video structure" | same memo (Thomas) | 0.630 |
| "Candle restock day countdown" ↔ "Price reveal for the new mugs" | synthetic ↔ synthetic | 0.593 |
| "Borrow the viral YouTube video structure" ↔ "Podcast clip about burnout" | real ↔ unrelated | 0.570 |
| "Borrow the viral YouTube video structure" ↔ "Short video, many hands, seamless flow" | same memo (Thomas) | 0.557 |
| "Price reveal for the new mugs" ↔ "Podcast clip about burnout" | synthetic ↔ synthetic | 0.554 |
| "Candle restock day countdown" ↔ "Podcast clip about burnout" | synthetic ↔ synthetic | 0.530 |
| **"Several creators talking to the device" ↔ "Arabella runs the AI chase scene"** | **Thomas ↔ Milton (same thread)** | **0.510** |
| "Short video, many hands, seamless flow" ↔ "Arabella runs the AI chase scene" | Thomas ↔ Milton (same thread) | 0.487 |
| "Arabella runs the AI chase scene" ↔ "Podcast clip about burnout" | real ↔ unrelated | 0.473 |
| "Several creators talking to the device" ↔ "Price reveal for the new mugs" | real ↔ unrelated | 0.473 |
| "Several creators talking to the device" ↔ "Podcast clip about burnout" | real ↔ unrelated | 0.466 |
| "Short video, many hands, seamless flow" ↔ "Podcast clip about burnout" | real ↔ unrelated | 0.445 |
| "Borrow the viral YouTube video structure" ↔ "Candle restock day countdown" | real ↔ unrelated | 0.437 |
| "Several creators talking to the device" ↔ "Candle restock day countdown" | real ↔ unrelated | 0.430 |
| "Short video, many hands, seamless flow" ↔ "Price reveal for the new mugs" | real ↔ unrelated | 0.428 |
| "Borrow the viral YouTube video structure" ↔ "Price reveal for the new mugs" | real ↔ unrelated | 0.416 |
| "Short video, many hands, seamless flow" ↔ "Candle restock day countdown" | real ↔ unrelated | 0.404 |
| "Borrow the viral YouTube video structure" ↔ "Arabella runs the AI chase scene" | Thomas ↔ Milton (same thread) | 0.363 |
| "Arabella runs the AI chase scene" ↔ "Price reveal for the new mugs" | real ↔ unrelated | 0.347 |
| "Arabella runs the AI chase scene" ↔ "Candle restock day countdown" | real ↔ unrelated | 0.330 |

Summary by kind: same memo 0.557–0.651 · Thomas↔Milton (labelled same thread) 0.363–0.510 · unrelated 0.330–0.593.

With `candidate_threads` appended: same memo rose to 0.616–0.739; Thomas↔Milton was unchanged (0.372–0.513) because
classify_v4 returned no `candidate_threads` for Milton's card; unrelated 0.346–0.572.

Outcome at the configured thresholds: every card started its own thread (four threads for four cards) and no merge
was proposed. The eval's thread-identity check failed for Milton.

## Conclusion
Same-thread pairs are not separable from unrelated pairs by cosine similarity on card text. The best Thomas↔Milton
score (0.510) sits inside the unrelated band (up to 0.593), so no threshold on these embeddings joins Milton's card
to Thomas's thread without also joining unrelated ideas. What links the two recordings — both are ideas for Ivy's
launch video — is a project the creator has in mind, not shared wording in the cards. The hypothesis is rejected
for card-text embeddings alone.

## Next
Experiment 2: hybrid assignment. When the classifier names a candidate thread that matches an existing thread
title for the creator, attach there; otherwise fall back to embeddings at the unchanged thresholds; otherwise start
a thread. Merge proposals stay embedding-based. The eval replays the pipeline exactly: the later memo is classified
with the earlier memo's resulting thread titles in `recent_thread_titles`.

## Limits
- Two memos, four real cards. The noise floor is three synthetic cards; it needs real negative memos (unrelated ideas
  from the same creator) before any threshold is tuned. Thresholds stay at 0.80 / 0.85 until then.
- One embedding model and one text form (plus one variant).
