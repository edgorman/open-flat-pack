# 6. Parts list

Computed in the browser from the layout and the catalogue by grouping parts by article number and counting them. KALLAX parts ship with their own fittings, so there is one line per article.

## Columns

| Column | From |
| --- | --- |
| Part | `name` and `variant`, linked to `url` on IKEA UK |
| Article number | `article`, formatted as IKEA does (`802.758.87`) |
| Quantity | Count in the layout |
| Unit price | `price_gbp` |
| Line total | Quantity × unit price |

Below the table: the grand total, the build notes from [feasibility](0004-feasibility.md#build-notes), and the note "Prices from our catalogue, last checked <oldest `checked_on` in the list>. They may be out of date; check on IKEA before buying."

## Buying

Each line links to its product page on IKEA UK. A **Copy article numbers** button copies one `article number × quantity` line per part, for pasting into an IKEA shopping list.
