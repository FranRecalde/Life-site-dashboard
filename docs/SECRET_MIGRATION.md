# Google Secret Manager Migration & Rollback Manual

This document outlines the operational procedures for migrating Life Site credentials from local file storage (`data/secrets.json`) to Google Secret Manager, along with IAM role configurations, verification protocols, and safe rollback instructions.

---

## 1. IAM Role Requirements

To allow the application running in Cloud Run to securely read and update credentials, you must grant the appropriate IAM permissions to the **Cloud Run Service Account** (or the identity used for Application Default Credentials).

### Required Roles

| Role Name | IAM Role Identity | Purpose |
| :--- | :--- | :--- |
| **Secret Manager Secret Accessor** | `roles/secretmanager.secretAccessor` | Allows the server to read the payload of secret versions (`LIFE_SITE_USERNAME`, `TODOIST_API_TOKEN`, etc.). |
| **Secret Manager Version Adder** | `roles/secretmanager.secretVersionAdder` | Allows the server to append new secret versions (such as when updating the `GOOGLE_REFRESH_TOKEN` upon fresh logins). |

### Google Cloud CLI (gcloud) Configuration

You can grant these roles using the following `gcloud` commands (replace `${PROJECT_ID}` and `${SERVICE_ACCOUNT_EMAIL}` with your actual project details):

```bash
# Grant Secret Accessor Role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"

# Grant Secret Version Adder Role
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretVersionAdder"
```

---

## 2. Secret Mapping & Schema

The application uses logical secret IDs internally to decouple the codebase from GCP-specific resource paths. The table below outlines how these logical IDs map to the corresponding Secret Manager resources:

| Logical Secret ID | Expected Secret Manager Name / Path | Usage in Application |
| :--- | :--- | :--- |
| `LIFE_SITE_USERNAME` | `life-site-username` | Admin login username |
| `LIFE_SITE_PASSWORD_HASH` | `life-site-password-hash` | Salted/hashed admin password |
| `SESSION_SECRET` | `session-secret` | Express session signature / cookie verification keys |
| `TODOIST_API_TOKEN` | `todoist-api-token` | Synchronizing personal/professional tasks |
| `GOOGLE_CLIENT_ID` | `google-client-id` | Google OAuth credentials for Calendar Sync |
| `GOOGLE_CLIENT_SECRET` | `google-client-secret` | Google OAuth secret |
| `GOOGLE_REFRESH_TOKEN` | `google-refresh-token` | Persistent token used to refresh Calendar access |

---

## 3. Step-by-Step Migration Procedure

Follow these steps to complete the transition cleanly without downtime:

### Step 3.1: Provision the Secret Resources
Ensure the secrets exist in your Google Cloud Project. You can create them empty or seed them with current values from your local `data/secrets.json`:

```bash
# Example: Creating and seeding the Todoist token
gcloud secrets create todoist-api-token --replication-policy="automatic"
echo -n "YOUR_TODOIST_TOKEN_VALUE" | gcloud secrets versions add todoist-api-token --data-file=-
```

### Step 3.2: Verify Application Default Credentials (ADC)
The application relies on GCP client libraries auto-detecting credentials. In production (Cloud Run), this is handled automatically. For local testing, ensure your ADC is authenticated:

```bash
gcloud auth application-default login
```

### Step 3.3: Activate Secret Manager Provider
Set the environment variable `SECRET_PROVIDER` to `secretmanager`. When active:
- The server will read all configurations directly from Secret Manager at startup.
- Transient Google access tokens (`googleAccessToken`) and expiry will remain safely in server memory.
- Writes to local `data/secrets.json` are **entirely disabled**, preventing local disk leakage.

---

## 4. Operational Rollback Procedure

If any connectivity issues or permission gaps are detected, you can roll back to local file storage instantaneously with zero code modifications:

1. **Locate the Environment Variables**: Navigate to your Cloud Run service configuration or local `.env` configuration file.
2. **Revert the Provider Setting**: Update the `SECRET_PROVIDER` variable:
   ```env
   SECRET_PROVIDER=existing
   ```
3. **Restart the Service / Redeploy**: Apply the change. The application will immediately fall back to the `ExistingSecretStore`, reading and writing local configurations in `data/secrets.json` and environment variables.

---

## 5. Safe Google Calendar Reconnection Steps

Transitioning OAuth credentials (Client ID and Secrets) can cause active user authentications to require renewal. To guarantee a secure and seamless reconnect experience:

1. **Update Google Client Credentials**: Enter the new `Google Client ID` and `Google Client Secret` in the **Connections** tab under Settings on the dashboard.
2. **Request Consent**: Click the **Connect Google Calendar** button. This opens the secure Google OAuth consent flow, which requests offline access.
3. **Appends as Version**: Upon successful authorization, the server retrieves a fresh `refresh_token` and saves it via `setSecretVersion('GOOGLE_REFRESH_TOKEN', refreshToken)`. This updates the existing secret resource in Secret Manager by adding a new version, rather than creating a duplicate resource, maintaining pristine historical lineage.
4. **Transient Use**: The accompanying `access_token` and its calculated expiry are loaded directly into server memory, isolated from persistent storage.

---

## 6. Verification & Troubleshooting Procedures

### 6.1 Status Verification
Navigate to the Settings panel of the application. The **Connections** screen has been enhanced to show diagnostic configuration states:
- **Status Checks**: Displays whether the `Todoist API token`, `Google Client ID`, and `Google Client Secret` are successfully configured on the server without leaking actual values to the browser.
- **Log Verification**: On server boot, check stdout for confirmation logs:
  ```text
  [Secrets] Initializing secrets with provider: secretmanager
  [Secrets] Successfully loaded secrets from secretmanager.
  ```

### 6.2 Common Errors & Remediation

*   **Error: `AccessDenied / PermissionDenied`**
    *   *Cause*: The Cloud Run service account lacks the Secret Manager Secret Accessor role.
    *   *Fix*: Run the `gcloud projects add-iam-policy-binding` command outlined in Section 1.
*   **Error: `ResourceNotFound`**
    *   *Cause*: The logical secret mappings target a secret name that does not exist in the GCP project.
    *   *Fix*: Ensure you have created all 7 secrets in the Secret Manager panel under the exact names mapped in `/server/storage/secretStore.ts` (e.g., `todoist-api-token`).
