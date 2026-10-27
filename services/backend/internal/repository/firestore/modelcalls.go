package firestore

import (
	"context"

	fs "cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

// modelCallsDocument is one UTC day's count, keyed by the day.
type modelCallsDocument struct {
	Count int `firestore:"count"`
}

var _ repository.ModelCallCounter = (*ModelCallCounter)(nil)

// ModelCallCounter keeps one document per UTC day in the "modelCalls" collection.
type ModelCallCounter struct {
	client *fs.Client
}

func NewModelCallCounter(client *fs.Client) *ModelCallCounter {
	return &ModelCallCounter{client: client}
}

// Spend reads and bumps the day's count in one transaction, so concurrent requests can't both
// take the last call.
func (c *ModelCallCounter) Spend(ctx context.Context, day string, limit int) (bool, error) {
	ref := c.client.Collection("modelCalls").Doc(day)
	spent := false
	err := c.client.RunTransaction(ctx, func(ctx context.Context, tx *fs.Transaction) error {
		spent = false
		var stored modelCallsDocument
		doc, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if err := doc.DataTo(&stored); err != nil {
				return err
			}
		}
		if stored.Count >= limit {
			return nil
		}
		stored.Count++
		spent = true
		return tx.Set(ref, stored)
	})
	return spent, err
}
