# eval/recipes — eyeball extract → apply (Job B.10)

Five real how-to transcripts × three ideas. `run.ts` extracts a recipe from each transcript (recipe_extract_v1), then
applies it to each idea (recipe_apply_v1) and prints the cards — so a prompt change can be read side by side. It is a
tool, not a test gate and not the classify ratchet. It calls the model only: no database, no credits.

- `transcripts/0N-*.md` — first lines `handle:` and `url:`, then the post's text. Files containing `PLACEHOLDER` are
  skipped. **Tim supplies the five transcripts** (B.10 "Left for Tim"); replace the placeholders.
- `ideas.json` — three ideas in the shape the apply prompt gets (`title`, `said`, `gist`, `picture`, `project`).

```
npm run eval:recipes -w @ivywolf/pipeline -- --dry
npm run eval:recipes -w @ivywolf/pipeline -- --only 01 --idea jar
```

Needs `ANTHROPIC_API_KEY` in `../../.env.local` (Tim's). Never paste keys into prompts or chat.
