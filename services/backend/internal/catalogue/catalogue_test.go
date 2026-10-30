package catalogue

import (
	"slices"
	"strings"
	"testing"
)

// The embedded file is what ships, so it must pass the same checks startup applies.
func TestLoad(t *testing.T) {
	catalogue, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(catalogue.Parts) == 0 {
		t.Error("catalogue has no parts")
	}
}

// A door or an interior part must fit at least one front or inside it names, or no layout can hold it.
func TestLoad_AreaPartsFit(t *testing.T) {
	catalogue, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	type area struct{ w, h int32 }
	areas := map[string][]area{}
	for _, part := range catalogue.Parts {
		for _, s := range part.Offers {
			if s.Kind == "front" || s.Kind == "inside" {
				areas[s.Name] = append(areas[s.Name], area{s.W, s.H})
			}
		}
	}
	for _, part := range catalogue.Parts {
		for _, name := range part.RestsOn {
			if areas[name] == nil {
				continue
			}
			if !slices.ContainsFunc(areas[name], func(a area) bool { return part.Size.W <= a.w && part.Size.H <= a.h }) {
				t.Errorf("%s (%s) is %dx%d mm and fits no %s", part.Article, part.Name, part.Size.W, part.Size.H, name)
			}
		}
	}
}

func TestParse_RejectsMalformed(t *testing.T) {
	for _, tt := range []struct {
		name, json, want string
	}{
		{"duplicate article", `{"parts":[{"article":"1"},{"article":"1"}]}`, "duplicate article"},
		{"unknown rests_on", `{"parts":[{"article":"1","rests_on":["shelf"]}]}`, "no part offers"},
		{"slot outside part", `{"parts":[{"article":"1","size":{"w":100,"h":100},
			"offers":[{"name":"cube","kind":"cell","x":50,"y":0,"w":60,"h":10}]}]}`, "outside the part"},
		{"unknown slot kind", `{"parts":[{"article":"1","size":{"w":100,"h":100},
			"offers":[{"name":"cube","kind":"shelf","w":10,"h":10}]}]}`, "unknown kind"},
		{"unknown field", `{"parts":[{"article":"1","colour":"red"}]}`, "unknown field"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parse([]byte(tt.json))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("parse() error = %v, want one containing %q", err, tt.want)
			}
		})
	}
}

// A part may rest on a slot another part offers, or on the built-in floor.
func TestParse_AcceptsOfferedSlots(t *testing.T) {
	_, err := parse([]byte(`{"parts":[
		{"article":"1","size":{"w":100,"h":100},"rests_on":["floor"],
			"offers":[{"name":"cube","kind":"cell","w":100,"h":100}]},
		{"article":"2","rests_on":["cube"]}]}`))
	if err != nil {
		t.Fatal(err)
	}
}
