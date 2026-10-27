package entity

import (
	"errors"
	"strings"
	"testing"
)

func TestDesign_SetPrompt(t *testing.T) {
	var design Design
	if err := design.SetPrompt("  a bookcase  "); err != nil || design.Prompt != "a bookcase" {
		t.Fatalf("SetPrompt = %v, prompt %q; want it trimmed and applied", err, design.Prompt)
	}

	for _, prompt := range []string{"", "   ", strings.Repeat("a", MaxPromptLength+1)} {
		var invalid ValidationError
		if err := design.SetPrompt(prompt); !errors.As(err, &invalid) {
			t.Errorf("SetPrompt(%d chars) = %v, want a ValidationError", len(prompt), err)
		}
	}
	if design.Prompt != "a bookcase" {
		t.Errorf("Prompt = %q, want rejected values not applied", design.Prompt)
	}
}

func TestDesign_SetLayout(t *testing.T) {
	var design Design
	for _, parts := range [][]PlacedPart{nil, make([]PlacedPart, MaxLayoutParts+1)} {
		var invalid ValidationError
		if err := design.SetLayout(Layout{Parts: parts}); !errors.As(err, &invalid) {
			t.Errorf("SetLayout(%d parts) = %v, want a ValidationError", len(parts), err)
		}
	}
	if err := design.SetLayout(Layout{Parts: []PlacedPart{{Article: "1"}}}); err != nil {
		t.Errorf("SetLayout(1 part) = %v, want no error", err)
	}
}

func TestDesign_Validate(t *testing.T) {
	valid := Design{OwnerID: "ann", Prompt: "x", Layout: Layout{Parts: []PlacedPart{{Article: "1"}}}}
	if err := valid.Validate(); err != nil {
		t.Fatalf("Validate = %v, want no error", err)
	}

	noOwner := valid
	noOwner.OwnerID = ""
	if err := noOwner.Validate(); err == nil {
		t.Error("Validate with no owner = nil, want an error")
	}
}

// Anybody reads a design; only its owner deletes it, and nobody updates one.
func TestDesign_Permission(t *testing.T) {
	design := Design{OwnerID: "ann"}
	for _, tt := range []struct {
		action Action
		uid    string
		want   bool
	}{
		{ActionRead, "", true},
		{ActionRead, "bob", true},
		{ActionCreate, "ann", true},
		{ActionCreate, "", false},
		{ActionDelete, "ann", true},
		{ActionDelete, "bob", false},
		{ActionUpdate, "ann", false},
	} {
		if got := design.Permission(tt.action).Allows(tt.uid); got != tt.want {
			t.Errorf("%s by %q = %v, want %v", tt.action, tt.uid, got, tt.want)
		}
	}
}
