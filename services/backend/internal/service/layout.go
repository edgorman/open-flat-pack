package service

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
	"github.com/edgorman/webapp-template/services/backend/internal/feasibility"
	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
	"github.com/edgorman/webapp-template/services/backend/internal/model"
)

const (
	// layoutRetries is how many times a failed layout goes back to the model before the caller
	// gets the remaining errors.
	layoutRetries = 2
	// layoutWriteTimeout replaces the server's 30 s write timeout for this route, which can make
	// three model calls in a row.
	layoutWriteTimeout = 3 * time.Minute
)

// CreateLayout turns a prompt into a buildable layout: one model call, validated, with the errors
// sent back to the model up to layoutRetries times. Nothing is stored. See
// docs/design/v1/0003-prompting.md.
func (s *Service) CreateLayout(w http.ResponseWriter, r *http.Request) {
	permission := entity.PermissionFor(entity.ResourceLayout, entity.ActionCreate)
	permission.OwnerID = uidFromContext(r.Context())
	if !requirePermission(w, r, permission) {
		return
	}

	var req appv1.CreateLayoutRequest
	if !readProto(w, r, &req) {
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	switch {
	case prompt == "":
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	case utf8.RuneCountInString(prompt) > entity.MaxPromptLength:
		writeError(w, http.StatusBadRequest, "prompt is too long")
		return
	case len(req.BaseLayout.GetParts()) > entity.MaxLayoutParts:
		writeError(w, http.StatusBadRequest, "baseLayout has too many parts")
		return
	}
	if s.chat == nil {
		writeError(w, http.StatusServiceUnavailable, "designing is not configured")
		return
	}

	// Best effort: a recorder in tests doesn't support it, and the default timeout still applies.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(layoutWriteTimeout))

	conversation, err := model.Start(s.chat, s.catalogue, prompt, req.BaseLayout)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	var validation *appv1.Validation
	for attempt := range layoutRetries + 1 {
		spent, err := s.modelCalls.Spend(r.Context(), time.Now().UTC().Format(time.DateOnly), s.cfg.ModelDailyCallLimit)
		if err != nil {
			s.logger().Error("counting a model call failed", "error", err)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !spent {
			writeError(w, http.StatusServiceUnavailable, "today's design limit is reached, try again after midnight UTC")
			return
		}

		layout, err := conversation.Next(r.Context())
		if errors.Is(err, model.ErrUnparseable) {
			validation = &appv1.Validation{Errors: []*appv1.LayoutError{{Message: err.Error()}}}
			s.logger().Info("layout attempt failed", "attempt", attempt, "errors", []string{err.Error()})
			conversation.Reject([]string{err.Error()})
			continue
		}
		if err != nil {
			s.logger().Error("model call failed", "error", err)
			writeError(w, http.StatusBadGateway, "the design model is unavailable, try again later")
			return
		}

		validation = feasibility.Validate(layout, s.catalogue)
		if len(validation.Errors) == 0 {
			writeProto(w, http.StatusOK, &appv1.CreateLayoutResponse{Layout: layout, Validation: validation})
			return
		}
		problems := make([]string, len(validation.Errors))
		for i, e := range validation.Errors {
			problems[i] = e.Message
		}
		s.logger().Info("layout attempt failed", "attempt", attempt, "errors", problems)
		conversation.Reject(problems)
	}
	writeProto(w, http.StatusUnprocessableEntity, validation)
}

// CheckLayout validates a layout the caller edited by hand, answering 200 with its Validation
// whether or not it is buildable. It calls no model and stores nothing, so it needs no sign-in.
func (s *Service) CheckLayout(w http.ResponseWriter, r *http.Request) {
	if !requirePermission(w, r, entity.PermissionFor(entity.ResourceLayout, entity.ActionRead)) {
		return
	}
	var layout appv1.Layout
	if !readProto(w, r, &layout) {
		return
	}
	if len(layout.Parts) > entity.MaxLayoutParts {
		writeError(w, http.StatusBadRequest, "layout has too many parts")
		return
	}
	writeProto(w, http.StatusOK, feasibility.Validate(&layout, s.catalogue))
}
