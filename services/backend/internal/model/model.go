// Package model asks the language model for a layout. One conversation per request: a fixed
// system prompt, the catalogue and the user's prompt, then any validation errors as follow-up
// turns so the model can fix its own answer. See docs/design/v1/0003-prompting.md.
package model

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/protobuf/encoding/protojson"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

// Message is one turn of a conversation: role "system", "user" or "assistant".
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Chat sends a whole conversation and returns the model's reply. Vertex is the real one; tests
// pass a func.
type Chat func(ctx context.Context, messages []Message) (string, error)

// ErrUnparseable marks a reply that isn't a layout. It counts as a failed attempt, like a layout
// that fails validation, rather than as the model being unreachable.
var ErrUnparseable = errors.New("the answer is not a layout")

// Conversation is one prompt's exchange with the model.
type Conversation struct {
	chat     Chat
	messages []Message
}

// Start opens a conversation for prompt. base is the layout of the design being changed, or nil
// for a new design.
func Start(chat Chat, catalogue *appv1.Catalogue, prompt string, base *appv1.Layout) (*Conversation, error) {
	// Proto names, so the catalogue reads like the snake_case the system prompt describes.
	marshal := protojson.MarshalOptions{UseProtoNames: true}
	parts, err := marshal.Marshal(relevant(catalogue, prompt, base))
	if err != nil {
		return nil, err
	}
	request := "Request: " + prompt
	if base != nil {
		layout, err := marshal.Marshal(base)
		if err != nil {
			return nil, err
		}
		request = "Change this layout:\n" + string(layout) + "\n\n" + request
	}
	return &Conversation{chat: chat, messages: []Message{
		{Role: "system", Content: systemPrompt + "\n\nThe catalogue:\n" + string(parts)},
		{Role: "user", Content: request},
	}}, nil
}

// relevant is the part of the catalogue a request needs, so a big catalogue doesn't make every call
// big: the ranges the prompt names or base uses, plus every part those can hold or stand on, and so
// on. A request naming no range gets the whole catalogue.
func relevant(catalogue *appv1.Catalogue, prompt string, base *appv1.Layout) *appv1.Catalogue {
	prompt = strings.ToLower(prompt)
	inBase := map[string]bool{}
	for _, p := range base.GetParts() {
		inBase[p.Article] = true
	}
	keep := map[*appv1.Part]bool{}
	for _, part := range catalogue.Parts {
		r, _, _ := strings.Cut(part.Name, " ")
		if inBase[part.Article] || strings.Contains(prompt, strings.ToLower(r)) {
			keep[part] = true
		}
	}
	if len(keep) == 0 {
		return catalogue
	}
	// Follow slots both ways, except the floor, which everything shares.
	for grown := true; grown; {
		grown = false
		slots := map[string]bool{}
		for part := range keep {
			for _, s := range part.Offers {
				slots[s.Name] = true
			}
			for _, name := range part.RestsOn {
				slots["<"+name] = true
			}
		}
		for _, part := range catalogue.Parts {
			if keep[part] {
				continue
			}
			links := slices.ContainsFunc(part.RestsOn, func(name string) bool { return slots[name] }) ||
				slices.ContainsFunc(part.Offers, func(s *appv1.Slot) bool { return slots["<"+s.Name] })
			if links {
				keep[part], grown = true, true
			}
		}
	}
	trimmed := &appv1.Catalogue{}
	for _, part := range catalogue.Parts {
		if keep[part] {
			trimmed.Parts = append(trimmed.Parts, part)
		}
	}
	return trimmed
}

// Next asks the model for a layout. A reply that isn't one is an ErrUnparseable error; any other
// error means the model couldn't be reached.
func (c *Conversation) Next(ctx context.Context) (*appv1.Layout, error) {
	reply, err := c.chat(ctx, c.messages)
	if err != nil {
		return nil, err
	}
	c.messages = append(c.messages, Message{Role: "assistant", Content: reply})

	// Models sometimes wrap JSON in a code fence even when asked not to, so take the outermost
	// object.
	start, end := strings.Index(reply, "{"), strings.LastIndex(reply, "}")
	if start < 0 || end < start {
		return nil, fmt.Errorf("%w: no JSON object", ErrUnparseable)
	}
	var layout appv1.Layout
	if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal([]byte(reply[start:end+1]), &layout); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnparseable, err)
	}
	return &layout, nil
}

// Reject tells the model what is wrong with its last answer, for the next call to Next.
func (c *Conversation) Reject(problems []string) {
	c.messages = append(c.messages, Message{Role: "user", Content: "That layout is not buildable:\n- " +
		strings.Join(problems, "\n- ") + "\n\nAnswer with the whole corrected layout."})
}

// Vertex is a Chat that calls model (publisher/model, e.g. deepseek-ai/deepseek-v4.1-flash-maas)
// through Vertex AI's OpenAI-compatible endpoint, as the service account the process runs as.
func Vertex(ctx context.Context, model, location string) (Chat, error) {
	credentials, err := google.FindDefaultCredentials(ctx, "https://www.googleapis.com/auth/cloud-platform")
	if err != nil {
		return nil, fmt.Errorf("model credentials: %w", err)
	}
	if credentials.ProjectID == "" {
		return nil, errors.New("model credentials: no project ID")
	}
	host := "aiplatform.googleapis.com"
	if location != "global" {
		host = location + "-" + host
	}
	url := fmt.Sprintf("https://%s/v1/projects/%s/locations/%s/endpoints/openapi/chat/completions", host, credentials.ProjectID, location)
	return chatCompletions(oauth2.NewClient(ctx, credentials.TokenSource), url, model), nil
}

// chatCompletions is a Chat for an OpenAI-style chat completions endpoint.
func chatCompletions(client *http.Client, url, model string) Chat {
	return func(ctx context.Context, messages []Message) (string, error) {
		body, err := json.Marshal(map[string]any{
			"model":           model,
			"messages":        messages,
			"response_format": map[string]string{"type": "json_object"},
		})
		if err != nil {
			return "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			return "", fmt.Errorf("model: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			detail, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
			return "", fmt.Errorf("model: %s: %s", resp.Status, detail)
		}
		var answer struct {
			Choices []struct {
				Message Message `json:"message"`
			} `json:"choices"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&answer); err != nil {
			return "", fmt.Errorf("model: %w", err)
		}
		if len(answer.Choices) == 0 {
			return "", errors.New("model: no choices in the answer")
		}
		return answer.Choices[0].Message.Content, nil
	}
}
