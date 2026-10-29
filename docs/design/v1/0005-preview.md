# 5. Preview

A Three.js scene in the browser, drawn from the layout and the catalogue, so it appears instantly and always matches what was validated.

## Scene

- **Product-shot style.** A white background (dark grey in dark mode) with soft studio lighting, and a shadow cast onto the floor.
- **Parts are plain boxes** of their catalogue size, filled with their finish colour (white, black-brown, oak effect and so on, from a small map in the frontend) and lightly outlined. Empty cubes show as recessed cells, so a frame reads as a shelving unit.
- **Measurements and scale.** A floor grid with a line every 10 cm and a stronger one every metre, a 0-100 cm scale bar on the floor in front, and dimension lines with labels in cm for the overall width and height and for each frame. A toolbar hides the dimensions.
- **Orbit controls**, starting from a three-quarter view, with Front and Reset views on the toolbar.

## Data

`GET /catalogue`, fetched once and cached, and the layout.
