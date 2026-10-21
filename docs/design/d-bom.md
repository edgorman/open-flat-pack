# D. Parts list

Computed in the browser from the layout and the catalogue: group parts by article number and count them. There are no separate lines for hinges or fittings, because KALLAX parts ship with their own.

## What it shows

| Column | From |
| --- | --- |
| Part | `name` and `variant`, linked to `url` on IKEA UK |
| Article number | `article`, formatted as IKEA does (`802.758.87`) |
| Quantity | Count in the layout |
| Unit price | `price_gbp` |
| Line total | Quantity × unit price |

Then the grand total, the build notes from [B](b-feasibility.md), and a note under the total: "Prices from our catalogue, last checked <oldest `checked_on` in the list>. They may be out of date; check on IKEA before buying."

## Getting it into a basket

No cart integration: IKEA has no public cart API. Each line links to its product page, and a **Copy article numbers** button copies one `article number × quantity` line per part, for pasting into an IKEA shopping list.

## Not in v1

Live prices and stock. They would mean scraping IKEA's unofficial endpoints; catalogue prices are kept up to date by hand instead (see [catalogue.md](catalogue.md)).
