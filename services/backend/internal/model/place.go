package model

import (
	"fmt"
	"slices"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

// answer is what the model writes: a plan of what the request needs, and parts that say what they
// stand on rather than where they are. place turns it into a layout, so the model never does the
// arithmetic.
type answer struct {
	Limits struct {
		MaxWidth  *int32 `json:"max_width"`
		MaxHeight *int32 `json:"max_height"`
	} `json:"limits"`
	Plan  []string `json:"plan"`
	Parts []struct {
		ID      string `json:"id"`
		Article string `json:"article"`
		For     string `json:"for"`
		// On is the id of an earlier part this one sits in or on. Empty means the floor.
		On string `json:"on"`
		// Cell picks a cell of On's by index, bottom row first, left to right. Unset means the next
		// free one.
		Cell *int `json:"cell"`
		// X and Y keep a part of the layout being changed where it is.
		X *int32 `json:"x"`
		Y *int32 `json:"y"`
	} `json:"parts"`
}

// place lays out a's parts in order. Floor parts stand side by side, left to right. A part on
// another takes the first slot of that part's it can rest on: a cell by index, a surface or a
// front or inside filled left to right and then upwards, row by row. It returns the problems that
// stop it, such as a plan item with no part, for the model to fix.
//
// ponytail: no gaps between floor parts and none inside a front, and a part on a surface starts at
// its host's left edge; add an offset field when designs need one.
func place(a answer, catalogue *appv1.Catalogue) (*appv1.Layout, []string) {
	byArticle := map[string]*appv1.Part{}
	for _, part := range catalogue.GetParts() {
		byArticle[part.Article] = part
	}
	type fill struct{ x, y, row int32 }
	var problems []string
	layout := &appv1.Layout{Limits: &appv1.Limits{MaxWidth: a.Limits.MaxWidth, MaxHeight: a.Limits.MaxHeight}}
	index := map[string]int{}  // part id -> index in layout.Parts
	used := map[[2]int]*fill{} // (host, offer) -> what's filled so far
	taken := map[[2]int]bool{} // (host, offer) cells in use
	var floor int32            // right edge of the floor run
	planned := map[string]bool{}
	for i, p := range a.Parts {
		placed := &appv1.LayoutPart{Article: p.Article}
		layout.Parts = append(layout.Parts, placed)
		if p.ID != "" {
			index[p.ID] = i
		}
		planned[p.For] = true
		part := byArticle[p.Article]
		if part == nil {
			continue // validation names it
		}
		size := part.GetSize()
		switch {
		case p.X != nil && p.Y != nil:
			placed.X, placed.Y = *p.X, *p.Y
		case p.On == "":
			placed.X = floor
		default:
			h, ok := index[p.On]
			if !ok {
				problems = append(problems, fmt.Sprintf("part %d (%s) is on %q, but no earlier part has that id", i, part.Name, p.On))
				continue
			}
			hostPart, host := byArticle[a.Parts[h].Article], layout.Parts[h]
			o := slices.IndexFunc(hostPart.GetOffers(), func(s *appv1.Slot) bool { return slices.Contains(part.RestsOn, s.Name) })
			if o < 0 {
				problems = append(problems, fmt.Sprintf("part %d (%s) can't go on part %d (%s): it rests on %v, which that part doesn't offer",
					i, part.Name, h, hostPart.GetName(), part.RestsOn))
				continue
			}
			s := hostPart.Offers[o]
			x, y := host.X+s.X, host.Y+s.Y
			switch s.Kind {
			case "cell":
				var cells []int
				for c, other := range hostPart.Offers {
					if other.Name == s.Name {
						cells = append(cells, c)
					}
				}
				n := slices.IndexFunc(cells, func(c int) bool { return !taken[[2]int{h, c}] })
				if p.Cell != nil {
					n = *p.Cell
				}
				if n < 0 || n >= len(cells) {
					problems = append(problems, fmt.Sprintf("part %d (%s) needs a free %s on part %d, which has %d", i, part.Name, s.Name, h, len(cells)))
					continue
				}
				taken[[2]int{h, cells[n]}] = true
				c := hostPart.Offers[cells[n]]
				x, y = host.X+c.X, host.Y+c.Y
			case "surface":
				f := used[[2]int{h, o}]
				if f == nil {
					f = &fill{}
					used[[2]int{h, o}] = f
				}
				x += f.x
				f.x += size.GetW()
			default: // front, inside
				f := used[[2]int{h, o}]
				if f == nil {
					f = &fill{}
					used[[2]int{h, o}] = f
				}
				if f.x > 0 && f.x+size.GetW() > s.W {
					f.x, f.y, f.row = 0, f.y+f.row, 0
				}
				x, y = x+f.x, y+f.y
				f.x += size.GetW()
				f.row = max(f.row, size.GetH())
			}
			placed.X, placed.Y = x, y
		}
		if placed.Y == 0 {
			floor = max(floor, placed.X+size.GetW())
		}
	}
	for _, item := range a.Plan {
		if !planned[item] {
			problems = append(problems, fmt.Sprintf("the plan has %q, but no part is for it", item))
		}
	}
	return layout, problems
}
