# Category packs

One JSON file per category. After adding a file, import it in `../packs.ts`
(and optionally put its `id` in `../lineup.json`). Run `npm test` — it checks
every pack for alias collisions and count mismatches.

```jsonc
{
  "id": "bible-books",                 // unique, used in lineup.json
  "prompt": "Name a book of the Bible",
  "tag": "Bible",                      // "Bible" tags are used by Shuffle to keep ~half the game biblical
  "source": "Where the list came from", // optional, for humans
  "expectedCount": 66,                 // optional; tests fail if the answer count differs
  "stripPrefixes": ["book of"],        // optional; leading words players may type that should be ignored
  "answers": {
    "plankton": ["Genesis|Gen"],       // "Canonical|alias|alias"
    "schooler": [],
    "rare":     [],
    "deepcut":  [],
    "krillion": ["Obadiah"]            // the hidden gem; keep it to one or a few
  }
}
```

Tiers and points: Plankton 10 · Schooler 30 · Rare 60 · Deep Cut 85 · One in a Krillion 100.
They're **editorial guesses** about how many people would think of an answer — move
things around freely.

Matching rules (applied to both the pack and the player's answer):

- case, accents, punctuation and spaces are ignored (`"Mr. Mime"` = `"mrmime"`)
- leading "the / a / an" and any `stripPrefixes` are dropped
- `1 Samuel`-style names automatically accept `First Samuel`, `1st Samuel`, `I Samuel`
- small typos are forgiven (1 letter for 5–7 letter answers, 2 for 8+), but only if exactly
  one answer is that close; otherwise the answer is flagged for the host
- answers the host approves with "remember" are saved to the live database and accepted in
  future games — copy them into the JSON file to make them permanent
