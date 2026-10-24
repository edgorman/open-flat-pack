package main

import (
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
