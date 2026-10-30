# 5. Preview

A Three.js scene in the browser, drawn from the layout and the catalogue, so it appears instantly and always matches what was validated.

## Scene

- **Product-shot style.** A white background (dark grey in dark mode) with soft studio lighting, and a shadow cast onto the floor.
- **Parts are plain boxes** of their catalogue size, filled with their finish colour (white, black-brown, oak effect and so on, from a small map in the frontend) and lightly outlined. Empty cubes show as recessed cells, so a frame reads as a shelving unit. A bookcase or cabinet that takes a front (BILLY, BESTÅ) shows as an open carcass with evenly spaced shelves about 35 cm apart.
- **Doors and drawer fronts** can be hidden from the toolbar, to show the cabinet behind them.
- **Tapping a part** names it in a tag where it was tapped.
- **Measurements and scale.** A floor grid with a line every 10 cm and a stronger one every metre, a 0-100 cm scale bar on the floor in front, and dimension lines with labels in cm for the overall width and height and for each frame. A toolbar hides the dimensions.
- **Orbit controls**, starting from a three-quarter view, with Front and Reset views on the toolbar.

## Data

`GET /catalogue`, fetched once and cached, and the layout.

## Moving parts

While a design is unpublished, pressing and holding a part picks it up, and dragging moves it across the wall. While it is dragged every other part fades to its outline. Letting go snaps it to the nearest spot where it can rest: a free cell, a surface such as a frame's top, or the floor where it was dropped or beside another part. Everything resting in or on the part moves with it, so moving an underframe carries its frame and inserts. A short tap still names the part, and a drag that starts without the hold orbits the view.

Tapping a part also shows a swatch for each finish IKEA sells it in. A finish is its own article, so these are the catalogue entries with the same name, size and slots, and picking one swaps the part's article.

After each move or colour change the layout goes to `POST /layouts/check`, which runs [feasibility](0004-feasibility.md) alone, with no model call, and answers with its errors and build notes. Parts with errors are tinted red and Publish waits until there are none; a refine prompt can fix them too, since it starts from the edited layout.

Parts face the front and stand against one wall, so there is no rotation.
