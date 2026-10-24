# 6. Parts list

Computed in the browser from the layout and the catalogue by grouping parts by article number and counting them. KALLAX parts ship with their own fittings, so there is one line per article.

## Columns

| Column | From |
| --- | --- |
| Part | `name`, `finish` and size in cm, linked to `https://www.ikea.com/gb/en/p/-<article>/` |
| Article number | `article`, formatted as IKEA does (`802.758.87`) |
| Quantity | Count in the layout |

Below the table: the build notes from [feasibility](0004-feasibility.md#build-notes). The catalogue holds no prices, so the list shows none; IKEA shows the current price on each product page and in the shopping list.

## Buying

Each line links to its product page on IKEA UK. A **Copy article numbers** button copies one `article number × quantity` line per part, for pasting into an IKEA shopping list.
