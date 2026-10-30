package service

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/feasibility"
	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
	"github.com/edgorman/webapp-template/services/backend/internal/repository"
)

func layoutFromMessage(m *appv1.Layout) entity.Layout {
	layout := entity.Layout{Parts: make([]entity.PlacedPart, len(m.GetParts()))}
	if limits := m.GetLimits(); limits != nil {
		layout.MaxWidth, layout.MaxHeight = limits.MaxWidth, limits.MaxHeight
	}
	for i, part := range m.GetParts() {
		layout.Parts[i] = entity.PlacedPart{Article: part.Article, X: part.X, Y: part.Y}
	}
	return layout
}

func layoutMessage(layout entity.Layout) *appv1.Layout {
	m := &appv1.Layout{
		Limits: &appv1.Limits{MaxWidth: layout.MaxWidth, MaxHeight: layout.MaxHeight},
		Parts:  make([]*appv1.LayoutPart, len(layout.Parts)),
	}
	for i, part := range layout.Parts {
		m.Parts[i] = &appv1.LayoutPart{Article: part.Article, X: part.X, Y: part.Y}
	}
	return m
}

// designMessage is the wire shape of a design. Its build notes are worked out again from the
// catalogue rather than stored, which is cheap and keeps them in step with the catalogue.
func (s *Service) designMessage(design entity.Design, author string) *appv1.Design {
	layout := layoutMessage(design.Layout)
	return &appv1.Design{
		Id:             design.ID,
		AuthorUsername: author,
		Prompt:         design.Prompt,
		Layout:         layout,
		ForkedFrom:     design.ForkedFrom,
		CreatedAt:      timestamppb.New(design.CreatedAt),
		Notes:          feasibility.Validate(layout, s.catalogue).Notes,
	}
}

// writeDesign answers with a single design and its author.
func (s *Service) writeDesign(w http.ResponseWriter, r *http.Request, status int, design entity.Design) {
	authors, err := s.usernamesFor(r.Context(), []string{design.OwnerID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeProto(w, status, s.designMessage(design, authors[design.OwnerID]))
}

// requireDesignPermission loads the design the request addresses and checks the caller holds the
// named permission on it, writing the error response and returning false otherwise.
func (s *Service) requireDesignPermission(w http.ResponseWriter, r *http.Request, action entity.Action) (entity.Design, bool) {
	design, err := s.designs.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "design not found")
		return entity.Design{}, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return entity.Design{}, false
	}
	if !requirePermission(w, r, design.Permission(action)) {
		return entity.Design{}, false
	}
	return design, true
}

// listDefaultLimit is the page size a list route applies when a caller sends no `limit`.
const listDefaultLimit = 20

// parseListParams reads a list route's paging out of the query string: `limit` bounds the page and
// `startAfter` (an RFC3339 timestamp) continues one. A malformed one is a 400 rather than silently
// ignored.
func parseListParams(r *http.Request) (repository.ListParams, error) {
	query := r.URL.Query()
	params := repository.ListParams{Limit: listDefaultLimit}

	if raw := query.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			return repository.ListParams{}, errors.New("limit must be a positive integer")
		}
		params.Limit = limit
	}

	if raw := query.Get("startAfter"); raw != "" {
		startAfter, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return repository.ListParams{}, errors.New("startAfter must be an RFC3339 timestamp")
		}
		params.StartAfter = startAfter
	}

	return params, nil
}

// ListDesigns returns one page of designs, newest first.
func (s *Service) ListDesigns(w http.ResponseWriter, r *http.Request) {
	params, err := parseListParams(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	designs, hasMore, err := s.designs.List(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	uids := make([]string, 0, len(designs))
	for _, design := range designs {
		uids = append(uids, design.OwnerID)
	}
	authors, err := s.usernamesFor(r.Context(), uids)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	page := &appv1.DesignPage{Designs: make([]*appv1.Design, 0, len(designs)), HasMore: hasMore}
	for _, design := range designs {
		page.Designs = append(page.Designs, s.designMessage(design, authors[design.OwnerID]))
	}
	writeProto(w, http.StatusOK, page)
}

// GetDesign returns a single design.
func (s *Service) GetDesign(w http.ResponseWriter, r *http.Request) {
	design, ok := s.requireDesignPermission(w, r, entity.ActionRead)
	if !ok {
		return
	}
	s.writeDesign(w, r, http.StatusOK, design)
}

// CreateDesign publishes a layout as a new design owned by the caller. The layout is checked
// against the catalogue again, since the client could have sent any layout at all: an unbuildable
// one is a 422 carrying its Validation, as for POST /layouts.
func (s *Service) CreateDesign(w http.ResponseWriter, r *http.Request) {
	design := entity.Design{OwnerID: uidFromContext(r.Context())}
	if !requirePermission(w, r, design.Permission(entity.ActionCreate)) {
		return
	}

	var req appv1.CreateDesignRequest
	if !readProto(w, r, &req) {
		return
	}
	err := design.SetPrompt(req.Prompt)
	if err == nil {
		err = design.SetLayout(layoutFromMessage(req.Layout))
	}
	if err != nil {
		writeValidationError(w, err)
		return
	}

	// A fork must name a design that exists when it is published; it keeps the id if that design
	// is deleted later.
	if forkedFrom := strings.TrimSpace(req.ForkedFrom); forkedFrom != "" {
		_, err := s.designs.Get(r.Context(), forkedFrom)
		if errors.Is(err, repository.ErrNotFound) {
			writeError(w, http.StatusBadRequest, "forkedFrom: no such design")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		design.ForkedFrom = forkedFrom
	}

	if validation := feasibility.Validate(layoutMessage(design.Layout), s.catalogue); len(validation.Errors) > 0 {
		writeProto(w, http.StatusUnprocessableEntity, validation)
		return
	}

	created, err := s.designs.Create(r.Context(), design)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	s.writeDesign(w, r, http.StatusCreated, created)
}

// UpdateDesign replaces a design's prompt and layout. Only the owner may; the layout is checked
// again as for CreateDesign. Forks hold their own copy, so they are unchanged.
func (s *Service) UpdateDesign(w http.ResponseWriter, r *http.Request) {
	design, ok := s.requireDesignPermission(w, r, entity.ActionUpdate)
	if !ok {
		return
	}

	var req appv1.UpdateDesignRequest
	if !readProto(w, r, &req) {
		return
	}
	err := design.SetPrompt(req.Prompt)
	if err == nil {
		err = design.SetLayout(layoutFromMessage(req.Layout))
	}
	if err != nil {
		writeValidationError(w, err)
		return
	}

	if validation := feasibility.Validate(layoutMessage(design.Layout), s.catalogue); len(validation.Errors) > 0 {
		writeProto(w, http.StatusUnprocessableEntity, validation)
		return
	}

	err = s.designs.Update(r.Context(), design)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "design not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	s.writeDesign(w, r, http.StatusOK, design)
}

// DeleteDesign removes a design. Only the owner may delete it; forks of it keep their forkedFrom.
func (s *Service) DeleteDesign(w http.ResponseWriter, r *http.Request) {
	design, ok := s.requireDesignPermission(w, r, entity.ActionDelete)
	if !ok {
		return
	}

	if err := s.designs.Delete(r.Context(), design.ID); err != nil && !errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
