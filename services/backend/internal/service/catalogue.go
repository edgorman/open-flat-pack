package service

import (
	"net/http"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
)

// GetCatalogue answers with every part a design may use. The catalogue is embedded in the binary,
// so it only changes on deploy and a client may cache it for an hour.
func (s *Service) GetCatalogue(w http.ResponseWriter, r *http.Request) {
	if !requirePermission(w, r, entity.PermissionFor(entity.ResourceCatalogue, entity.ActionRead)) {
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	writeProto(w, http.StatusOK, s.catalogue)
}
