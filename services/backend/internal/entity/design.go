package entity

import (
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MaxPromptLength = 2000
	MaxLayoutParts  = 200
)

// Design is a published layout. Every design is public and none ever changes once published:
// changing one, your own included, publishes a fork. Whether the layout can be built is checked
// against the catalogue by internal/feasibility, not here.
//
// ID is assigned by the repository at creation and never changes.
type Design struct {
	ID         string
	OwnerID    string
	Prompt     string
	Layout     Layout
	ForkedFrom string
	CreatedAt  time.Time
}

// Layout is which catalogue parts go where, in mm (see docs/design/v1/0003-prompting.md).
// MaxWidth and MaxHeight are nil where the prompt gave no limit.
type Layout struct {
	MaxWidth  *int32
	MaxHeight *int32
	Parts     []PlacedPart
}

// PlacedPart is one catalogue part with its bottom-left corner at X, Y.
type PlacedPart struct {
	Article string
	X, Y    int32
}

// SetPrompt trims and validates the prompt the design was made from.
func (d *Design) SetPrompt(prompt string) error {
	trimmed := strings.TrimSpace(prompt)
	if trimmed == "" {
		return ValidationError{Field: "prompt", Message: "is required"}
	}
	if utf8.RuneCountInString(trimmed) > MaxPromptLength {
		return ValidationError{Field: "prompt", Message: lengthMessage(MaxPromptLength)}
	}

	d.Prompt = trimmed
	return nil
}

// SetLayout bounds how many parts a layout holds; whether they fit together is feasibility's job.
func (d *Design) SetLayout(layout Layout) error {
	if len(layout.Parts) == 0 {
		return ValidationError{Field: "layout", Message: "has no parts"}
	}
	if len(layout.Parts) > MaxLayoutParts {
		return ValidationError{Field: "layout", Message: "has too many parts"}
	}

	d.Layout = layout
	return nil
}

// Validate reports whether the design is in a storable state: the server-set owner is present,
// and the prompt and layout hold values the setters above would accept.
func (d Design) Validate() error {
	if d.OwnerID == "" {
		return ValidationError{Field: "ownerId", Message: "is required"}
	}

	candidate := d
	if err := candidate.SetPrompt(d.Prompt); err != nil {
		return err
	}
	return candidate.SetLayout(d.Layout)
}

// Permission is who may do what to a design: anybody reads it, and creating or deleting it is
// the owner's alone.
func (d Design) Permission(action Action) Permission {
	permission := PermissionFor(ResourceDesign, action)
	permission.OwnerID = d.OwnerID
	return permission
}
