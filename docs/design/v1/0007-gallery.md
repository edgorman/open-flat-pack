# 7. Gallery

A `designs` resource, built the same way as the template's `notes`. Every design is public, and a design never changes once published.

## A design

| Field | Notes |
| --- | --- |
| `id` | |
| `owner` | uid, never on the wire; the author's username is resolved on read, as for notes |
| `prompt` | The prompt that produced it |
| `layout` | As in [prompting](0003-prompting.md#output-the-layout) |
| `forked_from` | The id of the design it was forked from, if any |
| `created_at` | |

## Forking

Open any design and type a change: its layout goes to the model as `base_layout`, and the result is an unpublished layout until you publish it. Publishing saves it as a new design with `forked_from` set. This is also how you change your own design, so a published design never changes under anyone who forked it. A fork of a deleted design keeps its `forked_from` and shows "original deleted".

## API

| Route | Access |
| --- | --- |
| `GET /designs` | Public. Newest first, paged like `GET /notes` |
| `GET /designs/{id}` | Public |
| `POST /designs` with `{ prompt, layout, forked_from? }` | Signed in. The layout is validated again before saving |
| `DELETE /designs/{id}` | Owner only |

Each pair gets its line in the access policy table.
