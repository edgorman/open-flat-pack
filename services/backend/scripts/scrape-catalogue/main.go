// Command scrape-catalogue prints candidate catalogue entries from IKEA UK's product search, for a
// person to check and copy into internal/catalogue/catalogue.json. It is a dev-time helper and
// never runs in the service. See docs/design/v1/0002-catalogue.md.
//
//	go run ./scripts/scrape-catalogue [-filter REGEXP] [QUERY...]
//
// Each query is one request to the search API that www.ikea.com's own search page calls
// (sik.search.blue.cdtapps.com, whose robots.txt allows everything); product pages are not
// fetched. The queries default to the v1 ranges, and -filter keeps only products whose name
// matches it.
//
// What a candidate fills: article, name, variant, finish, price and URL as IKEA lists them, and a
// size read from IKEA's measure text (w x h, or w x d x h, rounded to mm). A person still confirms
// all of these, measures the slots, and sets checked_on and rests_on.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"google.golang.org/protobuf/encoding/protojson"

	appv1 "github.com/edgorman/webapp-template/services/backend/internal/gen/app/v1"
)

const searchURL = "https://sik.search.blue.cdtapps.com/gb/en/search-result-page"

// product is the part of a search result this command reads. A result also lists its other
// colours under gprDescription.variants, each with the same fields.
type product struct {
	ItemNo          string `json:"itemNo"`
	ItemType        string `json:"itemType"`
	Name            string `json:"name"`
	TypeName        string `json:"typeName"`
	ValidDesignText string `json:"validDesignText"`
	Measure         string `json:"itemMeasureReferenceText"`
	PipURL          string `json:"pipUrl"`
	SalesPrice      struct {
		Numeral float64 `json:"numeral"`
	} `json:"salesPrice"`
	GprDescription struct {
		Variants []product `json:"variants"`
	} `json:"gprDescription"`
}

func main() {
	filter := flag.String("filter", "^(KALLAX|DRÖNA|KUGGIS)$", "keep products whose name matches this regexp")
	flag.Parse()
	queries := flag.Args()
	if len(queries) == 0 {
		queries = []string{"kallax", "dröna", "kuggis"}
	}
	if err := run(queries, regexp.MustCompile(*filter)); err != nil {
		fmt.Fprintln(os.Stderr, "scrape-catalogue:", err)
		os.Exit(1)
	}
}

func run(queries []string, filter *regexp.Regexp) error {
	parts := map[string]*appv1.Part{}
	for i, q := range queries {
		if i > 0 {
			time.Sleep(time.Second) // one request a second, to stay a polite visitor
		}
		products, err := search(q)
		if err != nil {
			return err
		}
		for _, p := range products {
			for _, v := range append([]product{p}, p.GprDescription.Variants...) {
				// SPR items are bundles of other articles; the catalogue lists the articles.
				if v.ItemType == "ART" && filter.MatchString(v.Name) {
					parts[v.ItemNo] = candidate(v)
				}
			}
		}
	}

	catalogue := &appv1.Catalogue{}
	for _, part := range parts {
		catalogue.Parts = append(catalogue.Parts, part)
	}
	sort.Slice(catalogue.Parts, func(i, j int) bool {
		a, b := catalogue.Parts[i], catalogue.Parts[j]
		return a.Name+a.Variant < b.Name+b.Variant
	})

	// protojson output is deliberately unstable, so re-indent it for a diffable file.
	raw, err := protojson.MarshalOptions{UseProtoNames: true}.Marshal(catalogue)
	if err != nil {
		return err
	}
	var out bytes.Buffer
	if err := json.Indent(&out, raw, "", "  "); err != nil {
		return err
	}
	out.WriteByte('\n')
	_, err = out.WriteTo(os.Stdout)
	return err
}

func search(q string) ([]product, error) {
	// The API caps a page at its own maximum; 1000 is well above any one range.
	params := url.Values{"q": {q}, "types": {"PRODUCT"}, "size": {"1000"}}
	req, err := http.NewRequest(http.MethodGet, searchURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "open-flat-pack catalogue helper (https://github.com/edgorman/open-flat-pack)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("search %q: %s", q, resp.Status)
	}

	var body struct {
		SearchResultPage struct {
			Products struct {
				Main struct {
					Max   int `json:"max"`
					Items []struct {
						Product product `json:"product"`
					} `json:"items"`
				} `json:"main"`
			} `json:"products"`
		} `json:"searchResultPage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("search %q: %w", q, err)
	}
	page := body.SearchResultPage.Products.Main
	if len(page.Items) < page.Max {
		fmt.Fprintf(os.Stderr, "search %q: got %d of %d results\n", q, len(page.Items), page.Max)
	}
	products := make([]product, len(page.Items))
	for i, item := range page.Items {
		products[i] = item.Product
	}
	return products, nil
}

func candidate(p product) *appv1.Part {
	return &appv1.Part{
		Article:  p.ItemNo,
		Name:     p.Name + " " + strings.ToLower(p.TypeName),
		Variant:  strings.Trim(p.ValidDesignText+", "+p.Measure, ", "),
		Finish:   p.ValidDesignText,
		Size:     size(p.Measure),
		PriceGbp: p.SalesPrice.Numeral,
		Url:      p.PipURL,
	}
}

// size reads IKEA's measure text, e.g. "77x147 cm" (w x h) or "33x38x33 cm" (w x d x h), in mm.
// Anything else is left for a person to fill in.
func size(measure string) *appv1.Size {
	cm, ok := strings.CutSuffix(measure, " cm")
	if !ok {
		return nil
	}
	var mm []int32
	for _, n := range strings.Split(cm, "x") {
		f, err := strconv.ParseFloat(n, 64)
		if err != nil {
			return nil
		}
		mm = append(mm, int32(math.Round(f*10)))
	}
	switch len(mm) {
	case 2:
		return &appv1.Size{W: mm[0], H: mm[1]}
	case 3:
		return &appv1.Size{W: mm[0], D: mm[1], H: mm[2]}
	}
	return nil
}
