# 5. Preview

A Three.js scene in the browser, drawn from the layout and the catalogue, so it appears instantly and always matches what was validated.

## Scene

- **Blueprint style.** A white background with black lines, or the inverse in dark mode.
- **Parts are plain boxes** of their catalogue size, filled with their finish colour (white, black-brown, oak effect and so on, from a small map in the frontend) and outlined in black. Empty cubes show as recessed cells, so a frame reads as a shelving unit.
- **Guidelines and measurements.** A floor grid with a line every 100 mm, dimension lines with labels in cm for the overall width and height and for each frame, and a person-height marker for scale.
- **Orbit controls**, starting from a straight-on front view.

## Data

`GET /catalogue`, fetched once and cached, and the layout.
