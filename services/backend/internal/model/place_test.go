package model

import (
	"encoding/json"
	"strings"
	"testing"

	cat "github.com/edgorman/webapp-template/services/backend/internal/catalogue"
	"github.com/edgorman/webapp-template/services/backend/internal/feasibility"
)

// A media wall with a bookcase either side, doors, stacked KALLAX with inserts and a top over two
// BESTÅ frames, placed from the real catalogue and checked by the real validator.
func TestPlace(t *testing.T) {
	full, err := cat.Load()
	if err != nil {
		t.Fatal(err)
	}
	var a answer
	if err := json.Unmarshal([]byte(`{"plan": ["left bookcase", "TV bench", "right bookcase", "cubes", "sideboard"],
	 "parts": [
	  {"id": "left", "article": "40477340", "for": "left bookcase"},
	  {"article": "20528246", "on": "left", "for": "left bookcase"},
	  {"article": "20528246", "on": "left", "for": "left bookcase"},
	  {"article": "00477361", "on": "left", "for": "left bookcase"},
	  {"article": "70474062", "for": "TV bench"},
	  {"id": "right", "article": "40477340", "for": "right bookcase"},
	  {"id": "low", "article": "60275812", "for": "cubes"},
	  {"id": "high", "article": "60275812", "on": "low", "for": "cubes"},
	  {"article": "60278170", "on": "high", "cell": 3, "for": "cubes"},
	  {"article": "60278170", "on": "high", "for": "cubes"},
	  {"id": "b1", "article": "50245953", "for": "sideboard"},
	  {"article": "50245953", "for": "sideboard"},
	  {"article": "00597863", "on": "b1", "for": "sideboard"},
	  {"article": "00597863", "on": "b1", "for": "sideboard"}]}`), &a); err != nil {
		t.Fatal(err)
	}
	layout, problems := place(a, full)
	if len(problems) > 0 {
		t.Fatalf("problems = %v", problems)
	}
	if v := feasibility.Validate(layout, full); len(v.Errors) > 0 {
		t.Fatalf("errors = %v\nlayout = %v", v.Errors, layout)
	}
	// Bookcase, two doors side by side, bench to the right of the bookcase, the other bookcase after it.
	for i, want := range [][2]int32{{0, 0}, {0, 0}, {400, 0}, {0, 2020}, {800, 0}, {2600, 0}, {3400, 0}, {3400, 770}} {
		if got := layout.Parts[i]; got.X != want[0] || got.Y != want[1] {
			t.Errorf("part %d at (%d, %d), want (%d, %d)", i, got.X, got.Y, want[0], want[1])
		}
	}
	if layout.Parts[8].X == layout.Parts[9].X && layout.Parts[8].Y == layout.Parts[9].Y {
		t.Error("both inserts in one cube")
	}

	a.Plan = append(a.Plan, "desk")
	a.Parts[1].On = "nowhere"
	_, problems = place(a, full)
	if got := strings.Join(problems, "\n"); !strings.Contains(got, `no earlier part has that id`) || !strings.Contains(got, `"desk", but no part is for it`) {
		t.Errorf("problems = %v", problems)
	}
}
