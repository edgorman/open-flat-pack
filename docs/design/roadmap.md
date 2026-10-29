# Roadmap

OpenFlatpack turns a sentence like "a 2-metre-wide white bookcase with record storage and two drawers" into a buildable arrangement of real IKEA parts, a 3D preview and a parts list with links to IKEA.

## v1

Designed in [`v1/`](v1/0001-overview.md).

- KALLAX shelving, every KALLAX part, and the DRÖNA and KUGGIS boxes that fit its cubes.
- IKEA UK only.
- A prompt becomes a layout through one model call, checked against physical rules, with stacking up to 2.5 m.
- A 3D blueprint preview in the browser.
- A parts list with product links and a copyable list of article numbers.
- A public gallery of designs that anyone can fork.

## v2

Designed in [`v2/`](v2/0001-more-ranges.md).

- BILLY bookcases with OXBERG and HÖGBO doors, using a new `front` slot for doors.
- EKET, IVAR and BESTÅ storage, with BESTÅ's fronts and legs.
- PAX wardrobes with their doors and KOMPLEMENT interiors.
- Sending the model only the ranges a prompt needs, so a bigger catalogue doesn't grow every call.

## Later

Not yet scheduled:

- More IKEA ranges, such as PLATSA, desks and kitchens.
- More markets than the UK.
- Designing within a room.
- Photorealistic renders of a design.
- Adding a design straight to an IKEA basket.
- Live prices and stock, and a scheduled check that flags catalogue entries IKEA no longer sells.
- Private designs.
- Likes, comments and search in the gallery.
