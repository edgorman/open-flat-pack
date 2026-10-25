package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

var testCatalogue = &appv1.Catalogue{Parts: []*appv1.Part{{
	Article: "80275887",
	Finish:  "white",
	RestsOn: []string{"floor"},
}}}

// Anybody may read the catalogue, signed in or not, and may cache it.
func TestGetCatalogue(t *testing.T) {
	rec := httptest.NewRecorder()
	newTestService(nil, nil).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/catalogue", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Result().Header.Get("Cache-Control"); got != "public, max-age=3600" {
		t.Errorf("Cache-Control = %q", got)
	}
	// Spelled out rather than decoded into appv1.Catalogue, so a renamed wire field fails here.
	var body struct {
		Parts []struct {
			Article string   `json:"article"`
			Finish  string   `json:"finish"`
			RestsOn []string `json:"restsOn"`
		} `json:"parts"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Parts) != 1 || body.Parts[0].Article != "80275887" || body.Parts[0].Finish != "white" || body.Parts[0].RestsOn[0] != "floor" {
		t.Errorf("body = %+v", body)
	}
}
