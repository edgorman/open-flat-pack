package firestore

import (
	"context"
	"time"

	fs "cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

// designDocument is the stored shape of a design. The id is the document key, so it is not
// stored in the body.
type designDocument struct {
	OwnerID    string         `firestore:"ownerId"`
	Prompt     string         `firestore:"prompt"`
	Layout     layoutDocument `firestore:"layout"`
	ForkedFrom string         `firestore:"forkedFrom"`
	CreatedAt  time.Time      `firestore:"createdAt"`
}

type layoutDocument struct {
	MaxWidth  *int32         `firestore:"maxWidth"`
	MaxHeight *int32         `firestore:"maxHeight"`
	Parts     []partDocument `firestore:"parts"`
}

type partDocument struct {
	Article string `firestore:"article"`
	X       int32  `firestore:"x"`
	Y       int32  `firestore:"y"`
}

func designToDocument(design entity.Design) designDocument {
	parts := make([]partDocument, len(design.Layout.Parts))
	for i, part := range design.Layout.Parts {
		parts[i] = partDocument{Article: part.Article, X: part.X, Y: part.Y}
	}
	return designDocument{
		OwnerID: design.OwnerID,
		Prompt:  design.Prompt,
		Layout: layoutDocument{
			MaxWidth:  design.Layout.MaxWidth,
			MaxHeight: design.Layout.MaxHeight,
			Parts:     parts,
		},
		ForkedFrom: design.ForkedFrom,
		CreatedAt:  design.CreatedAt,
	}
}

// toEntity rebuilds a design from its stored fields; id is the document key.
func (d designDocument) toEntity(id string) entity.Design {
	parts := make([]entity.PlacedPart, len(d.Layout.Parts))
	for i, part := range d.Layout.Parts {
		parts[i] = entity.PlacedPart{Article: part.Article, X: part.X, Y: part.Y}
	}
	return entity.Design{
		ID:      id,
		OwnerID: d.OwnerID,
		Prompt:  d.Prompt,
		Layout: entity.Layout{
			MaxWidth:  d.Layout.MaxWidth,
			MaxHeight: d.Layout.MaxHeight,
			Parts:     parts,
		},
		ForkedFrom: d.ForkedFrom,
		CreatedAt:  d.CreatedAt,
	}
}

func documentToDesign(doc *fs.DocumentSnapshot) (entity.Design, error) {
	var stored designDocument
	if err := doc.DataTo(&stored); err != nil {
		return entity.Design{}, err
	}
	return stored.toEntity(doc.Ref.ID), nil
}

var _ repository.DesignRepository = (*DesignRepository)(nil)

type DesignRepository struct {
	client  *fs.Client
	designs *fs.CollectionRef
}

// NewDesignRepository returns a repository.DesignRepository backed by the "designs" collection.
func NewDesignRepository(client *fs.Client) *DesignRepository {
	return &DesignRepository{client: client, designs: client.Collection("designs")}
}

func (r *DesignRepository) Get(ctx context.Context, id string) (entity.Design, error) {
	if !idPattern.MatchString(id) {
		return entity.Design{}, repository.ErrNotFound
	}

	doc, err := r.designs.Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return entity.Design{}, repository.ErrNotFound
	}
	if err != nil {
		return entity.Design{}, err
	}
	return documentToDesign(doc)
}

// maxDesignListPageSize is the largest page List ever returns, whatever a caller asks for.
const maxDesignListPageSize = 50

// List orders the whole collection by createdAt, which Firestore's single-field index serves, and
// asks for one more than the page holds: its presence is what hasMore reports.
func (r *DesignRepository) List(ctx context.Context, params repository.ListParams) ([]entity.Design, bool, error) {
	limit := params.Limit
	if limit <= 0 || limit > maxDesignListPageSize {
		limit = maxDesignListPageSize
	}

	query := r.designs.OrderBy("createdAt", fs.Desc).Limit(limit + 1)
	if !params.StartAfter.IsZero() {
		query = query.StartAfter(params.StartAfter)
	}

	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, false, err
	}

	hasMore := len(docs) > limit
	if hasMore {
		docs = docs[:limit]
	}
	designs := make([]entity.Design, 0, len(docs))
	for _, doc := range docs {
		design, err := documentToDesign(doc)
		if err != nil {
			return nil, false, err
		}
		designs = append(designs, design)
	}
	return designs, hasMore, nil
}

func (r *DesignRepository) Create(ctx context.Context, design entity.Design) (entity.Design, error) {
	if err := design.Validate(); err != nil {
		return entity.Design{}, err
	}

	design.CreatedAt = time.Now().UTC()
	doc := r.designs.NewDoc()
	if _, err := doc.Create(ctx, designToDocument(design)); err != nil {
		return entity.Design{}, err
	}
	design.ID = doc.ID
	return design, nil
}

func (r *DesignRepository) Delete(ctx context.Context, id string) error {
	if !idPattern.MatchString(id) {
		return repository.ErrNotFound
	}

	_, err := r.designs.Doc(id).Delete(ctx, fs.Exists)
	if status.Code(err) == codes.NotFound {
		return repository.ErrNotFound
	}
	return err
}

func (r *DesignRepository) DeleteOwned(ctx context.Context, ownerID string) error {
	docs, err := r.designs.Where("ownerId", "==", ownerID).Select().Documents(ctx).GetAll()
	if err != nil {
		return err
	}
	refs := make([]*fs.DocumentRef, 0, len(docs))
	for _, doc := range docs {
		refs = append(refs, doc.Ref)
	}
	return deleteAll(ctx, r.client, refs)
}
