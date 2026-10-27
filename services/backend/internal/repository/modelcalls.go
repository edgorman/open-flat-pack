package repository

import "context"

// ModelCallCounter counts model calls per UTC day. It is the hard cap on model spend, since
// Google Cloud budgets only alert.
type ModelCallCounter interface {
	// Spend counts one call against day (YYYY-MM-DD, UTC), unless limit calls have already been
	// counted that day, in which case it counts nothing and reports false.
	Spend(ctx context.Context, day string, limit int) (bool, error)
}
