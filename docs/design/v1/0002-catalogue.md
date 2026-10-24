# 2. Catalogue

## The file

One hand-curated JSON file, embedded in the backend and served as-is at `GET /catalogue`. It lists every part a design may use: KALLAX frames in each size and finish, every KALLAX insert, door, drawer, leg and underframe sold on IKEA UK, and the DRÖNA and KUGGIS boxes that fit a cube. Roughly 50 entries.

Article numbers in examples throughout these docs are illustrative.

Each entry:

| Field | Example | Notes |
| --- | --- | --- |
| `article` | `80275887` | IKEA article number, the entry's key |
| `name` | `KALLAX shelving unit` | |
| `variant` | `white, 77x77 cm` | As IKEA words it |
| `finish` | `white` | Drives the preview colour |
| `size` | `{ "w": 770, "h": 770, "d": 390 }` | mm |
| `price_gbp` | `45.00` | As seen on `checked_on` |
| `url` | `https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-80275887/` | |
| `checked_on` | `2026-10-21` | When a person last confirmed the fields above |
| `rests_on` | `["floor", "top", "base"]` | Slot types this part may sit in or on |
| `offers` | see below | Slots this part provides to others |

## Slots

How parts go together is data in the catalogue. A slot is a named rectangle on a part, in mm relative to the part's bottom-left corner, seen from the front.

The code knows two kinds of slot:

- **cell** - a part resting here sits at the cell's bottom-left corner, and a cell holds at most one part. A KALLAX frame offers one `cube` cell per compartment; an insert, door, drawer set or box rests on `cube`.
- **surface** - a part resting here must sit wholly on it, and may span several surfaces at the same height. A frame offers a `top` surface, on which another frame can stand. An underframe offers a `base` surface, on which a frame can stand.

`floor` is a built-in surface at height 0 with no width limit.

For KALLAX:

| Part | `rests_on` | `offers` |
| --- | --- | --- |
| Frame | `floor`, `top`, `base` | one `cube` cell per compartment, one `top` surface |
| Insert, door, drawers, box | `cube` | - |
| Legs, underframe | `floor` | one `base` surface |

Legs and underframes rest only on the floor, so they can only go under the bottom level.

IKEA publishes outer sizes only, rounded to whole centimetres, so cube cells are worked out from a frame's size rather than measured. A KALLAX frame is a grid of 335 mm cells with 15 mm dividers, and its outer panels take up the rest, so a 770 mm wide frame has 2 columns with 42 mm outer panels. Cells only need to be accurate enough to place parts in the preview; a few millimetres out is invisible.

Entries start from `services/backend/scripts/scrape-catalogue`, which prints candidates from IKEA UK's search, including the cells and `rests_on` above. A person checks each one before it goes in the file.

A new range is added as new entries, with new slot names where it needs them (say `shelf` or `door`), as long as each slot is a cell or a surface.

## Product versions

An IKEA article number is fixed: when IKEA changes a product, the changed product gets a new article number. The number is also in the product URL. So an entry's `article` identifies exactly one version of a product, and the catalogue is updated by hand when IKEA replaces one. `checked_on` records how recently each entry's price was confirmed, and the parts list shows it.
