package service

import (
	"net/http"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
)

// GetCatalogue answers with every part a design may use. The catalogue is embedded in the binary,
// so it only changes on deploy, but a client must not keep it past one: a design made after a deploy
// can use parts an older copy doesn't have. The frontend fetches it once per page load anyway.
func (s *Service) GetCatalogue(w http.ResponseWriter, r *http.Request) {
	if !requirePermission(w, r, entity.PermissionFor(entity.ResourceCatalogue, entity.ActionRead)) {
		return
	}

	w.Header().Set("Cache-Control", "no-cache")
	writeProto(w, http.StatusOK, s.catalogue)
}
