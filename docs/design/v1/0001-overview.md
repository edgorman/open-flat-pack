# 1. Overview

OpenFlatpack turns a sentence like "a 2-metre-wide white bookcase with record storage and two drawers" into a buildable arrangement of real IKEA parts, a 3D preview and a parts list with links to IKEA.

The guiding rule is to keep everything as simple as possible: what v1 does is exactly what these documents describe. What comes after v1 is in the [roadmap](../roadmap.md).

| # | Doc | What |
| --- | --- | --- |
| 1 | [Overview](0001-overview.md) | Scope and how a request flows |
| 2 | [Catalogue](0002-catalogue.md) | The parts catalogue and the slot model describing how parts fit together |
| 3 | [Prompting](0003-prompting.md) | Turning a prompt into a layout with one model call |
| 4 | [Feasibility](0004-feasibility.md) | Checking a layout is physically buildable |
| 5 | [Preview](0005-preview.md) | The 3D blueprint preview |
| 6 | [Parts list](0006-parts-list.md) | Prices, product links and article numbers |
| 7 | [Gallery](0007-gallery.md) | Publishing and forking designs |

## Scope

- **KALLAX**, with every KALLAX part (frames, inserts, doors, drawers, legs, underframes and other add-ons), plus the DRÖNA and KUGGIS boxes that fit its cubes. How parts fit together is catalogue data, so another range is added by adding entries.
- **IKEA UK.** Prices in GBP, links to `ikea.com/gb/en`.
- **Furniture only.** A design is the furniture itself, within optional limits from the prompt such as "no wider than 180 cm".
- **Stacking**, up to 5 m in total height.

## How a request flows

```
prompt ──► model call ──► layout ──► validate ──► valid ──► preview + parts list
               ▲                        │
               └──── errors, retry ◄────┘                   ──► publish (optional)
```

1. A signed-in user types a prompt, or opens a design and types a change ("make it one cube taller").
2. The backend sends the prompt and the catalogue to the model, which returns a layout: a list of parts and their positions ([3](0003-prompting.md)).
3. The backend validates the layout. On failure it sends the errors back to the model and retries ([4](0004-feasibility.md)).
4. The frontend draws the valid layout in 3D ([5](0005-preview.md)) and lists its parts ([6](0006-parts-list.md)).
5. The user can publish it to the gallery, where anyone can fork it ([7](0007-gallery.md)).

## Where it lives

- The **backend** (Go, Cloud Run) owns the catalogue, the model call, validation and the `designs` resource in Firestore.
- The **frontend** (React, Cloudflare Pages) renders the preview and the parts list and hosts the gallery.
- The wire types (layout, design, catalogue) are `.proto` messages in `packages/protos`, following the rules there.
