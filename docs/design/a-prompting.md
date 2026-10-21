# A. Prompting

One model call turns a prompt into a layout. There is no separate intent parser or module selector: the catalogue is small enough to send whole, and [B](b-feasibility.md) catches anything the model gets wrong.

## The model

DeepSeek on Vertex AI (Model Garden, pay per token), chosen because it is the cheapest that does the job. The model name is configuration, so it can be swapped without a code change. The call asks for JSON output.

## Input

- A fixed system prompt explaining the slot model and the output format.
- The catalogue (see [catalogue.md](catalogue.md)), minus fields the model doesn't need such as `url` and `instructions`.
- The user's prompt.
- For a tweak, the layout being tweaked.

## Output: the layout

Article numbers in examples throughout these docs are illustrative.

```json
{
  "limits": { "max_width": 1800, "max_height": null },
  "parts": [
    { "article": "80275887", "x": 0,   "y": 0 },
    { "article": "60351886", "x": 15,  "y": 15 },
    { "article": "80275887", "x": 0,   "y": 770 }
  ]
}
```

- `limits` are any limits the model read from the prompt, in mm; `null` if none were given. B never allows more than 2500 mm in height whatever they say.
- Each part is an article number and the position of its bottom-left corner in mm, seen from the front. There is no depth coordinate: everything stands against the same wall.

The layout is the whole design. Prices, sizes and colours are always looked up in the catalogue, never stored in it.

## Retries

If B rejects the layout, its errors go back to the model in the same conversation with a request to fix them. After two failed retries the user sees the remaining errors and can rephrase. Each error names the part and, where it helps, the nearest valid position, so the model has something concrete to correct.

## API

`POST /layouts` with `{ prompt, base_layout? }` answers with a valid layout, or 422 with the errors. It requires sign-in, so the existing rate limiting covers model spend. Nothing is stored.
