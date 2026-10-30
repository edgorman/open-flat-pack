# 7. Gallery

A `designs` resource. Every design is public, and only its owner can change it.

## A design

| Field | Notes |
| --- | --- |
| `id` | |
| `owner` | uid, never on the wire; the author's username is resolved on read |
| `prompt` | The design's title: the first prompt typed, which the owner can rename |
| `layout` | As in [prompting](0003-prompting.md#output-the-layout) |
| `forked_from` | The id of the design it was forked from, if any |
| `created_at` | |

## Forking

Open any design and type a change: its layout goes to the model as `base_layout`, and the result is an unpublished layout until you publish it. Publishing saves it as a new design with `forked_from` set. A fork holds its own copy of the layout, so it never changes when the original does. A fork of a deleted design keeps its `forked_from` and shows "original deleted".

## Editing

The owner sees Edit on their design. It opens the design in the editor like a fork, with its title in a field beside Save: retype the title, type changes, or drag parts, then Save replaces the design's title and layout under the same id and link.

## API

| Route | Access |
| --- | --- |
| `GET /designs` | Public. Newest first, paged by `limit` and `startAfter` (the last design's `createdAt`) |
| `GET /designs/{id}` | Public |
| `POST /designs` with `{ prompt, layout, forked_from? }` | Signed in. The layout is validated again before saving |
| `PUT /designs/{id}` with `{ prompt, layout }` | Owner only. The layout is validated again before saving |
| `DELETE /designs/{id}` | Owner only |

Each pair gets its line in the access policy table.
