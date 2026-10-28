package service

import (
	"net/http"

	"github.com/edgorman/webapp-template/services/backend/internal/entity"
)

// requirePermission checks the caller holds a permission (see entity.Permission), writing a 403
// and returning false otherwise.
//
// This is the plain form of every gate in the API: the handler builds the permission from the
// thing being acted on and asks this.
func requirePermission(w http.ResponseWriter, r *http.Request, permission entity.Permission) bool {
	if permission.Allows(uidFromContext(r.Context())) {
		return true
	}

	writeError(w, http.StatusForbidden, "forbidden")
	return false
}
