package model

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

var catalogue = &appv1.Catalogue{Parts: []*appv1.Part{{Article: "60275812", Name: "KALLAX shelving unit", RestsOn: []string{"floor"}}}}

// fake answers with replies in order and records each conversation it was sent.
func fake(replies ...string) (Chat, *[][]Message) {
	var sent [][]Message
	return func(_ context.Context, messages []Message) (string, error) {
		sent = append(sent, append([]Message(nil), messages...))
		reply := replies[0]
		replies = replies[1:]
		return reply, nil
	}, &sent
}

func TestConversation(t *testing.T) {
	chat, sent := fake(
		"not json",
		"```json\n{\"limits\":{\"max_width\":1800,\"max_height\":null},\"parts\":[{\"article\":\"60275812\",\"x\":0,\"y\":0,\"note\":\"extra\"}]}\n```",
	)
	base := &appv1.Layout{Parts: []*appv1.LayoutPart{{Article: "60275812"}}}
	c, err := Start(chat, catalogue, "a white bookcase", base)
	if err != nil {
		t.Fatal(err)
	}

	if _, err = c.Next(context.Background()); !errors.Is(err, ErrUnparseable) {
		t.Fatalf("Next() error = %v, want ErrUnparseable", err)
	}
	c.Reject([]string{err.Error()})

	layout, err := c.Next(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if layout.GetLimits().GetMaxWidth() != 1800 || layout.Limits.MaxHeight != nil || len(layout.Parts) != 1 || layout.Parts[0].Article != "60275812" {
		t.Errorf("layout = %v", layout)
	}

	// The retry carries the whole conversation: system, request, first answer, the problems.
	second := (*sent)[1]
	if len(second) != 4 {
		t.Fatalf("second call sent %d messages, want 4", len(second))
	}
	for i, want := range []struct{ role, contains string }{
		{"system", `"rests_on":["floor"]`},
		{"user", "Request: a white bookcase"},
		{"assistant", "not json"},
		{"user", "not a layout"},
	} {
		if second[i].Role != want.role || !strings.Contains(second[i].Content, want.contains) {
			t.Errorf("message %d = %+v, want role %s containing %q", i, second[i], want.role, want.contains)
		}
	}
	if !strings.Contains(second[1].Content, "Change this layout") {
		t.Errorf("request = %q, want the base layout", second[1].Content)
	}
}

// A model that can't be reached is not a failed attempt.
func TestNext_ChatError(t *testing.T) {
	c, _ := Start(func(context.Context, []Message) (string, error) { return "", errors.New("down") }, catalogue, "x", nil)
	if _, err := c.Next(context.Background()); err == nil || errors.Is(err, ErrUnparseable) {
		t.Errorf("Next() error = %v", err)
	}
}

func TestChatCompletions(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Error(err)
		}
		if r.URL.Path == "/fail" {
			http.Error(w, "quota", http.StatusTooManyRequests)
			return
		}
		w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"{}"}}]}`))
	}))
	defer server.Close()

	reply, err := chatCompletions(server.Client(), server.URL, "deepseek")(context.Background(), []Message{{Role: "user", Content: "hi"}})
	if err != nil || reply != "{}" {
		t.Fatalf("reply = %q, %v", reply, err)
	}
	if got["model"] != "deepseek" || got["response_format"].(map[string]any)["type"] != "json_object" {
		t.Errorf("request = %v", got)
	}

	if _, err := chatCompletions(server.Client(), server.URL+"/fail", "deepseek")(context.Background(), nil); err == nil || !strings.Contains(err.Error(), "quota") {
		t.Errorf("error = %v, want the status and body", err)
	}
}

func TestRelevant(t *testing.T) {
	part := func(article, name string, restsOn []string, offers ...string) *appv1.Part {
		p := &appv1.Part{Article: article, Name: name, RestsOn: restsOn}
		for _, o := range offers {
			p.Offers = append(p.Offers, &appv1.Slot{Name: o})
		}
		return p
	}
	full := &appv1.Catalogue{Parts: []*appv1.Part{
		part("kallax", "KALLAX shelving unit", []string{"floor", "base"}, "cube"),
		part("underframe", "KALLAX underframe", []string{"floor"}, "base"),
		part("drona", "DRÖNA box", []string{"cube"}),
		part("pax", "PAX wardrobe frame", []string{"floor"}, "pax_front"),
		part("door", "FORSAND door", []string{"pax_front"}),
	}}
	articles := func(c *appv1.Catalogue) string {
		var out []string
		for _, p := range c.Parts {
			out = append(out, p.Article)
		}
		return strings.Join(out, " ")
	}
	for _, tt := range []struct {
		prompt string
		base   *appv1.Layout
		want   string
	}{
		{"a white Kallax", nil, "kallax underframe drona"},
		{"a lamp", nil, "kallax underframe drona pax door"},
		{"a wardrobe", nil, "pax door"},
		{"cube storage", nil, "kallax underframe drona"},
		{"add doors", &appv1.Layout{Parts: []*appv1.LayoutPart{{Article: "pax"}}}, "pax door"},
	} {
		if got := articles(relevant(full, tt.prompt, tt.base)); got != tt.want {
			t.Errorf("relevant(%q) = %s, want %s", tt.prompt, got, tt.want)
		}
	}
}
