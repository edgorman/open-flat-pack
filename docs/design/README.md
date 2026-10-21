# OpenFlatpack design

OpenFlatpack turns a sentence like "a 2-metre-wide white bookcase with record storage and two drawers" into a buildable arrangement of real IKEA parts, a 3D preview and a parts list with prices and links.

These documents describe v1. The guiding rule is to remove complexity before it exists: anything not listed here is out of scope until it is asked for.

| Doc | What |
| --- | --- |
| [catalogue.md](catalogue.md) | The hand-curated parts catalogue, the slot model every other part relies on, and how we notice IKEA changing a product |
| [a-prompting.md](a-prompting.md) | A. Turning a prompt into a layout with one model call |
| [b-feasibility.md](b-feasibility.md) | B. Checking a layout is physically buildable |
| [c-preview.md](c-preview.md) | C. The Three.js blueprint preview |
| [d-bom.md](d-bom.md) | D. The bill of materials and shopping links |
| [e-gallery.md](e-gallery.md) | E. Publishing, the gallery and forking |

## v1 scope

- **One range: KALLAX**, with every KALLAX part (frames, inserts, doors, drawers, legs, underframes and other add-ons), plus the cube boxes that fit it (DRÖNA, KUGGIS). The model stays general so BILLY can follow as catalogue data rather than new code.
- **One market: IKEA UK.** Prices in GBP, links to `ikea.com/gb/en`.
- **No room.** We design the furniture only, against optional limits such as "no wider than 180 cm".
- **Stacking is allowed**, up to 2.5 m in total height.

## How a request flows

```
prompt ──► A: one model call ──► layout ──► B: validate ──► ok ──► C: preview + D: parts list
                    ▲                            │
                    └──── errors, retry ◄────────┘                ──► E: publish (optional)
```

1. The signed-in user types a prompt, or tweaks an existing design by typing a change ("make it one cube taller").
2. The backend sends the prompt and the catalogue to the model, which returns a layout: a list of parts and their positions.
3. The backend validates the layout. On failure it sends the errors back to the model and retries a small fixed number of times.
4. The frontend draws the valid layout in 3D and lists its parts with prices and links.
5. The user can publish it to the gallery, where anyone can fork it.

## Where it lives in the template

- The **backend** (Go, Cloud Run) owns the catalogue, the model call, validation and the `designs` resource in Firestore.
- The **frontend** (React, Cloudflare Pages) renders the preview and the parts list and hosts the gallery.
- The wire types (layout, design, catalogue) are `.proto` messages in `packages/protos`, following the existing rules there.

## Out of scope for v1

Other IKEA ranges and markets, rooms, photorealistic rendering, a cart integration, live price and stock checks, private designs, a drag-and-drop editor, and likes, comments or search in the gallery.
