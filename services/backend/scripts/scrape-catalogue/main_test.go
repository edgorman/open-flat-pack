package main

import (
	"slices"
	"testing"

	"google.golang.org/protobuf/proto"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

func TestSize(t *testing.T) {
	for measure, want := range map[string]*appv1.Size{
		"77x147 cm":    {W: 770, H: 1470},
		"33x38x33 cm":  {W: 330, D: 380, H: 330},
		"25x17x8.5 cm": {W: 250, D: 170, H: 85},
		"":             nil,
		"77x147 in":    nil,
		"33 cm":        nil,
	} {
		if got := size(measure); !proto.Equal(got, want) {
			t.Errorf("size(%q) = %v, want %v", measure, got, want)
		}
	}
}

func TestCells(t *testing.T) {
	for length, want := range map[int32][]int32{
		410:  {37},
		770:  {42, 392},
		1470: {42, 392, 742, 1092},
		1820: {42, 392, 742, 1092, 1442},
	} {
		if got := cells(length); !slices.Equal(got, want) {
			t.Errorf("cells(%d) = %v, want %v", length, got, want)
		}
	}
}

func TestSlots(t *testing.T) {
	for _, tt := range []struct {
		name    string
		size    *appv1.Size
		restsOn []string
		offers  []string
	}{
		{"BILLY bookcase", &appv1.Size{W: 800, H: 2020}, []string{"floor"}, []string{"billy_front", "billy_top"}},
		{"BILLY bookcase", &appv1.Size{W: 800, H: 1060}, []string{"floor"}, []string{"billy_front"}},
		{"BILLY height extension unit", &appv1.Size{W: 400, H: 350}, []string{"billy_top"}, []string{"billy_front"}},
		{"OXBERG glass door", &appv1.Size{W: 400, H: 1920}, []string{"billy_front"}, nil},
		{"KALLAX insert with door", &appv1.Size{W: 330, H: 330}, []string{"cube"}, nil},
		{"EKET cabinet", &appv1.Size{W: 350, H: 350}, []string{"floor", "eket_top"}, []string{"eket_top", "eket_front"}},
		{"EKET cabinet with 2 drawers", &appv1.Size{W: 700, H: 350}, []string{"floor", "eket_top"}, []string{"eket_top"}},
		{"EKET glass door", &appv1.Size{W: 310, H: 310}, []string{"eket_front"}, nil},
		{"IVAR cabinet with doors", &appv1.Size{W: 800, H: 830}, []string{"floor"}, nil},
		{"BESTÅ frame", &appv1.Size{W: 600, H: 1920}, []string{"floor", "besta_top"}, []string{"besta_front", "besta_top"}},
		{"BESTÅ tv bench", &appv1.Size{W: 1800, H: 640}, []string{"floor", "besta_top"}, []string{"besta_front", "besta_top"}},
		{"IVAR storage box on wheels", &appv1.Size{W: 780, H: 300}, nil, nil},
		{"BESTÅ top panel for tv", &appv1.Size{W: 1800, H: 20}, []string{"besta_top"}, nil},
		{"LAPPVIKEN door/drawer front", &appv1.Size{W: 600, H: 380}, []string{"besta_front"}, nil},
		{"BESTÅ shelf", &appv1.Size{W: 560, H: 360}, nil, nil},
		{"PAX wardrobe frame", &appv1.Size{W: 1000, H: 2360}, []string{"floor"}, []string{"pax_front", "pax_inside"}},
		{"KOMPLEMENT drawer with framed front", &appv1.Size{W: 960, H: 160}, []string{"pax_inside"}, nil},
		{"KOMPLEMENT divider for frames", &appv1.Size{W: 1000, H: 580}, nil, nil},
		{"TONSTAD door", &appv1.Size{W: 500, H: 2290}, []string{"pax_front"}, nil},
		{"KAMMARTORP mirror door", &appv1.Size{W: 500, H: 1950}, []string{"pax_front"}, nil},
		{"TONSTAD bookcase", &appv1.Size{W: 820, H: 2010}, nil, nil},
		{"BILLY corner fittings", &appv1.Size{W: 10, H: 10}, nil, nil},
	} {
		restsOn, offers := slots(tt.name, tt.size)
		var names []string
		for _, s := range offers {
			names = append(names, s.Name)
		}
		if !slices.Equal(restsOn, tt.restsOn) || !slices.Equal(names, tt.offers) {
			t.Errorf("slots(%q, %v) = %v, %v; want %v, %v", tt.name, tt.size, restsOn, names, tt.restsOn, tt.offers)
		}
	}
}
