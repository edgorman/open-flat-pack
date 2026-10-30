# 3. Prompting

One model call turns a prompt into a plan of parts, and the backend places them as a layout. The model gets the whole catalogue, and [feasibility](0004-feasibility.md) checks its answer.

## The model

DeepSeek V4.1 Flash on Vertex AI (Model Garden, pay per token, served from the `global` location), as the cheapest model that does the job. The model name, location and daily call limit are configuration. The call asks for JSON output.

## Input

- A fixed system prompt explaining the [slot model](0002-catalogue.md#slots), the output format and what each range is for. It asks for every part the request names, on both sides where it says so, rather than the fewest parts.
- The catalogue.
- The user's prompt.
- When changing an existing design, that design's layout.

## Output: a plan and its parts

The model says what each part is for and what it stands on, never where it is. The backend works out the positions.

```json
{
  "limits": { "max_width": null, "max_height": null },
  "plan": ["left bookcase", "TV bench", "right bookcase"],
  "parts": [
    { "id": "left", "article": "40477340", "for": "left bookcase" },
    { "article": "20528246", "on": "left", "for": "left bookcase" },
    { "article": "70474062", "for": "TV bench" },
    { "article": "40477340", "for": "right bookcase" }
  ]
}
```

- `limits` are any size limits the model read from the prompt, in mm, or `null` where the prompt gave none. They can only tighten the fixed limits in [feasibility](0004-feasibility.md#rules), never relax them: a prompt asking for 6 m is still held to 5 m.
- `plan` lists what the request asks for, each side of an "either side" separately. Every plan item needs at least one part whose `for` names it, or the answer goes back to the model like a validation error.
- `on` is the `id` of an earlier part this one sits in or on, and it takes the first slot of that part's it can rest on. A part without `on` stands on the floor.
- When changing a design, the model copies each kept part with its `x` and `y`.

## Placing

The backend turns the answer into the layout, the list of parts with the position of each bottom-left corner in mm, seen from the front:

- Floor parts stand side by side, left to right, in the order listed.
- A part in a cell takes the host's next free cell, bottom row first and left to right, or the one `cell` picks by index.
- Parts on a front or an inside fill it left to right, then the next row up.
- Parts on a surface stand side by side from its left edge. A wider part carries on over its neighbours at the same height, so a top panel goes on the leftmost frame it covers.

There are no gaps: floor parts touch, and a front fills from its bottom-left corner.

Every part stands against the same wall, so there is no depth coordinate. The layout is the whole design: prices, sizes and colours are always read from the catalogue.

## Retries

If the layout fails validation, the errors go back to the model in the same conversation with a request to fix them by moving parts rather than removing them. Each failed attempt is logged with its errors. After two failed retries the user sees the remaining errors and can rephrase. Each error names the part and, where it helps, the nearest valid position, so the model has something concrete to correct.

## API

`POST /layouts` with `{ prompt, base_layout? }` answers with a valid layout, or 422 with the errors. It requires sign-in, so the existing rate limiting slows any one caller. Model spend has a hard cap: the backend counts its model calls per UTC day and, past the daily limit, answers 503 until midnight. Nothing else is stored.
