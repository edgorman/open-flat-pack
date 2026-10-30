// Package feasibility checks that a layout can be built from catalogue parts. Every part is a
// rectangle seen from the front and every rule is a rectangle comparison, so nothing here knows
// about any one range: how parts fit together is slot data in the catalogue. See
// docs/design/v1/0004-feasibility.md.
package feasibility

import (
	"fmt"
	"slices"
	"strings"

	"google.golang.org/protobuf/proto"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

// MaxHeight is the tallest a design may be, in mm. A prompt's limits only ever lower it.
const MaxHeight = 2500

// Overhang is how much of a part's width, in mm, may stick out past the surfaces it rests on.
// IKEA rounds sizes to whole centimetres, and a KALLAX underframe is listed 10 mm narrower than
// the frame it's made for.
const Overhang = 10

// StackedNote is the build note for a design with a part standing on another part's top.
const StackedNote = "Fix to the wall: this design is stacked."

type rect struct{ x, y, w, h int32 }

// String is how errors place a rectangle, so the model can see what to move where.
func (a rect) String() string {
	return fmt.Sprintf("%dx%d mm at x=%d, y=%d", a.w, a.h, a.x, a.y)
}

// overlaps is true when two rectangles share area; touching edges don't count.
func (a rect) overlaps(b rect) bool {
	return a.x < b.x+b.w && b.x < a.x+a.w && a.y < b.y+b.h && b.y < a.y+a.h
}

// slot is a slot one placed part offers, in layout coordinates.
type slot struct {
	owner int
	name  string
	kind  string
	rect
}

// Validate checks layout against the catalogue. The layout is buildable when the result has no
// errors; its notes are shown on the parts list either way.
func Validate(layout *appv1.Layout, catalogue *appv1.Catalogue) *appv1.Validation {
	v := &appv1.Validation{}
	if len(layout.GetParts()) == 0 {
		v.Errors = append(v.Errors, &appv1.LayoutError{Message: "the layout has no parts"})
		return v
	}

	byArticle := map[string]*appv1.Part{}
	for _, part := range catalogue.GetParts() {
		byArticle[part.Article] = part
	}

	// Rule 1: known parts. Unknown ones stay nil and are skipped by every later rule.
	parts := make([]*appv1.Part, len(layout.Parts))
	rects := make([]rect, len(layout.Parts))
	var slots []slot
	for i, placed := range layout.Parts {
		part := byArticle[placed.Article]
		if part == nil {
			v.Errors = append(v.Errors, partError(i, fmt.Sprintf("part %d: article %q is not in the catalogue", i, placed.Article)))
			continue
		}
		parts[i] = part
		rects[i] = rect{placed.X, placed.Y, part.GetSize().GetW(), part.GetSize().GetH()}
		for _, s := range part.Offers {
			slots = append(slots, slot{i, s.Name, s.Kind, rect{placed.X + s.X, placed.Y + s.Y, s.W, s.H}})
		}
	}

	// Rule 2: supported. Cells are claimed first, in layout order, so a later part that wants a
	// taken cell is the one told about it and the nearest free cell is known for the rest. A part in
	// a front or an inside needs only to lie wholly inside one; rule 3 keeps the parts sharing it
	// apart.
	host := make([]int, len(parts)) // the part whose slot each part sits in, or -1
	in := make([]int, len(parts))   // index into slots of the slot each part sits in, or -1
	occupant := map[int]int{}       // index into slots -> the part in that cell
	for i, part := range parts {
		host[i], in[i] = -1, -1
		if part == nil {
			continue
		}
		if c := cellAt(slots, part.RestsOn, rects[i], i); c >= 0 {
			if _, taken := occupant[c]; !taken {
				occupant[c] = i
				host[i], in[i] = slots[c].owner, c
			}
		} else if a := areaAround(slots, part.RestsOn, rects[i], i); a >= 0 {
			host[i], in[i] = slots[a].owner, a
		}
	}
	stacked := false
	unsupportedParts := map[int]bool{}
	for i, part := range parts {
		if part == nil || host[i] >= 0 {
			continue
		}
		if c := cellAt(slots, part.RestsOn, rects[i], i); c >= 0 {
			v.Errors = append(v.Errors, partError(i, fmt.Sprintf("%s shares a %s with part %d", describe(i, part), slots[c].name, occupant[c])))
			unsupportedParts[i] = true
			continue
		}
		on := surfaceUnder(slots, part.RestsOn, rects[i], i)
		if on == "" {
			v.Errors = append(v.Errors, partError(i, unsupported(slots, occupant, part, rects[i], i)))
			unsupportedParts[i] = true
		}
		// Standing on another part's top makes a design stacked; the floor and an underframe's or
		// legs' base don't.
		stacked = stacked || (on != "" && on != "floor" && on != "base")
	}

	// Rule 3: no collisions, except a part and the part whose slot it sits in, and two parts in
	// different slots of one part, such as a door and a drawer behind it. A part with nothing to
	// rest on has to move anyway, so what it overlaps where it is now is noise.
	ok := func(i int) bool { return parts[i] != nil && !unsupportedParts[i] }
	apart := func(i, j int) bool {
		return in[i] >= 0 && in[j] >= 0 && host[i] == host[j] && slots[in[i]].name != slots[in[j]].name
	}
	for j := range parts {
		for i := range j {
			if ok(i) && ok(j) && host[i] != j && host[j] != i && !apart(i, j) && rects[i].overlaps(rects[j]) {
				v.Errors = append(v.Errors, partError(j, fmt.Sprintf("%s is %s and overlaps part %d (%s), which is %s",
					describe(j, parts[j]), rects[j], i, parts[i].Name, rects[i])))
			}
		}
	}

	// Rules 4 and 5: overall height and width.
	var left, right, top int32
	first := true
	for i, part := range parts {
		if part == nil {
			continue
		}
		r := rects[i]
		if first || r.x < left {
			left = r.x
		}
		if first || r.x+r.w > right {
			right = r.x + r.w
		}
		top = max(top, r.y+r.h)
		first = false
	}
	limits := layout.GetLimits()
	if limits == nil {
		limits = &appv1.Limits{}
	}
	maxHeight := int32(MaxHeight)
	if limit := limits.MaxHeight; limit != nil && *limit < maxHeight {
		maxHeight = *limit
	}
	if top > maxHeight {
		v.Errors = append(v.Errors, &appv1.LayoutError{Message: fmt.Sprintf("the design is %d mm tall; the limit is %d mm", top, maxHeight)})
	}
	if limit := limits.MaxWidth; limit != nil && right-left > *limit {
		v.Errors = append(v.Errors, &appv1.LayoutError{Message: fmt.Sprintf("the design is %d mm wide; the limit is %d mm", right-left, *limit)})
	}

	if stacked {
		v.Notes = append(v.Notes, StackedNote)
	}
	return v
}

// cellAt is the index of a cell, named in restsOn and offered by another part, whose bottom-left
// corner is exactly r's, or -1.
func cellAt(slots []slot, restsOn []string, r rect, self int) int {
	for c, s := range slots {
		if s.kind == "cell" && s.owner != self && s.x == r.x && s.y == r.y && slices.Contains(restsOn, s.name) {
			return c
		}
	}
	return -1
}

// areaAround is the index of a front or inside, named in restsOn and offered by another part,
// that holds all of r, or -1.
func areaAround(slots []slot, restsOn []string, r rect, self int) int {
	for f, s := range slots {
		if (s.kind == "front" || s.kind == "inside") && s.owner != self && slices.Contains(restsOn, s.name) &&
			r.x >= s.x && r.y >= s.y && r.x+r.w <= s.x+s.w && r.y+r.h <= s.y+s.h {
			return f
		}
	}
	return -1
}

// surfaceUnder is the name in restsOn of the surfaces that cover r's bottom edge, all but Overhang
// mm of it, or "".
// floor is a built-in surface at height 0 with no width limit.
func surfaceUnder(slots []slot, restsOn []string, r rect, self int) string {
	for _, name := range restsOn {
		if name == "floor" && r.y == 0 {
			return name
		}
		var spans [][2]int32
		for _, s := range slots {
			if s.kind == "surface" && s.owner != self && s.name == name && s.y == r.y {
				spans = append(spans, [2]int32{s.x, s.x + s.w})
			}
		}
		// Merge touching spans into runs; a gap under the part splits them, so only one run can
		// hold it.
		slices.SortFunc(spans, func(a, b [2]int32) int { return int(a[0] - b[0]) })
		for i := 0; i < len(spans); i++ {
			run := spans[i]
			for i+1 < len(spans) && spans[i+1][0] <= run[1] {
				i++
				run[1] = max(run[1], spans[i][1])
			}
			if r.w-(min(run[1], r.x+r.w)-max(run[0], r.x)) <= Overhang {
				return name
			}
		}
	}
	return ""
}

// unsupported says why a part rests on nothing, pointing a part that goes in a cell at the nearest
// free one, and one that goes in a front or an inside at the nearest of those, so the model has a
// concrete fix.
func unsupported(slots []slot, occupant map[int]int, part *appv1.Part, r rect, self int) string {
	nearest, area := -1, -1
	var best, bestArea int64
	cellName := ""
	for c, s := range slots {
		if (s.kind == "front" || s.kind == "inside") && s.owner != self && slices.Contains(part.RestsOn, s.name) {
			dx, dy := int64(s.x-r.x), int64(s.y-r.y)
			if d := dx*dx + dy*dy; area < 0 || d < bestArea {
				area, bestArea = c, d
			}
		}
		if s.kind != "cell" || s.owner == self || !slices.Contains(part.RestsOn, s.name) {
			continue
		}
		cellName = s.name
		if _, taken := occupant[c]; taken {
			continue
		}
		dx, dy := int64(s.x-r.x), int64(s.y-r.y)
		if d := dx*dx + dy*dy; nearest < 0 || d < best {
			nearest, best = c, d
		}
	}
	switch {
	case nearest >= 0:
		s := slots[nearest]
		return fmt.Sprintf("%s does not fill a %s; nearest free %s is at x=%d, y=%d", describe(self, part), s.name, s.name, s.x, s.y)
	case cellName != "":
		return fmt.Sprintf("%s does not fill a %s, and every %s is taken", describe(self, part), cellName, cellName)
	case area >= 0:
		s := slots[area]
		return fmt.Sprintf("%s does not lie wholly inside a %s; it is %s, and the nearest %s is %s",
			describe(self, part), s.name, r, s.name, s.rect)
	default:
		return fmt.Sprintf("%s is not supported: its whole width must rest on %s", describe(self, part), strings.Join(part.RestsOn, " or "))
	}
}

func describe(i int, part *appv1.Part) string {
	return fmt.Sprintf("part %d (%s)", i, part.Name)
}

func partError(i int, message string) *appv1.LayoutError {
	return &appv1.LayoutError{Part: proto.Int32(int32(i)), Message: message}
}
