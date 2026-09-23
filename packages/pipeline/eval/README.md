# Eval set

One file per memo: `<date>_<name>.expected.json` — the hand-labelled output the classifier must reproduce
(audio lives in Supabase storage or the R&D Drive folder, not in git).
Score: segment-type accuracy; card precision/recall (a card is correct if title/gist match by meaning and play_from_ms
is within 3 s); zero cards from retracted/filler/request/loose_end segments; zero actions inside cards; entity canonicalisation;
action due dates, when the memo gives its `recorded` local day (an action with no `due_date` must have none).
classify_v6 on: `candidate_project` per card, scored against the memo's `projects` list (exact name, or null); `frame_brief`
per card/action marked `drawable` (non-empty, naming one of `frame_brief_mentions`) or `empty` (abstract idea); and no
frame brief names a person, place or brand from the memo's entities. Whether a brief is a good drawing is judged by hand.
A prompt version ships when it fails no check the current shipping version passes (the ratchet — see CLAUDE.md). A check
whose result differs across repeated runs of the same version is scored by pass rate over 3 runs per version instead
(≥ the shipping version's rate); per-run outputs go in `runs/repeat/<memo>.<version>.run<n>.actual.json`. Add a memo every time the pipeline gets something wrong.
This set is the R&D evidence for CA1 (per-segment classification) and CA2 (thread identity) — commit it weekly.
