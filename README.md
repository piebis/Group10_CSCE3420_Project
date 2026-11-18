# BorrowBuddy — CSCE 3420 Internet Programming

**Project type:** Dynamic web application (Node.js built-in HTTP server + REST API + HTML/CSS/JavaScript + persistent JSON data). 

BorrowBuddy enables students to list items for lending, browse available items, request borrowing dates, approve or decline requests, and confirm returns. No paid services, framework installation, or API credentials are required to run it locally.

> **Class demo, not production hosting.** Accounts use locally stored salted/scrypt-hashed passwords. Sessions are held in server memory and expire after seven days or on logout. This build does not verify student identities or handle in-app payments, lending agreements, damage claims, photo uploads, or notifications. Demo accounts use a published password and must never be used for public deployment.

## 1. Prerequisites

- Node.js version **18 or later** (Node.js 22 recommended): <https://nodejs.org/>
- A web browser (Chrome, Edge, Firefox, or Safari)
- Optional: Git for collaboration

## 2. Set up and run

1. Place `server.js`, `seed-demo.js`, `tests.js`, `package.json`, `.gitignore`, and the `public` directory inside one `BorrowBuddy_Final_Project` folder. **Keep `public/index.html`, `public/styles.css`, and `public/app.js` together.**
2. Open **Terminal** (macOS/Linux) or **PowerShell** (Windows) in that folder.
3. Optional, but helpful for the demonstration: run `npm run seed` to add six sample items and two demo accounts. Running seed again does not duplicate items.
4. Start the application with `npm start`.
5. Open **http://localhost:3000** in your browser.
6. Press `Ctrl+C` in Terminal to stop the server.

There is **no `npm install` step**: the project uses only modules built into Node.js.

### Optional demonstration accounts (created by `npm run seed`)

| Role | Email | Password |
| --- | --- | --- |
| Example lender | `maya@borrowbuddy.demo` | `DemoPass123!` |
| Example borrower | `jordan@borrowbuddy.demo` | `DemoPass123!` |

You can also register your own accounts. For a complete approval/return demo, sign in as one user to request an item, log out, and sign in as its owner to approve and confirm its return.

**Important:** These demo credentials are deliberately public and suitable **only for local classroom testing**. Remove or replace them before putting the app on a network accessible to others.

## 3. Run the tests

Run `npm test` from the project root. The integration tests start their own temporary server/database, check 25 scenarios, and delete their temporary data afterward. They cover authentication, bad input, authorization, CRUD, request lifecycle, conflicting active loans, return handling, and persistence.

## 4. Application pages and workflow

1. **Explore:** Browse and filter database-backed item cards; click **View item** for more details.
2. **Sign up / Log in:** Accounts allow access to lending and borrowing actions.
3. **My listings:** Add, edit, pause, and delete listings. Item owners control modifications.
4. **Request to borrow:** Choose a start/end date within a 14-day period and optionally send a message.
5. **My loans:** Borrowers can view/cancel pending requests. Lenders can approve/decline pending requests and confirm returns for active loans. Completed records remain in the history.

### Important rules

- A user cannot request their own item.
- Requested dates cannot be in the past; the inclusive loan period must be 1–14 days.
- Each item can have only **one approved (active) loan at a time**. When the owner approves a request, other pending requests on that item are declined.
- Listings with pending or active requests cannot be deleted until those requests are resolved.
- Only a lender can approve, decline, or confirm the return; only the requester can cancel a pending request.
- **Dates are recorded**, but calendar-based future booking and date-overlap scheduling are **not implemented**. One active loan per item is a deliberate scope simplification.

## 5. Technology and file layout

```text
BorrowBuddy_Final_Project/
├── server.js                # Node HTTP server, validation, authorization, REST API
├── seed-demo.js             # Optional sample accounts and listings
├── tests.js                 # Automated integration tests (temporary database)
├── package.json             # Run/test/seed commands
├── .gitignore               # Excludes local data, logs, generated dependencies
├── README.md                # This document
├── public/
│   ├── index.html           # Main document, navigation, and app container
│   ├── styles.css           # Responsive styling, modal/forms/items
│   └── app.js               # UI rendering, API integration, dynamic interactions
└── data/                    # Created at runtime; DO NOT submit or commit
    └── borrowbuddy.json     # Users, items, and requests (includes password hashes)
```

**Backend:** built-in Node.js HTTP and crypto modules. **Storage:** persistent local JSON with atomic file replacement. **API:** JSON over HTTP, same-origin fetch. **Frontend:** vanilla HTML5/CSS3/JavaScript. **Deployment:** locally hosted by default (`127.0.0.1:3000`). No external API integration is needed because the project's custom API and persistent storage meet the course data component requirement.

### API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server health |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current session |
| GET | `/api/items` | Browse and search (query params: q, category, available) |
| GET | `/api/items?mine=true` | Current user's listings |
| POST | `/api/items` | Create listing |
| GET, PUT, DELETE | `/api/items/:id` | Read, edit, or delete listing |
| GET | `/api/requests?role=borrower|lender|all` | Loan/request history |
| POST | `/api/requests` | Send borrowing request |
| PATCH | `/api/requests/:id` | Approve, decline, cancel, or confirm return |

HTTP responses contain JSON. Unauthorized requests receive `401`; forbidden actions receive `403`; invalid inputs receive `400`; unavailable/conflicting state receives `409`.

### Storage notes

The app automatically creates `data/borrowbuddy.json` on first launch. This data file contains password hashes and personally entered data; it is excluded by `.gitignore` and should not be uploaded to Canvas or GitHub. To reset your local demo, stop the server and rename/delete this file, then rerun `npm run seed`. **Do not delete this file if it contains real data you need.**

Sessions are memory-only, so restarting the server logs everyone out (but users/listings/loans remain saved). This design is intended for a local classroom demonstration, not scaled public production hosting.

## 6. Security, validation, and limits

- Salted `scrypt` password hashes instead of plain text passwords
- HTTP-only, SameSite=Lax session cookie
- Owner/borrower/lender authorization checked server-side
- Server and browser input validation; date-range checks
- Basic same-origin policy for state-changing requests
- HTML escaping of user-generated strings in the browser
- Maximum JSON request body size (32 KB) and consistent API errors

**Limitations:** no email verification, no rate-limited login, no password reset, no HTTPS termination, no transactional multi-process database, no image uploads, no automatic email notifications, and no real identity/background verification. Do not use on the public Internet without addressing these items. A future production deployment should use HTTPS, a transactional database, secure cookies, CSRF protections appropriate to the hosting configuration, stronger abuse controls, and an identity validation process.

## 7. Troubleshooting

| Problem | Solution |
| --- | --- |
| `node` / `npm` not recognized | Install Node.js 18+ and restart Terminal |
| `EADDRINUSE: address already in use` | Close the other app using port 3000, or run with `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`) |
| Homepage fails to load | Start the server and visit `http://localhost:3000`, not the HTML file directly |
| No items shown | Run `npm run seed`, or log in and create a listing |
| Forgot sample password | Demo accounts use `DemoPass123!` if freshly seeded |
| Error when deleting item | Resolve its pending/active requests first |
| Browser session disappears after restart | Expected: sessions are stored in memory. Log in again. |

## 8. Recommended final demonstration

1. Show the homepage, search for `calculator`, and filter categories.
2. Sign in as Jordan and send a borrowing request for an item Maya owns.
3. Switch to Maya and review **My loans → I'm lending**; approve the request.
4. Show the item marked unavailable and the active loan in loan history.
5. Confirm the return; show that the listing becomes available again.
6. Create/edit/pause an item under **My listings** and show invalid form validation.
7. Run `npm test` to demonstrate automated validation and storage logic.

For the required 8–12 minute video, **every actual team member needs to participate**; the team must record and upload its own demonstration.

## 9. GitHub and Canvas submission

Create a shared GitHub repository and invite teammates. Commit files throughout development under the **real team member accounts**. Do not invent a repository URL or fabricate contribution history. The required report and contributions forms are in `docs/` and require real team details.

The instructor requires **individual source file uploads** where Canvas requests them; **do not upload a ZIP** unless Canvas explicitly permits it. Upload the final report as PDF, contribution statement, source files as required, repository link, and recorded demonstration URL/file as instructed by Canvas. Do not submit `data/` or any credentials.

**Proposal changes:** The original proposal suggested React/Firebase. This final local build uses JavaScript with a custom Node.js REST API and persisted JSON to avoid external credentials and reduce setup. This change should be disclosed in the final report and approved by the instructor if considered a major scope change. Optional photos, QR handoff, reputation score, and notifications are not implemented.
