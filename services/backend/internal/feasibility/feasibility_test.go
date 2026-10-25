package feasibility

import (
	"slices"
	"strings"
	"testing"

	"google.golang.org/protobuf/proto"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

func cell(x, y int32) *appv1.Slot {
	return &appv1.Slot{Name: "cube", Kind: "cell", X: x, Y: y, W: 335, H: 335}
}

// A small catalogue in the real one's shape: a 2x2 frame, a 4x2 frame, an insert and legs.
var catalogue = &appv1.Catalogue{Parts: []*appv1.Part{
	{Article: "2x2", Name: "KALLAX shelving unit", Size: &appv1.Size{W: 770, H: 770}, RestsOn: []string{"floor", "top", "base"},
		Offers: []*appv1.Slot{cell(42, 42), cell(392, 42), cell(42, 392), cell(392, 392), {Name: "top", Kind: "surface", Y: 770, W: 770}}},
	{Article: "4x2", Name: "KALLAX shelving unit", Size: &appv1.Size{W: 1470, H: 770}, RestsOn: []string{"floor", "top", "base"},
		Offers: []*appv1.Slot{{Name: "top", Kind: "surface", Y: 770, W: 1470}}},
	{Article: "insert", Name: "KALLAX insert", Size: &appv1.Size{W: 330, H: 330}, RestsOn: []string{"cube"}},
	{Article: "legs", Name: "KALLAX legs", Size: &appv1.Size{W: 770, H: 100}, RestsOn: []string{"floor"},
		Offers: []*appv1.Slot{{Name: "base", Kind: "surface", Y: 100, W: 770}}},
}}

func at(article string, x, y int32) *appv1.LayoutPart {
	return &appv1.LayoutPart{Article: article, X: x, Y: y}
}

func TestValidate(t *testing.T) {
	for _, tt := range []struct {
		name   string
		limits *appv1.Limits
		parts  []*appv1.LayoutPart
		// Each want is a substring of one error, in order.
		want    []string
		stacked bool
	}{
		{name: "frame with an insert", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("insert", 392, 392)}},
		{name: "empty", want: []string{"no parts"}},
		{name: "unknown article", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("nope", 0, 0)},
			want: []string{`part 1: article "nope" is not in the catalogue`}},
		{name: "floating frame", parts: []*appv1.LayoutPart{at("2x2", 0, 10)},
			want: []string{"part 0 (KALLAX shelving unit) is not supported: its whole width must rest on floor or top or base"}},
		{name: "insert off its cell", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("insert", 50, 42)},
			want: []string{"part 1 (KALLAX insert) does not fill a cube; nearest free cube is at x=42, y=42"}},
		{name: "nearest cell skips taken ones", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("insert", 50, 42), at("insert", 42, 42)},
			want: []string{"nearest free cube is at x=392, y=42"}},
		{name: "insert with no frame", parts: []*appv1.LayoutPart{at("insert", 0, 0)},
			want: []string{"must rest on cube"}},
		{name: "two inserts in one cell", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("insert", 42, 42), at("insert", 42, 42)},
			want: []string{"part 2 (KALLAX insert) shares a cube with part 1"}},
		{name: "frame spanning two frames below", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("2x2", 770, 0), at("4x2", 0, 770)},
			stacked: true},
		{name: "overhang", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("4x2", 0, 770)},
			want: []string{"part 1 (KALLAX shelving unit) is not supported"}},
		{name: "legs under a stacked unit", parts: []*appv1.LayoutPart{at("legs", 0, 0), at("2x2", 0, 100), at("2x2", 0, 870)},
			stacked: true},
		{name: "frame on legs is not stacked", parts: []*appv1.LayoutPart{at("legs", 0, 0), at("2x2", 0, 100)}},
		{name: "legs on a frame", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("legs", 0, 770)},
			want: []string{"part 1 (KALLAX legs) is not supported"}},
		{name: "frames collide", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("2x2", 500, 0), at("insert", 42, 42)},
			want: []string{"part 1 (KALLAX shelving unit) overlaps part 0 (KALLAX shelving unit)"}},
		{name: "taller than 2.5 m", parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("2x2", 0, 770), at("2x2", 0, 1540), at("2x2", 0, 2310)},
			want: []string{"the design is 3080 mm tall; the limit is 2500 mm"}, stacked: true},
		{name: "prompt limit above 2.5 m", limits: &appv1.Limits{MaxHeight: proto.Int32(4000)},
			parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("2x2", 0, 770), at("2x2", 0, 1540), at("2x2", 0, 2310)},
			want:  []string{"the limit is 2500 mm"}, stacked: true},
		{name: "prompt height limit", limits: &appv1.Limits{MaxHeight: proto.Int32(700)}, parts: []*appv1.LayoutPart{at("2x2", 0, 0)},
			want: []string{"the design is 770 mm tall; the limit is 700 mm"}},
		{name: "prompt width limit", limits: &appv1.Limits{MaxWidth: proto.Int32(1000)}, parts: []*appv1.LayoutPart{at("2x2", 0, 0), at("2x2", 770, 0)},
			want: []string{"the design is 1540 mm wide; the limit is 1000 mm"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got := Validate(&appv1.Layout{Limits: tt.limits, Parts: tt.parts}, catalogue)
			if len(got.Errors) != len(tt.want) {
				t.Fatalf("errors = %v, want %d", got.Errors, len(tt.want))
			}
			for i, want := range tt.want {
				if !strings.Contains(got.Errors[i].Message, want) {
					t.Errorf("error %d = %q, want it to contain %q", i, got.Errors[i].Message, want)
				}
			}
			if stacked := slices.Contains(got.Notes, StackedNote); stacked != tt.stacked {
				t.Errorf("notes = %v, want stacked %v", got.Notes, tt.stacked)
			}
		})
	}
}

// An error about one part carries its index; one about the whole layout carries none.
func TestValidate_ErrorPart(t *testing.T) {
	got := Validate(&appv1.Layout{
		Limits: &appv1.Limits{MaxWidth: proto.Int32(100)},
		Parts:  []*appv1.LayoutPart{at("2x2", 0, 0), at("insert", 0, 0)},
	}, catalogue)
	if len(got.Errors) != 2 || got.Errors[0].GetPart() != 1 || got.Errors[1].Part != nil {
		t.Errorf("errors = %v", got.Errors)
	}
}
