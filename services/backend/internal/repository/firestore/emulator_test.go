package firestore

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	fs "cloud.google.com/go/firestore"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

// These tests run the adapters against the Firestore emulator, so the queries, transactions and
// collection-group reads are exercised by Firestore itself rather than by a fake's idea of it. They
// skip when FIRESTORE_EMULATOR_HOST is unset, which keeps `go test ./...` passing without one; CI
// starts one (see the `test` job in .github/workflows/pull-request.yaml). The emulator does not
// enforce composite indexes, so a missing index is still only caught in staging.

// newClient connects to the emulator under a project of the test's own: the emulator keeps each
// project's data apart, so no test sees another's documents and none needs cleaning up after.
func newClient(t *testing.T) *fs.Client {
	t.Helper()
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("FIRESTORE_EMULATOR_HOST is unset; see services/backend/README.md to run these")
	}
	client, err := fs.NewClient(context.Background(), fmt.Sprintf("test-%d", time.Now().UnixNano()))
	if err != nil {
		t.Fatalf("firestore client: %v", err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}

func TestEmulatorDesign(t *testing.T) {
	ctx := context.Background()
	designs := NewDesignRepository(newClient(t))
	layout := entity.Layout{Parts: []entity.PlacedPart{{Article: "80275887", X: 0, Y: 0}}}
	create := func(owner, prompt string) entity.Design {
		t.Helper()
		created, err := designs.Create(ctx, entity.Design{OwnerID: owner, Prompt: prompt, Layout: layout})
		if err != nil {
			t.Fatalf("Create(%s): %v", prompt, err)
		}
		return created
	}
	prompts := func(page []entity.Design) []string {
		out := make([]string, 0, len(page))
		for _, design := range page {
			out = append(out, design.Prompt)
		}
		return out
	}

	one := create("ann", "one")
	create("bob", "two")
	create("ann", "three")

	got, err := designs.Get(ctx, one.ID)
	if err != nil || got.OwnerID != "ann" || !slices.Equal(got.Layout.Parts, layout.Parts) {
		t.Fatalf("Get = %+v, %v; want the created design", got, err)
	}

	one.Prompt = "one, renamed"
	if err := designs.Update(ctx, one); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got, _ := designs.Get(ctx, one.ID); got.Prompt != one.Prompt || !got.CreatedAt.Equal(one.CreatedAt) {
		t.Fatalf("Get after Update = %+v, want the new prompt and the same createdAt", got)
	}
	one.Prompt = "one"
	if err := designs.Update(ctx, one); err != nil {
		t.Fatalf("Update back: %v", err)
	}

	first, hasMore, err := designs.List(ctx, repository.ListParams{Limit: 2})
	if err != nil || !slices.Equal(prompts(first), []string{"three", "two"}) || !hasMore {
		t.Fatalf("first page = %v (hasMore %v, err %v), want [three two] with more", prompts(first), hasMore, err)
	}
	second, hasMore, err := designs.List(ctx, repository.ListParams{Limit: 2, StartAfter: first[1].CreatedAt})
	if err != nil || !slices.Equal(prompts(second), []string{"one"}) || hasMore {
		t.Fatalf("second page = %v (hasMore %v, err %v), want [one] and no more", prompts(second), hasMore, err)
	}

	if err := designs.Delete(ctx, one.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := designs.Delete(ctx, one.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("repeated Delete = %v, want ErrNotFound", err)
	}
	if err := designs.DeleteOwned(ctx, "ann"); err != nil {
		t.Fatalf("DeleteOwned: %v", err)
	}
	left, _, err := designs.List(ctx, repository.ListParams{})
	if err != nil || !slices.Equal(prompts(left), []string{"two"}) {
		t.Errorf("List after deletes = %v, %v; want [two]", prompts(left), err)
	}
}

func TestEmulatorUser(t *testing.T) {
	ctx := context.Background()
	users := NewUserRepository(newClient(t))

	if _, err := users.Put(ctx, entity.User{ID: "ann", Username: "Ann"}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if _, err := users.Put(ctx, entity.User{ID: "bob", Username: "ann"}); !errors.Is(err, repository.ErrUsernameTaken) {
		t.Errorf("Put with a held username = %v, want ErrUsernameTaken", err)
	}

	got, err := users.GetByUsername(ctx, "ANN")
	if err != nil || got.ID != "ann" {
		t.Fatalf("GetByUsername = %+v, %v; want ann", got, err)
	}

	// A rename releases the old name for anybody to claim.
	if _, err := users.Put(ctx, entity.User{ID: "ann", Username: "annie", Bio: "hi"}); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if _, err := users.GetByUsername(ctx, "ann"); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("GetByUsername(old name) = %v, want ErrNotFound", err)
	}
	if _, err := users.Put(ctx, entity.User{ID: "bob", Username: "ann"}); err != nil {
		t.Errorf("Put claiming a released name = %v, want nil", err)
	}
	if got, err := users.Get(ctx, "ann"); err != nil || got.Username != "annie" || got.Bio != "hi" || got.CreatedAt.IsZero() {
		t.Errorf("Get = %+v, %v; want annie with a bio and a creation time", got, err)
	}

	if err := users.Delete(ctx, "ann"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := users.Get(ctx, "ann"); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("Get after Delete = %v, want ErrNotFound", err)
	}
	if _, err := users.GetByUsername(ctx, "annie"); !errors.Is(err, repository.ErrNotFound) {
		t.Errorf("GetByUsername after Delete = %v, want ErrNotFound", err)
	}
	if err := users.Delete(ctx, "ann"); err != nil {
		t.Errorf("repeated Delete = %v, want nil", err)
	}
}

func TestEmulatorModelCallCounter_Spend(t *testing.T) {
	ctx := context.Background()
	counter := NewModelCallCounter(newClient(t))

	for i, want := range []bool{true, true, false} {
		spent, err := counter.Spend(ctx, "2026-10-27", 2)
		if err != nil || spent != want {
			t.Fatalf("Spend #%d = %v, %v; want %v", i+1, spent, err, want)
		}
	}
	// A new day starts from zero.
	if spent, err := counter.Spend(ctx, "2026-10-28", 2); err != nil || !spent {
		t.Errorf("Spend on the next day = %v, %v", spent, err)
	}
}
