# Catalogue and slot model

## The catalogue

One hand-curated JSON file, embedded in the backend and served as-is at `GET /catalogue`. It lists every part the model may use: KALLAX frames in each size and finish, every KALLAX insert, door, drawer, leg and underframe sold on IKEA UK, and the DRÖNA and KUGGIS boxes that fit a cube. Roughly 50 entries.

Each entry:

| Field | Example | Notes |
| --- | --- | --- |
| `article` | `80275887` | IKEA article number, the entry's key |
| `name` | `KALLAX shelving unit` | |
| `variant` | `white, 77x77 cm` | As IKEA words it |
| `finish` | `white` | Drives the preview colour |
| `size` | `{ "w": 770, "h": 770, "d": 390 }` | mm |
| `price_gbp` | `45.00` | As seen on `checked_on` |
| `url` | `https://www.ikea.com/gb/en/p/...-80275887/` | |
| `instructions` | `AA-1234567-5` | Assembly instructions document number, including its revision |
| `checked_on` | `2026-10-21` | When a person last confirmed the fields above |
| `rests_on` | `["floor", "top", "base"]` | Slot types this part may sit in or on |
| `offers` | see below | Slots this part provides to others |

## Slots

Everything about how parts go together is data in the catalogue, not code. A slot is a named rectangle on a part, in mm relative to the part's bottom-left corner, seen from the front.

There are two kinds of slot, and these two kinds are the only thing the code knows about:

- **cell** - a part resting here must fill it exactly, and a cell holds at most one part. A KALLAX frame offers one `cube` cell per compartment; an insert, door, drawer set or box rests on `cube`.
- **surface** - a part resting here must sit wholly on it, and may span several surfaces at the same height. A frame offers a `top` surface; a stacked frame rests on `top`. An underframe offers a `base` surface; a frame rests on `base`.

`floor` is a built-in surface at height 0 with no width limit.

So for KALLAX:

| Part | `rests_on` | `offers` |
| --- | --- | --- |
| Frame | `floor`, `top`, `base` | one `cube` cell per compartment, one `top` surface |
| Insert, door, drawers, box | `cube` | - |
| Legs, underframe | `floor` | one `base` surface |

Because legs and underframes rest only on the floor, "legs only on the bottom level" needs no rule of its own.

Adding BILLY later means adding entries, and perhaps new slot names such as `shelf` or `door`, but no new code as long as they are cells or surfaces.

## Keeping up with IKEA

We can't pin what IKEA sells, but we pin what we believe it sells and notice when that drifts:

- **The article number is the version key.** IKEA normally gives a part a new article number when it changes in a way that matters (size, construction), and each finish has its own. The number is in the product URL, and a retired one stops resolving.
- **The instructions document number is the finer signal.** Its revision suffix changes when the build changes, even if the article number doesn't.
- **`checked_on` says how stale an entry is.** The parts list shows it next to the prices.

In v1 the catalogue is updated by hand. A later scheduled job could fetch each entry's page and flag any that are gone or whose size, price or instructions number differ. These IKEA behaviours are from experience rather than any published guarantee, and should be confirmed against live pages while writing the first catalogue.
