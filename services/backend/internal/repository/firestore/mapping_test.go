package firestore

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
)

var (
	created = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	updated = time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
)

// An id arrives in a URL and becomes a document key, so anything that could address more than
// one document, or that Firestore refuses as a key, has to be refused before it is asked.
func TestIDPattern(t *testing.T) {
	for _, id := range []string{"Ab3dEf6hIj9lMn2pQr5t", "a"} {
		if !idPattern.MatchString(id) {
			t.Errorf("%q refused, want it admitted", id)
		}
	}
	for _, id := range []string{"", ".", "..", "a/b", "__x__", "has space", strings.Repeat("a", 65)} {
		if idPattern.MatchString(id) {
			t.Errorf("%q admitted, want it refused", id)
		}
	}
}

func TestUserMappingRoundTrip(t *testing.T) {
	user := entity.User{
		ID:        "user-1",
		Username:  "sly-dancing-monkey",
		Bio:       "hello",
		CreatedAt: created,
		UpdatedAt: updated,
	}

	got := userToDocument(user).toEntity(user.ID)

	if !reflect.DeepEqual(got, user) {
		t.Errorf("round trip = %+v, want %+v", got, user)
	}
}

// An id is its document key, so storing it in the body too would duplicate it.
func TestUserDocumentExcludesID(t *testing.T) {
	if _, ok := reflect.TypeOf(userToDocument(entity.User{ID: "user-1"})).FieldByName("ID"); ok {
		t.Error("user document type has an ID field, which would duplicate the document key")
	}
}

// A field added to entity.Design but not to the mapping would silently stop being persisted, so
// the round trip is asserted whole rather than field by field.
func TestDesignMappingRoundTrip(t *testing.T) {
	width := int32(1500)
	design := entity.Design{
		ID:         "abc123",
		OwnerID:    "owner",
		Prompt:     "a bookcase",
		Layout:     entity.Layout{MaxWidth: &width, Parts: []entity.PlacedPart{{Article: "80275887", X: 10, Y: 20}}},
		ForkedFrom: "def456",
		CreatedAt:  created,
	}

	got := designToDocument(design).toEntity(design.ID)

	if !reflect.DeepEqual(got, design) {
		t.Errorf("round trip = %+v, want %+v", got, design)
	}
}

func TestDesignDocumentExcludesID(t *testing.T) {
	if _, ok := reflect.TypeOf(designToDocument(entity.Design{ID: "d1"})).FieldByName("ID"); ok {
		t.Error("design document type has an ID field, which would duplicate the document key")
	}
}
