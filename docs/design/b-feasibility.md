# B. Feasibility

A plain function in the backend: layout and catalogue in, list of errors out. An empty list means the design is buildable. It knows nothing about KALLAX; everything specific lives in the [catalogue](catalogue.md).

There is no voxel grid. Every part is a rectangle (its `size.w` by `size.h` at its `x`, `y`) and every check is a rectangle comparison.

## Rules

1. **Known parts.** Every `article` is in the catalogue.
2. **Supported.** Every part rests on a slot type listed in its `rests_on`:
   - on a **cell**, its rectangle matches the cell exactly (within 2 mm), and no other part uses that cell;
   - on a **surface**, its bottom edge is at the surface's height and its whole width is covered by surfaces of that type at that height. This is the no-overhang rule for stacking, and it lets one frame span two frames below it.
3. **No collisions.** No two parts overlap, except a part and the part whose cell it sits in.
4. **Height.** The tallest point is at most 2500 mm, and at most `limits.max_height` if given.
5. **Width.** The overall width is at most `limits.max_width` if given.

## Results

Each error names the part by its index in the layout and says what is wrong, for example `part 4 (KALLAX insert with door) does not fill a cube; nearest free cube is at x=350, y=15`. The same messages go to the model on a retry and to the user if retries run out.

## Build notes

Validation also returns build notes, which the parts list shows. In v1 there is one: any layout with a stacked part gets "Fix to the wall: this design is stacked."
