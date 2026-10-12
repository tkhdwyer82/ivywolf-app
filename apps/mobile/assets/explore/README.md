# Explore sample videos

Each tool tile on Explore (app/explore.tsx, Figma 1464:5 / 1737:164) loops its tool's official sample video, muted.
Drop the file here as `<tool key>.mp4` (keys in lib/explore.ts: nano-banana, kling-3, kling, capcut, suno, canva,
gamma) and add it to `VIDEOS` in lib/explore.ts. Until a file is here the tile shows its flat placeholder colour.
Keep each under ~2 MB (they ship in the app bundle).
