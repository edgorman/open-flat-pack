// Package catalogue holds the parts catalogue: one hand-curated JSON file, embedded in the binary
// so it only changes on deploy. See docs/design/v1/0002-catalogue.md.
package catalogue

import (
	_ "embed"
	"fmt"

	"google.golang.org/protobuf/encoding/protojson"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

//go:embed catalogue.json
var file []byte

// Load parses and checks the embedded catalogue. cmd/backend calls it at startup, so a malformed
// file stops the process before it serves anything rather than surfacing in a later request.
func Load() (*appv1.Catalogue, error) {
	return parse(file)
}

func parse(data []byte) (*appv1.Catalogue, error) {
	// Strict, unlike request bodies: an unknown field here is a typo in a file we wrote, not a
	// client from another release.
	var catalogue appv1.Catalogue
	if err := protojson.Unmarshal(data, &catalogue); err != nil {
		return nil, fmt.Errorf("catalogue: %w", err)
	}

	articles := map[string]bool{}
	slots := map[string]bool{"floor": true}
	for _, part := range catalogue.Parts {
		if articles[part.Article] {
			return nil, fmt.Errorf("catalogue: duplicate article %q", part.Article)
		}
		articles[part.Article] = true

		size := part.GetSize()
		for _, slot := range part.Offers {
			if slot.Kind != "cell" && slot.Kind != "surface" {
				return nil, fmt.Errorf("catalogue: %s slot %q has unknown kind %q", part.Article, slot.Name, slot.Kind)
			}
			if slot.X < 0 || slot.Y < 0 || slot.W < 0 || slot.H < 0 ||
				slot.X+slot.W > size.GetW() || slot.Y+slot.H > size.GetH() {
				return nil, fmt.Errorf("catalogue: %s slot %q lies outside the part", part.Article, slot.Name)
			}
			slots[slot.Name] = true
		}
	}
	for _, part := range catalogue.Parts {
		for _, name := range part.RestsOn {
			if !slots[name] {
				return nil, fmt.Errorf("catalogue: %s rests on %q, which no part offers", part.Article, name)
			}
		}
	}
	return &catalogue, nil
}
