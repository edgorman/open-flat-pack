// Package definitions embeds the data files under this folder. It only exists because go:embed
// cannot reach a parent directory; the code that reads them lives under internal/.
package definitions

import "embed"

// Catalogue holds catalogue/YYYY-MM-DD.json, one file per scrape, named for the day it ran.
//
//go:embed catalogue/*.json
var Catalogue embed.FS
