# Product Requirements — MVP

## Application fields

### Customer

- Application ID (UUID)
- Full name
- Mobile number
- Email (optional)
- Complete address
- Barangay, city/municipality, province
- Landmark

### Subscription

- Globe plan ID/name
- Monthly price snapshot
- Agent ID
- Processor ID (optional until assigned)
- Current status
- Job Order number (optional)
- Submitted date
- Installation date (optional)
- Notes

### Attachments

- Valid ID type
- Valid ID front Drive reference
- Valid ID back Drive reference

Do not expose public Drive URLs. Store stable file IDs and serve only through authorized API behavior.

## Permissions

| Capability | Admin | Agent | Processor |
|---|---:|---:|---:|
| View all applications | Yes | No | No |
| Create application | Yes | Yes | No |
| View own applications | Yes | Yes | No |
| View queue/assigned | Yes | No | Yes |
| Edit customer data | Yes | Before processing | Limited fields |
| Assign Processor | Yes | No | No |
| Update processing status | Yes | No | Yes |
| Manage users/plans/settings | Yes | No | No |
| View global reports | Yes | No | No |

## Status rules

- Default status: Pending.
- Normal forward flow: Pending → Transmitted → With Job Order → Ongoing → Installed.
- Delayed may return to the prior active step.
- Cancelled/Rejected ends normal processing unless Admin reopens it.
- Job Order number is required for `With Job Order` and later statuses.
- Installation date is required for `Installed`.
- Delayed and Cancelled/Rejected require notes.
- All transitions create an immutable history row.

## Google Sheets tabs

| Tab | Purpose |
|---|---|
| Users | Accounts, roles, status, profile |
| Applications | Current application state |
| Plans | Active/inactive Globe plans |
| Status_History | Immutable transition history |
| Attachments | Drive file metadata |
| Activity_Logs | Important actions |
| Settings | Small global configuration |

Use UUIDs as record IDs. Never use row numbers as identity.

## V1 reports

- Counts by status and date range
- Applications per month
- Installed count by Agent
- Processed/installed count by Processor
- Searchable/filterable application table
- CSV export of the current authorized result set
