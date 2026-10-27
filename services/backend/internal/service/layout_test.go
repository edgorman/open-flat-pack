package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/edgorman/webapp-template/services/backend/internal/model"
)

// fakeModelCalls is an in-memory repository.ModelCallCounter for a single day.
type fakeModelCalls struct{ count int }

func (f *fakeModelCalls) Spend(_ context.Context, _ string, limit int) (bool, error) {
	if f.count >= limit {
		return false, nil
	}
	f.count++
	return true, nil
}

const (
	validLayout   = `{"parts":[{"article":"80275887","x":0,"y":0}]}`
	floatingFrame = `{"parts":[{"article":"80275887","x":0,"y":10}]}`
)

// layoutService answers each model call with the next reply, recording what it was sent.
func layoutService(limit int, replies ...string) (*Service, *fakeModelCalls, *[][]model.Message) {
	var sent [][]model.Message
	chat := func(_ context.Context, messages []model.Message) (string, error) {
		sent = append(sent, messages)
		reply := replies[0]
		replies = replies[1:]
		return reply, nil
	}
	calls := &fakeModelCalls{}
	s := newTestService(nil, nil)
	s.chat, s.modelCalls, s.cfg.ModelDailyCallLimit = chat, calls, limit
	return s, calls, &sent
}

func postLayout(s *Service, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/layouts", strings.NewReader(body))
	req.Header = authedRequest("token").Header
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	return rec
}

func TestCreateLayout(t *testing.T) {
	for _, tt := range []struct {
		name      string
		replies   []string
		status    int
		calls     int
		wantError string
	}{
		{"valid first time", []string{validLayout}, http.StatusOK, 1, ""},
		{"fixed on retry", []string{floatingFrame, validLayout}, http.StatusOK, 2, ""},
		{"unparseable then fixed", []string{"no", validLayout}, http.StatusOK, 2, ""},
		{"still failing after two retries", []string{floatingFrame, floatingFrame, floatingFrame},
			http.StatusUnprocessableEntity, 3, "is not supported"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s, calls, _ := layoutService(10, tt.replies...)
			rec := postLayout(s, `{"prompt":"a bookcase"}`)
			if rec.Code != tt.status || calls.count != tt.calls {
				t.Fatalf("status = %d, calls = %d; want %d, %d: %s", rec.Code, calls.count, tt.status, tt.calls, rec.Body)
			}
			// Spelled out rather than decoded into the generated types, so a renamed wire field
			// fails here.
			var body struct {
				Layout struct {
					Parts []struct {
						Article string `json:"article"`
					} `json:"parts"`
				} `json:"layout"`
				Errors []struct {
					Part    *int   `json:"part"`
					Message string `json:"message"`
				} `json:"errors"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if tt.status == http.StatusOK && (len(body.Layout.Parts) != 1 || body.Layout.Parts[0].Article != "80275887") {
				t.Errorf("body = %+v", body)
			}
			if tt.wantError != "" && (len(body.Errors) == 0 || !strings.Contains(body.Errors[0].Message, tt.wantError)) {
				t.Errorf("errors = %+v, want one containing %q", body.Errors, tt.wantError)
			}
		})
	}
}

// The retry goes back to the model in the same conversation, carrying the validation errors.
func TestCreateLayout_RetrySendsErrors(t *testing.T) {
	s, _, sent := layoutService(10, floatingFrame, validLayout)
	postLayout(s, `{"prompt":"a bookcase"}`)
	retry := (*sent)[1]
	if last := retry[len(retry)-1]; last.Role != "user" || !strings.Contains(last.Content, "part 0") {
		t.Errorf("retry ended with %+v, want the validation errors", last)
	}
}

func TestCreateLayout_Refused(t *testing.T) {
	for _, tt := range []struct {
		name   string
		limit  int
		body   string
		status int
	}{
		{"daily limit reached", 0, `{"prompt":"a bookcase"}`, http.StatusServiceUnavailable},
		{"empty prompt", 10, `{"prompt":"  "}`, http.StatusBadRequest},
		{"prompt too long", 10, `{"prompt":"` + strings.Repeat("a", maxPromptLength+1) + `"}`, http.StatusBadRequest},
	} {
		t.Run(tt.name, func(t *testing.T) {
			s, _, _ := layoutService(tt.limit, validLayout)
			if rec := postLayout(s, tt.body); rec.Code != tt.status {
				t.Errorf("status = %d, want %d", rec.Code, tt.status)
			}
		})
	}

	// Without a model configured, and without signing in.
	if rec := postLayout(newTestService(nil, nil), `{"prompt":"a bookcase"}`); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("no model: status = %d", rec.Code)
	}
	rec := httptest.NewRecorder()
	newTestService(nil, nil).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/layouts", strings.NewReader(`{"prompt":"x"}`)))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("signed out: status = %d", rec.Code)
	}
}
