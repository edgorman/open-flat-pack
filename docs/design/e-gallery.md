# E. Gallery

A `designs` resource modelled on the template's `notes`, but simpler: every design is public, and a design never changes once published.

## A design

| Field | Notes |
| --- | --- |
| `id` | |
| `owner` | uid, never on the wire; the author's username is resolved on read, as for notes |
| `prompt` | The prompt that produced it |
| `layout` | As in [A](a-prompting.md) |
| `forked_from` | The id of the design it was forked from, if any |
| `created_at` | |

There is no visibility field: every design is public. There is no update: tweaking a design, your own included, publishes a new one with `forked_from` set, so a published design never changes under anyone who forked it.

## Forking

Open any design, type a change, and the current layout goes to [A](a-prompting.md) as `base_layout`. The result is an unsaved layout until you publish it. A fork of a deleted design keeps its `forked_from` and shows "original deleted".

## API

| Route | Access |
| --- | --- |
| `GET /designs` | Public. Newest first, paged like `GET /notes` |
| `GET /designs/{id}` | Public |
| `POST /designs` with `{ prompt, layout, forked_from? }` | Signed in. The layout is validated again before saving |
| `DELETE /designs/{id}` | Owner only |

Each pair gets its line in the access policy table.

## Not in v1

Private designs, editing, likes, comments, search and filtering.
