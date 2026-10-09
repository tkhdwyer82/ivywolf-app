# Generation gateway: results (Jobs H.0a, H.0b)

`generate(model, brief, refs)` in `packages/pipeline/generate` is the one way Ivy makes an image or a clip. These are
the first measured runs, from 9 Oct 2026. Re-run with `scripts/run-h0-tests.ts`; the offline checks are in
`scripts/test-gateway.ts`.

## How a run is routed
1. **Brief.** The idea's own words come first (`buildBrief`). The style pack's tone words fill gaps but never
   contradict the idea: if the idea names a time of day, weather or light, tone words of that kind are dropped. The
   names of anyone heard are stripped before the brief leaves (`redact.ts`).
2. **Estimate.** Every live route that serves the model's **exact version** and can honour the refs is estimated.
   Every estimate is kept on the run.
3. **Choose.**
   - The cheapest route wins.
   - If prices are equal (to 4 decimal places), the lower **rolling latency** wins: the average of the last 10
     completed runs of *that model* on each route.
   - After that, list order decides.
   - A route with no measurements yet only wins on list order.
   - `route` forces a choice for comparisons; the run records `chosen: forced`.
4. **Run.** The run row is written, then the request is submitted and polled. The output is copied to
   `frames/<creator>/generations/<run>.<ext>`. One `credit_events` row is written per run (separate from the
   creator's `credit_ledger`).

**Resolution.** It's a single choice at Create time, with the price shown. Seedance 2.5 offers 480p ($1.03 per 5 s
at 9:16) or 720p ($2.31). 720p is the default until it's decided after reviewing the 480p clip. There's no
preview/final stage, no re-render and no parent run. A resolution the model doesn't offer is refused. Kling 3.0
Standard has a fixed 720p output.

**Model tiers.** Seedance 2.5 is the `default` video model and Kling 3.0 Standard is `fast`. SOUL V2 is the
`default` image model (not run yet: its Soul ID is pending).

## Model IDs
| Model (registry key) | Version | Higgsfield endpoint | fal endpoint |
|---|---|---|---|
| Kling 3.0 Standard, text to video (`kling-3.0-std-t2v`) | kling-3.0-std | `kling-video/v3.0/std/text-to-video` | `fal-ai/kling-video/v3/standard/text-to-video` |
| Seedance 2.5, text to video (`seedance-2.5-t2v`) | seedance-2.5 | `bytedance/seedance-2.5/text-to-video` | `bytedance/seedance-2.5/text-to-video` |
| SOUL V2, text to image (`soul-2`) | soul-2 | `higgsfield-ai/soul/v2/standard` | (none) |

Both routes serve the same versions with the same input ranges, checked against fal's OpenAPI. The differences:
- Kling's audio flag is named `sound` on Higgsfield and `generate_audio` on fal.
- Seedance's default bitrate differs between the routes, so it's set to `high` on both.

## Prices
| Model | Higgsfield | fal |
|---|---|---|
| Kling 3.0 Standard | $0.357 per 5 s (Higgsfield's estimate: 5.712 credits) | $0.14/s → $0.70 per 5 s |
| Seedance 2.5 | $0.0214 per 1,000 video tokens (480p and 720p), $0.0234 at 1080p | $0.0214 per 1,000 video tokens |

Seedance's billable video tokens are ⌈height × width × seconds × 24 / 1024⌉. For 5 s at 9:16 that is:
- 720p: 108,000 tokens, $2.3112
- 480p: 47,982 tokens, $1.0268

Higgsfield's Seedance estimate endpoint returns this formula as text, not a figure. The route computes the price
from the formula and refuses to price if its wording changes.

**Actual cost.** Higgsfield reports no per-request charge. fal reports one through billing events, but only with an
admin key (`FAL_ADMIN_KEY`, deliberately not set yet). So every "actual" below is the estimate on completion, and
$0 for a failed or rejected run, which is both providers' documented billing. `actual_source` records which.

## Runs
Test account, card `9f449fb5` ("Rooftop chase ending with Ivy Mini"), at night, 5 s, 9:16, no audio.

| Model | Route | Resolution | Estimate | Actual | Latency | Brief |
|---|---|---|---|---|---|---|
| Kling 3.0 Standard | Higgsfield | 720 × 1280 | $0.3570 | $0.3570 | 105.2 s | old |
| Seedance 2.5 | Higgsfield | 720 × 1280 | $2.3112 | $2.3112 | 435.1 s | old |
| Kling 3.0 Standard | fal | 720 × 1280 | $0.7000 | $0.7000 | 62.7 s | fixed |
| Kling 3.0 Standard | Higgsfield | 720 × 1280 | $0.3570 | $0.3570 | 104.8 s | fixed |
| Seedance 2.5 | fal | 720 × 1280 | $2.3112 | $2.3112 | 211.0 s | fixed |
| Seedance 2.5 | Higgsfield | 720 × 1280 | $2.3112 | $2.3112 | 211.8 s | fixed |
| Seedance 2.5 | Higgsfield (tie; list order, before the latency tie-break) | 480 × 854 | $1.0268 | $1.0268 | 201.9 s | fixed |

- **Kling:** Higgsfield costs half as much; fal returns 40% sooner.
- **Seedance:** both routes cost the same and took the same time per run. Higgsfield's first run (435 s) was much
  slower. At 480p Seedance costs 44% of the 720p price but isn't noticeably faster.

## The brief fix
The first two runs used a brief of idea + "at night" + every tone word: "Look: warm, film grain, **soft daylight**".
Seedance rendered dusk. `buildBrief` now drops a tone word whose kind (time of day, weather, light) the idea already
names: "at night" drops "soft daylight" and keeps "warm, film grain". Every later run reads as night. It also no
longer adds a second full stop after a quoted line. The brief used for the fixed runs:

> Rooftop chase ending with Ivy Mini, at night. A short Instagram action video where a performer leaps across
> rooftops chased by bad guys and ends by holding up Ivy Mini saying "I have it." Look: warm, film grain.

## Open
- **Default resolution for Seedance 2.5** (480p or 720p): to be decided after reviewing the 480p clip.
- **Re-rendering a picked take: not building it.** For the record, neither route's Seedance text-to-video takes a
  seed. fal's draft → `draft/complete` keeps a take, but only completes at 1080p.
- **SOUL V2** waits on a Soul ID trained from images chosen deliberately.
- **Higgsfield key:** `HIGGSFIELD_API_KEY` must be exactly `<key id>:<secret>`. The Vercel value was re-entered in
  that form on 9 Oct.
