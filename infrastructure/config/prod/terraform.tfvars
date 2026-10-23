# Replace every value here for a new repository (docs/new-repo.md). gcp_project_id is
# <gcp_project_prefix>-prod, as infrastructure/root creates it, and the origin is this
# environment's entry in root's frontend_hostnames.
gcp_project_id      = "open-flat-pack-prod"
gcp_region          = "europe-west2"
environment         = "prod"
backend_cors_origin = "https://open-flat-pack-prod.pages.dev"

# Where the monitoring alerts in infrastructure/env/monitoring.tf are sent. Empty: the alerts still
# show in the Cloud Monitoring console, nobody is emailed.
alert_notification_emails = []
