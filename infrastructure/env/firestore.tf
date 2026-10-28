resource "google_project_service" "firestore" {
  project = var.gcp_project_id
  service = "firestore.googleapis.com"
}

# Vestigial: nothing needs Firebase now that the backend verifies sign-in itself, but Firebase
# cannot be un-added from a project, so removing these would only drop them from state.
resource "google_project_service" "firebase" {
  project = var.gcp_project_id
  service = "firebase.googleapis.com"
}

# Beta-only, and uses the quota-overriding provider alias (see providers.tf).
resource "google_firebase_project" "default" {
  provider = google-beta.firebase

  depends_on = [google_project_service.firebase]

  project = var.gcp_project_id
}

resource "google_firestore_database" "database" {
  provider = google.firebase

  depends_on = [google_project_service.firestore, google_firebase_project.default]

  project     = var.gcp_project_id
  name        = "(default)"
  location_id = var.gcp_region
  type        = "FIRESTORE_NATIVE"

  # Every record the backend keeps lives here, and prod applies run with -auto-approve on promotion
  # and rollback, so nothing a plan proposes may delete it: prevent_destroy fails any plan
  # that would replace it, delete protection stops a delete outside Terraform, ABANDON leaves the
  # database in place if it is ever dropped from state, and PITR keeps 7 days to restore from.
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  deletion_policy                   = "ABANDON"

  lifecycle {
    prevent_destroy = true
  }
}

# No security rules are deployed deliberately: the backend is the only client and decides access
# itself, and with no ruleset released the client SDKs cannot reach the database at all.
