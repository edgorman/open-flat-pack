package catalogue

import (
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
