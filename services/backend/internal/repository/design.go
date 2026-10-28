package repository

import (
	"context"
	"time"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
)

// ListParams bounds one page of DesignRepository.List.
type ListParams struct {
	// Limit caps how many designs a page holds. A repository is free to treat a non-positive or
	// out-of-range value as its own default rather than erroring, since this is a page size, not a
	// caller-facing validation.
	Limit int
	// StartAfter, when non-zero, excludes every design at or after this createdAt - continuing a
	// feed a caller has already seen a page of. A caller sets it to the createdAt of the last design
	// its previous page held.
	StartAfter time.Time
}

// DesignRepository persists designs. Every design is public, so nothing here filters by caller,
// and none is ever updated.
type DesignRepository interface {
	// Get returns ErrNotFound if no design holds id, including an id that could not be a key at all.
	Get(ctx context.Context, id string) (entity.Design, error)
	// List returns one page of designs, newest first, and reports whether a further page follows.
	List(ctx context.Context, params ListParams) (designs []entity.Design, hasMore bool, err error)
	// Create writes a new design under an id the repository assigns, stamping its creation time. It
	// rejects a design that fails entity.Design.Validate without writing anything.
	Create(ctx context.Context, design entity.Design) (entity.Design, error)
	// Delete removes the design at id, returning ErrNotFound if there is none.
	Delete(ctx context.Context, id string) error
	// DeleteOwned removes every design ownerID holds. It is for erasing an account.
	DeleteOwned(ctx context.Context, ownerID string) error
}
