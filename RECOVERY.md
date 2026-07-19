# Disaster Recovery & Troubleshooting Manual

This manual provides quick-reference troubleshooting steps for system operators and users encountering integration failures or platform service interruptions on **Life Site**.

---

## 1. Firestore Unavailable

### Symptom
- Internal Server Error or "Service Unavailable" (503) messages on startup or when loading settings/sessions.
- Diagnostics page shows `connected: false` for Firestore.

### Recovery Steps
1. **Verify Firestore status and access**:
   Confirm the explicitly configured project and database, Firestore API status,
   service-account permissions, database health, and required indexes. Do not
   retrieve credentials or document contents as part of a connectivity check.
2. **Keep a failing revision out of traffic**:
   Do not promote a revision whose readiness check cannot reach its configured
   Firestore database. When appropriate, route traffic back to a previously
   verified immutable revision using the release procedure's captured rollback
   target.
3. **Recover durable data from Firestore**:
   When data recovery is required, restore from a verified Firestore backup and
   validate the restored database before it receives application traffic.
4. **Never use the Cloud Run filesystem for recovery storage**:
   Cloud Run's writable filesystem is temporary and instance-local. Local or
   dual storage must not be used as a staging or production recovery fallback.

---

## 2. Secret Manager Permission Error

### Symptom
- Startup logs show error: `GoogleSecretManagerStore: Failed to access secret...`
- Tokens and Client Secrets are not resolving, preventing integrations from running.

### Recovery Steps
1. **Grant IAM Permissions**:
   The service account running the container (e.g., the Cloud Run service account) must have the `Secret Manager Secret Accessor` (`roles/secretmanager.secretAccessor`) role on the respective project or specific secrets.
   ```bash
   gcloud secrets add-iam-policy-binding LIFE_SITE_USERNAME \
     --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --role="roles/secretmanager.secretAccessor"
   ```
2. **Switch to Local Secrets Storage (Emergency Rollback)**:
   If IAM configuration is locked or Cloud KMS is unreachable, you can temporarily store credentials locally:
   - Set environment variable: `SECRET_PROVIDER=existing`
   - Populate `/data/secrets.json` directly with the JSON formatted secrets, or pass them as standard environment variables.

---

## 3. Google Calendar Reconnect

### Symptom
- Calendar view is empty or shows warning sync status.
- Access tokens cannot be refreshed, or the OAuth token exchange fails.

### Recovery Steps
1. **Force Consent & Re-authenticate**:
   - Go to **Settings → Connections** in the Life Site UI.
   - Click **Google Connected** / **Disconnect** to clear the old refresh token.
   - Click **Connect Google Account**. Ensure you accept all calendar permission checkboxes on the Google consent page.
2. **Verify OAuth Client Settings**:
   - Verify that the production redirect URI is exactly: `https://life-site-dashboard-708819606972.europe-west2.run.app/api/auth/google/callback`.
   - Verify that the separate staging-service redirect URI is exactly: `https://life-site-dashboard-staging-708819606972.europe-west2.run.app/api/auth/google/callback`.
   - Do not register obsolete traffic-tag, predeploy, wildcard, or arbitrary `run.app` callback hosts.
   - Ensure the Google Cloud project has the **Google Calendar API** enabled in the API Console.

---

## 4. Todoist Token Replacement

### Symptom
- Tasks fail to load, or adding a task results in a `401 Unauthorized` or status error.
- UI displays a prompt to update the Todoist token.

### Recovery Steps
1. **Retrieve a New Token**:
   - Log in to [Todoist web client](https://todoist.com).
   - Go to **Integrations → Developer** and copy your **API Token**.
2. **Apply in settings**:
   - Go to **Settings → Connections** in the Life Site UI.
   - Under **Todoist API Token**, enter the newly copied token and click **Save Connections**.
   - If the system is using Google Secret Manager, the server will automatically update the `TODOIST_API_TOKEN` secret.

---

## 5. Desktop Obsidian Connection Failure

### Symptom
- Notes Inbox or Fleeting notes show offline or cannot load contents.
- Direct desktop Local REST API requests timeout.

### Recovery Steps
1. **Verify Obsidian Application Status**:
   - Ensure the Obsidian application is running on your desktop.
   - Check that the **Local REST API** community plugin is installed and **Enabled**.
2. **Verify Port & Protocol**:
   - Confirm the plugin is listening on the default HTTPS port (`27124`).
   - Copy the API Key from the community plugin settings into **Settings → Obsidian Local REST** in the Life Site UI.
3. **Check Network Ingress**:
   - Ensure your firewall or browser is not blocking connections to `https://127.0.0.1:27124`.

---

## 6. Android Obsidian Handoff Failure

### Symptom
- Mobile notes capture is unsafe, offline, or fails to sync.
- Local REST API cannot connect (direct vault access is restricted on Android).

### Recovery Steps
1. **Enable Mobile Notes Handoff**:
   - In **Settings → Obsidian**, configure the mobile notes mode to utilize **Handoff Mode**.
2. **Write to Buffer**:
   - This routes captured notes into a local inbox buffer directory (`/Inbox` or `/Fleeting Notes`) managed securely on the server.
3. **Handoff Sync Verification**:
   - Ensure **Obsidian Sync** or Syncthing is configured on your phone and desktop to keep the desktop vault in sync with the server buffer files.
   - Once synced, the server and desktop will automatically reconcile the added items.

---

## 7. Todoist Move/Update Failures

### Symptom
- Tasks fail to move to other project sections or updates fail with a 400 Bad Request or 404 Not Found error.
- The UI retains the stale task state or shows error alerts.

### Recovery Steps
1. **Refresh the Dashboard**: Click the Refresh button in the dashboard to pull the latest source of truth from Todoist's official servers.
2. **Verify Project/Section Existence**: Confirm that the target project or section was not deleted or renamed inside the Todoist application directly. If it was, re-create it in Todoist or use the "Move to" menu to relocate the task to a valid, existing destination.
3. **Verify API Connection Status**: Ensure your network has access to `https://api.todoist.com`.

---

## 8. Google Calendar Write Scope / Read-only Handoff

### Symptom
- Calendar details panel displays read-only permissions when edit/delete controls are expected, or edits return a "Forbidden" (403) or "Insufficient Permissions" error.
- Need to return Calendar to read-only mode or authorize full write access.

### How to Recognize Insufficient-Scope Errors
- When attempting to create, update, or delete an event, the API response or error log contains messages indicating:
  - `Insufficient Permission`
  - `403 Forbidden`
  - `The user has not granted write access to this calendar`

### How to Reconnect Google After Scope Changes
If full calendar mutation (write access) is required, re-authorize Google OAuth with the write scopes:
1. In the Life Site UI, go to **Settings → Connections**.
2. Click **Disconnect** under Google Calendar connection status.
3. Click **Connect Google Account**.
4. When prompted by the Google Consent Screen, ensure you check the boxes permitting full management (view, edit, share, delete) of your calendars.

### How to Return Calendar to Read-Only Mode
If you prefer to lock calendar interactions down and prevent accidental modifications:
1. Revoke the application's access from your [Google Account Permissions Page](https://myaccount.google.com/permissions).
2. Disconnect and reconnect your Google account in **Settings → Connections**, choosing only to grant the read-only calendar scope during the prompt.

---

## 9. Rollback Instructions

### How to Roll Back the Event Edit/Delete Feature Set
If the edit/deletion capability needs to be temporarily or permanently rolled back without removing stored OAuth/API tokens from the system database:
1. **Roll Back Frontend Component**: Revert the component rendering in `/src/App.tsx` from `<CalendarEventEditor ... />` back to the static read-only modal representation. This hides all interactive edit/delete controls from users while keeping authorization credentials fully functional for fetching and displaying the calendar.
2. **Restore Read-only State in Git**:
   ```bash
   git checkout HEAD -- src/App.tsx src/components/CalendarPanel.tsx
   ```
