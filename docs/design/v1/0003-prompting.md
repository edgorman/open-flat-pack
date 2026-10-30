# 3. Prompting

One model call turns a prompt into a layout. The model gets the whole catalogue, and [feasibility](0004-feasibility.md) checks its answer.

## The model

DeepSeek V4.1 Flash on Vertex AI (Model Garden, pay per token, served from the `global` location), as the cheapest model that does the job. The model name, location and daily call limit are configuration. The call asks for JSON output.

## Input

- A fixed system prompt explaining the [slot model](0002-catalogue.md#slots), the output format and what each range is for. It asks for every part the request names, on both sides where it says so, rather than the fewest parts.
- The catalogue.
- The user's prompt.
- When changing an existing design, that design's layout.

## Output: the layout

```json
{
  "limits": { "max_width": 1800, "max_height": null },
  "parts": [
    { "article": "80275887", "x": 0,  "y": 0 },
    { "article": "60351886", "x": 15, "y": 15 },
    { "article": "80275887", "x": 0,  "y": 770 }
  ]
}
```

- `limits` are any size limits the model read from the prompt, in mm, or `null` where the prompt gave none. They can only tighten the fixed limits in [feasibility](0004-feasibility.md#rules), never relax them: a prompt asking for 6 m is still held to 5 m.
- Each part is an article number and the position of its bottom-left corner in mm, seen from the front. Every part stands against the same wall, so there is no depth coordinate.

The layout is the whole design. Prices, sizes and colours are always read from the catalogue.

## Retries

If the layout fails validation, the errors go back to the model in the same conversation with a request to fix them by moving parts rather than removing them. Each failed attempt is logged with its errors. After two failed retries the user sees the remaining errors and can rephrase. Each error names the part and, where it helps, the nearest valid position, so the model has something concrete to correct.

## API

`POST /layouts` with `{ prompt, base_layout? }` answers with a valid layout, or 422 with the errors. It requires sign-in, so the existing rate limiting slows any one caller. Model spend has a hard cap: the backend counts its model calls per UTC day and, past the daily limit, answers 503 until midnight. Nothing else is stored.
