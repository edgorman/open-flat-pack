package firestore

import (
	"context"
	"errors"
	"testing"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

// Each repository is built with a nil collection, which panics on any Firestore call. Returning a
// clean validation error instead therefore proves the write was refused before the datastore was
// touched, rather than merely that it was refused.
func TestRepositoriesRejectInvalidEntitiesBeforeWriting(t *testing.T) {
	ctx := context.Background()

	t.Run("design create", func(t *testing.T) {
		_, err := (&DesignRepository{}).Create(ctx, entity.Design{Prompt: "x", Layout: entity.Layout{Parts: []entity.PlacedPart{{Article: "1"}}}})
		assertValidationError(t, err)
	})

	t.Run("user put", func(t *testing.T) {
		_, err := (&UserRepository{}).Put(ctx, entity.User{Username: "sly-dancing-monkey"})
		assertValidationError(t, err)
	})

	t.Run("user with no username", func(t *testing.T) {
		_, err := (&UserRepository{}).Put(ctx, entity.User{ID: "u1"})
		assertValidationError(t, err)
	})

	t.Run("user with a malformed username", func(t *testing.T) {
		_, err := (&UserRepository{}).Put(ctx, entity.User{ID: "u1", Username: "sly dancing monkey"})
		assertValidationError(t, err)
	})

	t.Run("user with a reserved username", func(t *testing.T) {
		_, err := (&UserRepository{}).Put(ctx, entity.User{ID: "u1", Username: "me"})
		assertValidationError(t, err)
	})
}

func assertValidationError(t *testing.T, err error) {
	t.Helper()

	var invalid entity.ValidationError
	if !errors.As(err, &invalid) {
		t.Fatalf("err = %v, want an entity.ValidationError", err)
	}
	if invalid.Field == "" {
		t.Error("ValidationError does not name a field")
	}
}

// A malformed id is a miss rather than a path Firestore is asked to parse, which it would answer
// by panicking rather than erroring.
func TestDesignRepositoryRefusesUnaddressableIDs(t *testing.T) {
	ctx := context.Background()
	designs := &DesignRepository{}

	for _, id := range []string{"", "a/b", ".."} {
		if _, err := designs.Get(ctx, id); !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Get(%q) = %v, want ErrNotFound", id, err)
		}
		if err := designs.Delete(ctx, id); !errors.Is(err, repository.ErrNotFound) {
			t.Errorf("Delete(%q) = %v, want ErrNotFound", id, err)
		}
	}
}
