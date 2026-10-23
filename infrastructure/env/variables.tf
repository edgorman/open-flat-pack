variable "gcp_project_id" {
  description = "The GCP project this environment's resources are created in (e.g. myapp-stag)"
  type        = string
}

variable "gcp_region" {
  description = "The region Cloud Run and Artifact Registry resources are created in"
  type        = string
  default     = "europe-west1"
}

variable "environment" {
  description = "Short environment name used in resource naming (e.g. backend-stag) and passed to the backend as its ENVIRONMENT env var"
  type        = string
}

variable "backend_cors_origin" {
  description = "Origin allowed to call the backend from a browser - this environment's frontend URL"
  type        = string
}

variable "backend_initial_image" {
  description = "Placeholder image for the Cloud Run service's initial creation; CI deploys the real image afterward (drift ignored, see cloud_run.tf)."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "ci_service_account" {
  description = "Email of the CI service account infrastructure/root creates, granted what CI needs on this environment's resources. The workflows pass the SERVICE_ACCOUNT Actions variable."
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth 2.0 client ID the backend verifies ID tokens against. Defined once in infrastructure/root and passed in by CI as TF_VAR_google_client_id."
  type        = string
  default     = ""
}

variable "alert_notification_emails" {
  description = "Addresses the monitoring alerts in monitoring.tf are sent to. Empty leaves the policies in place but silent - they still show in the console, nobody is told. These are recipients rather than an entitlement: an address here is where a message goes, not an account admitted to anything."
  type        = list(string)
  default     = []
}

variable "alert_error_count_threshold" {
  description = "How many 5xx responses in a five minute window the backend may serve before alerting. Counted rather than expressed as a rate because traffic here is low enough that any rate reads as noise."
  type        = number
  default     = 5
}

variable "alert_latency_threshold_ms" {
  description = "The 95th percentile request latency, in milliseconds, the backend may exceed for ten minutes before alerting. Set above a cold start on purpose: the service scales to zero, so seconds-long first requests are normal and alerting under this would page for them."
  type        = number
  default     = 5000
}

variable "alert_client_error_count_threshold" {
  description = "How many 4xx responses in a five minute window the backend may serve before alerting. Deliberately high: 404s from stale or mistyped links are ordinary traffic, so this is meant to catch floods of 401s or 429s, not browsing."
  type        = number
  default     = 100
}

variable "alert_rate_limited_count_threshold" {
  description = "How many 429 responses in a five minute window the backend may serve before alerting. A 429 is only ever the backend's own rate limiter refusing a caller, so any sustained number of them means someone is calling the API far faster than using the site would."
  type        = number
  default     = 20
}

variable "model_name" {
  description = "The Vertex AI model the backend sends prompts to, as publisher/model. It must be enabled once in Model Garden in this project (docs/new-repo.md)."
  type        = string
  default     = "deepseek-ai/deepseek-v4.1-flash-maas"
}

variable "model_location" {
  description = "The Vertex AI location model_name is served from. DeepSeek's managed models are served from global, not from gcp_region."
  type        = string
  default     = "global"
}

variable "model_daily_call_limit" {
  description = "The most model calls the backend makes per UTC day; past it, prompts are refused until midnight. This is the hard cap on model spend, since Google Cloud budgets only alert."
  type        = number
  default     = 500
}
