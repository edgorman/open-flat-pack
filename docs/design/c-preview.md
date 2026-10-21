# C. Preview

The Three.js view is the result. It is drawn in the browser from the layout and the catalogue, so it is instant, free and always matches what was validated. Photorealistic rendering is out of v1.

## Scene

- **Blueprint style.** A white background with black lines, or the inverse in dark mode.
- **Parts are plain boxes** of their catalogue size, filled with their finish colour (white, black-brown, oak effect and so on, from a small map in the frontend) and outlined in black. Empty cubes show as recessed cells so the frame reads as a KALLAX, not a solid block.
- **Guidelines and measurements.** A floor grid with a line every 100 mm, dimension lines with labels in cm for the overall width and height and for each frame, and a small person-height marker for scale.
- **Orbit controls**, starting from a straight-on front view.

## What it needs

Only `GET /catalogue` (fetched once and cached) and the layout. There is no backend rendering step.
