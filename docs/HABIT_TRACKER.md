# Habit Tracker Developer & Operator Guide

This document describes the design, configuration, and security architecture of the Habit Tracker integration in **Life Site**.

---

## 1. Storage Architecture & Configuration

The Habit Tracker implements a flexible storage engine that allows operators to choose between local JSON-based persistence and cloud-hosted Firebase Firestore. This is controlled via the `STORAGE_PROVIDER` environment variable.

### Persistence Modes

| Storage Mode | `STORAGE_PROVIDER` Value | Description | Use Case |
| :--- | :--- | :--- | :--- |
| **Local File** | `local` | Reads and writes local JSON files under the process `data` directory. | Explicit local development and automated tests only. |
| **Firestore** | `firestore` | Reads and writes the exact Firestore project and database supplied by configuration. | Required provider for staging, production, and Cloud Run. |
| **Dual Storage** | `dual` | Writes to both local files and Firestore and may fall back to local reads. | Temporary non-deployed development or migration work only; forbidden in staging, production, and Cloud Run. |

### Environment Variables
Configure these in your production container environment or `.env` file:
```bash
# Local development (no cloud database required)
NODE_ENV="development"
STORAGE_PROVIDER="local"

# Staging/production replaces the two values above with:
# NODE_ENV="production"
# STORAGE_PROVIDER="firestore"
# Both values below are required for firestore and dual; neither is discovered.
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
FIRESTORE_DATABASE_ID="your-firestore-database-id"
```

`FIRESTORE_DATABASE_ID="(default)"` is valid only when supplied explicitly.
Missing or unsupported `STORAGE_PROVIDER` values are startup errors. Cloud Run's
writable filesystem is temporary and must never be treated as durable storage.

---

## 2. Schedule Engine & Validation Rules

The Habit Tracker supports four distinct, highly flexible scheduling options. These schedules are validated strictly on the server to maintain data integrity.

### Valid Schedule Models

1. **Daily (`daily`)**
   - Active every day of the week.
   - Contains no contradictory parameters.

2. **Weekdays (`weekdays`)**
   - Active Monday through Friday.
   - Contains no contradictory parameters.

3. **Selected Days (`selected_days`)**
   - Active on user-selected days only.
   - Requires a non-empty `selectedDays` array containing unique, lowercase weekday names:
     `["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]`.

4. **Weekly Target (`weekly_target`)**
   - Active across the entire Monday-to-Sunday week.
   - Requires a positive integer target number per week: `weeklyTarget >= 1` (e.g., target of completing the habit 3 times any day between Monday and Sunday).
   - Generates streak metrics in terms of consecutive successful weeks rather than days.

### Strict Validation Constraints
- **Start Date Checkins**: Users cannot complete check-ins (`HabitEntry`) on a date prior to the habit's `startDate`. Attempting to write an entry before `startDate` is rejected by the server with a `400 Bad Request` error.
- **Start Date Editing Bounds**: Editing a habit's `startDate` to a future date will fail on the server if there are already completed check-ins on dates prior to the newly proposed `startDate`. This protects historic data from becoming orphaned.
- **Schedule Transition Cleaning**: When updating a habit's schedule type (e.g., from `selected_days` to `daily`), contradictory fields are completely stripped and cleanly overwritten to maintain a pure, compliant JSON model.

---

## 3. Timezone & Date Robustness

To eliminate the common issue of timezone shifting (where a client checks in on "Tuesday" but the server records it as "Monday" due to UTC offsets), the Habit Tracker adheres to a strict **Noon-Local Date Policy**.

### Custom Date Utility Implementation
All date calculations, date arithmetic, and comparisons are handled exclusively by pure custom utility functions (found in `/src/services/habitEngine.ts`):

- **`getLocalYYYYMMDD(date: Date)`**: Generates a standard `YYYY-MM-DD` string in the runtime's local timezone.
- **`parseLocalDate(dateStr: string)`**: Splits the `YYYY-MM-DD` string into numbers and instantiates a standard JavaScript `Date` object at **12:00:00 (Noon)** local time. Instantiating at Noon prevents Daylight Saving Time (DST) transitions from shifting the date backward or forward when adding/subtracting days.
- **`addDays(dateStr: string, days: number)`**: Performs safe date arithmetic by parsing the date at Noon, modifying the day count, and converting it back to a clean string format.

### Today's Date Consensus
- **Client Side**: Uses the user's browser-local date (`getLocalYYYYMMDD(new Date())`) to match their immediate calendar.
- **Server Side**: Uses the server system's local date (`getLocalYYYYMMDD()`) to handle backend storage operations, ensuring date structures match consistently.

---

## 4. Visual Completion Analytics

The tracker displays a minimalist 7-day visual grid accompanied by core performance statistics:
- **7-Day Completion Rate**: Evaluates the percentage of completed scheduled opportunities over the last 7 days. Weekly target habits are carefully calculated to keep percentages bounded (counted as a completion and a scheduled opportunity only on the days they were marked complete).
- **Best Day of the Week**: Identifies the day with the highest completion percentage. Ties are resolved by choosing the date with more scheduled opportunities, or defaulting to the most recent day.
- **Consistency Trend**: Compares the last 7 days against the previous 7 days. If the completion rate improves by 5% or more, the trend is marked **"Improving"**; if it drops by 5% or more, **"Declining"**; otherwise, it is labeled **"Steady"**.
