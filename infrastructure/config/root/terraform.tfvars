# Replace every value here for a new repository (docs/new-repo.md). Bucket names in the three
# terraform.tfbackend files are <project id>-terraform-state and must match.
gcp_provider_project_id = "open-flat-pack-root"
gcp_provider_region     = "europe-west2"
gcp_provider_zone       = "europe-west2-b"
gcp_project_prefix      = "open-flat-pack"
gcp_projects            = ["stag", "prod"]
github_repository_owner = "edgorman"
github_repository_name  = "open-flat-pack"

site_name = "OpenFlatpack"
# No custom domain yet: the frontends are served at https://open-flat-pack-stag.pages.dev and
# https://open-flat-pack-prod.pages.dev. To add one, set cloudflare_zone and frontend_hostnames,
# e.g. { stag = "staging.example.com", prod = "example.com" }.

# Created by hand once (Google Cloud Console > Credentials > OAuth client ID, in the root
# project) and set here; see services/frontend/README.md. Not a secret - the ID-token flow this
# app uses has no client secret, and the ID itself ships in the frontend bundle and every
# browser's network tab regardless.
google_client_id = ""

# The following are sensitive/unknown initially and thus have no default
# github_provider_token
# cloudflare_account_id
# cloudflare_api_token
# — pass them at apply time, e.g.:
#   TF_VAR_github_provider_token=<PAT> TF_VAR_cloudflare_account_id=<ID> TF_VAR_cloudflare_api_token=<TOK> make init
