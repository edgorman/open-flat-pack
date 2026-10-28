package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

// fakeDesignRepository is an in-memory repository.DesignRepository.
type fakeDesignRepository struct {
	designs map[string]entity.Design
	nextID  int
	// deleteOwnedErr, when set, fails the next DeleteOwned once.
	deleteOwnedErr error
}

func newFakeDesignRepository() *fakeDesignRepository {
	return &fakeDesignRepository{designs: make(map[string]entity.Design)}
}

func (r *fakeDesignRepository) seed(designs ...entity.Design) {
	for _, design := range designs {
		r.designs[design.ID] = design
	}
}

func (r *fakeDesignRepository) Get(_ context.Context, id string) (entity.Design, error) {
	design, ok := r.designs[id]
	if !ok {
		return entity.Design{}, repository.ErrNotFound
	}
	return design, nil
}

func (r *fakeDesignRepository) List(_ context.Context, params repository.ListParams) ([]entity.Design, bool, error) {
	limit := params.Limit
	if limit <= 0 {
		limit = len(r.designs) + 1
	}

	page := make([]entity.Design, 0, len(r.designs))
	for _, design := range r.designs {
		if params.StartAfter.IsZero() || design.CreatedAt.Before(params.StartAfter) {
			page = append(page, design)
		}
	}
	slices.SortFunc(page, func(a, b entity.Design) int { return b.CreatedAt.Compare(a.CreatedAt) })

	hasMore := len(page) > limit
	if hasMore {
		page = page[:limit]
	}
	return page, hasMore, nil
}

func (r *fakeDesignRepository) Create(_ context.Context, design entity.Design) (entity.Design, error) {
	if err := design.Validate(); err != nil {
		return entity.Design{}, err
	}
	r.nextID++
	design.ID = fmt.Sprintf("design%d", r.nextID)
	design.CreatedAt = time.Now().UTC()
	r.seed(design)
	return design, nil
}

func (r *fakeDesignRepository) Delete(_ context.Context, id string) error {
	if _, ok := r.designs[id]; !ok {
		return repository.ErrNotFound
	}
	delete(r.designs, id)
	return nil
}

func (r *fakeDesignRepository) DeleteOwned(_ context.Context, ownerID string) error {
	if err := r.deleteOwnedErr; err != nil {
		r.deleteOwnedErr = nil
		return err
	}
	for id, design := range r.designs {
		if design.OwnerID == ownerID {
			delete(r.designs, id)
		}
	}
	return nil
}

// wireDesign and wireDesignPage are what a response body actually carries, spelled out here rather
// than decoded into appv1.Design: reusing the production type would hide the wire, since both sides
// would move together and a field leaving the body would assert nothing. Declared separately, a
// rename fails here.
type wireDesign struct {
	ID             string `json:"id"`
	AuthorUsername string `json:"authorUsername"`
	Prompt         string `json:"prompt"`
	Layout         struct {
		Parts []struct {
			Article string `json:"article"`
			X       int32  `json:"x"`
			Y       int32  `json:"y"`
		} `json:"parts"`
	} `json:"layout"`
	ForkedFrom string   `json:"forkedFrom"`
	CreatedAt  string   `json:"createdAt"`
	Notes      []string `json:"notes"`
}

type wireDesignPage struct {
	Designs []wireDesign `json:"designs"`
	HasMore bool         `json:"hasMore"`
}

var buildableLayout = entity.Layout{Parts: []entity.PlacedPart{{Article: "80275887"}}}

// newDesignTestService seeds ann's profile and two designs of hers, a minute apart.
func newDesignTestService() (*Service, *fakeDesignRepository) {
	users := newFakeUserRepository()
	users.seed(entity.User{ID: "ann", Username: "sly-dancing-monkey"})
	s := newTestService(nil, users)
	designs := s.designs.(*fakeDesignRepository)
	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	designs.seed(
		entity.Design{ID: "old", OwnerID: "ann", Prompt: "a shelf", Layout: buildableLayout, CreatedAt: start},
		entity.Design{ID: "new", OwnerID: "ann", Prompt: "a shelf", Layout: buildableLayout, ForkedFrom: "old", CreatedAt: start.Add(time.Minute)},
	)
	return s, designs
}

func serve(s *Service, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

// signedIn sends req as the fake verifier's caller.
func signedIn(req *http.Request) *http.Request {
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Authorization-Provider", "google")
	return req
}

func TestListDesigns_PublicNewestFirstAndPaged(t *testing.T) {
	s, _ := newDesignTestService()

	rec := serve(s, httptest.NewRequest(http.MethodGet, "/designs?limit=1", nil))
	assertStatus(t, rec, http.StatusOK)
	first := decode[wireDesignPage](t, rec)
	if len(first.Designs) != 1 || first.Designs[0].ID != "new" || !first.HasMore {
		t.Fatalf("first page = %+v, want [new] with more", first)
	}
	if got := first.Designs[0]; got.AuthorUsername != "sly-dancing-monkey" || got.ForkedFrom != "old" || len(got.Layout.Parts) != 1 {
		t.Errorf("design = %+v, want ann's username, forkedFrom and the layout", got)
	}

	rec = serve(s, httptest.NewRequest(http.MethodGet, "/designs?limit=1&startAfter="+first.Designs[0].CreatedAt, nil))
	assertStatus(t, rec, http.StatusOK)
	if second := decode[wireDesignPage](t, rec); len(second.Designs) != 1 || second.Designs[0].ID != "old" || second.HasMore {
		t.Errorf("second page = %+v, want [old] and no more", second)
	}
}

func TestGetDesign(t *testing.T) {
	s, _ := newDesignTestService()

	rec := serve(s, httptest.NewRequest(http.MethodGet, "/designs/old", nil))
	assertStatus(t, rec, http.StatusOK)
	if got := decode[wireDesign](t, rec); got.ID != "old" || got.Prompt != "a shelf" || got.Notes == nil {
		t.Errorf("design = %+v, want old with its build notes", got)
	}

	assertStatus(t, serve(s, httptest.NewRequest(http.MethodGet, "/designs/missing", nil)), http.StatusNotFound)
}

func TestCreateDesign(t *testing.T) {
	post := func(s *Service, body string) *httptest.ResponseRecorder {
		return serve(s, signedIn(httptest.NewRequest(http.MethodPost, "/designs", strings.NewReader(body))))
	}

	t.Run("published as the caller's", func(t *testing.T) {
		s, designs := newDesignTestService()
		rec := post(s, `{"prompt":" a bookcase ","layout":`+validLayout+`,"forkedFrom":"old"}`)
		assertStatus(t, rec, http.StatusCreated)
		got := decode[wireDesign](t, rec)
		if got.Prompt != "a bookcase" || got.ForkedFrom != "old" {
			t.Errorf("design = %+v", got)
		}
		if stored := designs.designs[got.ID]; stored.OwnerID != "caller" {
			t.Errorf("stored owner = %q, want the caller", stored.OwnerID)
		}
	})

	t.Run("signed out", func(t *testing.T) {
		s, _ := newDesignTestService()
		rec := serve(s, httptest.NewRequest(http.MethodPost, "/designs", strings.NewReader(`{"prompt":"x","layout":`+validLayout+`}`)))
		assertStatus(t, rec, http.StatusUnauthorized)
	})

	for _, tt := range []struct {
		name, body string
		want       int
	}{
		{"no prompt", `{"layout":` + validLayout + `}`, http.StatusBadRequest},
		{"no layout", `{"prompt":"x"}`, http.StatusBadRequest},
		{"fork of nothing", `{"prompt":"x","layout":` + validLayout + `,"forkedFrom":"missing"}`, http.StatusBadRequest},
		{"unbuildable", `{"prompt":"x","layout":` + floatingFrame + `}`, http.StatusUnprocessableEntity},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s, designs := newDesignTestService()
			assertStatus(t, post(s, tt.body), tt.want)
			if len(designs.designs) != 2 {
				t.Error("a rejected design was stored")
			}
		})
	}
}

func TestDeleteDesign_OwnerOnly(t *testing.T) {
	s, designs := newDesignTestService()

	assertStatus(t, serve(s, signedIn(httptest.NewRequest(http.MethodDelete, "/designs/old", nil))), http.StatusForbidden)
	assertStatus(t, serve(s, signedIn(httptest.NewRequest(http.MethodDelete, "/designs/missing", nil))), http.StatusNotFound)

	designs.seed(entity.Design{ID: "mine", OwnerID: "caller", Prompt: "x", Layout: buildableLayout})
	assertStatus(t, serve(s, signedIn(httptest.NewRequest(http.MethodDelete, "/designs/mine", nil))), http.StatusNoContent)
	if _, ok := designs.designs["mine"]; ok {
		t.Error("design still present after delete")
	}
}

// There is no update route: a design never changes once published.
func TestDesigns_CannotBeUpdated(t *testing.T) {
	s, _ := newDesignTestService()
	rec := serve(s, signedIn(httptest.NewRequest(http.MethodPut, "/designs/old", strings.NewReader(`{}`))))
	assertStatus(t, rec, http.StatusMethodNotAllowed)
}

func TestDeleteUser_ErasesDesigns(t *testing.T) {
	s, designs := newDesignTestService()

	rec := httptest.NewRecorder()
	s.DeleteUser(rec, withUID(httptest.NewRequest(http.MethodDelete, "/users/me", nil), "ann"))
	assertStatus(t, rec, http.StatusNoContent)
	if len(designs.designs) != 0 {
		t.Errorf("designs left = %v, want none", designs.designs)
	}
}
