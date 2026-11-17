# Ledger design

Ledger is "the school records site for Sai Seva Sangh" (README). Everything here is taken from the code: `assets/ledger.css`, `assets/lib.js`, `assets/nav.js`, `tools/*-header.html`, `assets/pages/*.js` and `supabase/migrations/`. If a value isn't in those files, it isn't in this document.

## 1. The shape: a records grid

Ledger's core object is a grid of **students × evaluations**. The schema chain is `grade_levels → classes → evaluations → marks`, with `enrollments` putting students on a class roster. Every main screen is a view of that grid or a slice of it:

| Screen | What it shows from the grid |
|---|---|
| Gradebook (`Main`, `AdminMain`) | A class roster × that class's evaluations, plus totals |
| Test details (`TestDetail`) | One column: one evaluation × the roster |
| Marks entry (`Marks`, `AddTest`) | One column you can edit, with stats that update as you type |
| Student profile (`Student`) | One row across every class: subjects × test names |
| Attendance (`Attendance`) | The roster × days, with P / A / L |
| Timetable (`AdminTimetable`) | Days × periods |

Design the grid first; everything else hangs off it.

### The gradebook table (`.tbl`)

The table that carries the most weight. From `gradebook.js` and `ledger.css`:

- **Student column** (`.name`): sticky on the left, at least 200px wide, bold. Each name links to the student's profile in deep saffron.
- **Evaluation columns** (`.ev`): at least 96px wide. The header is three lines: the test name (a link to its details), the date (`10 Jul 2025` format, 11.5px), and `Max 25 · Wt. 5%` (11.5px, muted).
- **Cells**: right-aligned tabular numbers, 48px tall. There are three states:
  - a mark, shown to at most one decimal place
  - `Ab` (absent): an italic, dashed, 4px-radius chip
  - `–` (not entered), in muted text
- **A 12px gap column**, then two **sum columns** (`.sum`) on light mauve. The first has a 2px mauve left rule:
  - "Total Marks Acquired · Out of {total max} · Raw %"
  - "Adjusted Marks (Weighted) · Out of {sum of weights}". Its tooltip text: "Each evaluation is scaled to its weightage: (marks ÷ max marks) × weight, summed across all evaluations."
- **Rows**: every even row is off-white, and hovering a row turns it light mauve. The sum cells keep their own tint.
- **Above the table**: four stats, then the legend line "Ab = Absent · – = not entered · Click a test name to see its details".

The four stats come from the `gradebook()` function in `lib.js`:
1. Class average · adjusted marks (out of {weight total})
2. Highest · {student}
3. Lowest · {student}
4. Pass percentage · {n} of {m} passed (pass mark {35})

The pass mark and how an absence counts come from `school_settings`. The pass mark defaults to `35`. An absence either counts as `0 marks` or is `Excluded from the average`.

## 2. Roles and navigation

There are two roles (`staff.role in ('teacher', 'admin')`), and they share one set of pages. Admin pages are prefixed `Admin`. A teacher who opens an admin page is sent to its teacher version, or to the Dashboard if there isn't one; an admin who opens a teacher page is sent to its admin version.

**Header** (`tools/*-header.html`): the logo, the wordmark "Ledger" with "sai seva sangh" in 11px lowercase beneath it, an **Admin** badge on admin pages, a pill-shaped search box, and the profile avatar. The header and the main nav stay pinned to the top while the page scrolls.

| | Teacher | Admin |
|---|---|---|
| Main nav | Dashboard · My Classes · All Classes · Students | Dashboard · Admissions · Students · Classes & Grades · Timetable · Staff · Archive |
| Search placeholder | "Search students and classes" | "Search students, staff, classes" |
| Profile menu | My Account · Log out | School Settings · My Account · Log out |

Section tabs under the main nav (`nav.js`, admin only):

- **Admissions**: Applications · New Application · Transfers · Withdrawals · Enrollment Overview
- **Classes & Grades**: Classes · Subjects · Student Attendance
- **Timetable**: Timetable · Terms and Period Times · Rooms
- **Staff**: Staff Directory · Staff Attendance · Roles and Permissions
- **Archive**: Past Academic Years · Former Students · Reports

Detail pages get breadcrumbs (`›` separators, mauve links) and a "Back to {parent}" link. Browser tab titles are `Ledger – {page}` for teachers and `Ledger Admin – {page}` for admins.

## 3. Colour

All colours are defined at the top of `assets/ledger.css`.

| Token | Hex | Where the code uses it |
|---|---|---|
| `--white` | `#FFFFFF` | Header, cards, tables, side column |
| `--offwhite` | `#FAF7F4` | Page background, table heads, even rows, disabled inputs |
| `--ink` | `#2E2430` | All text, the main nav bar, toasts, tooltips, the Admin badge |
| `--mauve` | `#6E5A70` | Table header text, focus rings, the selected side-column item, breadcrumb links, checkboxes |
| `--mauve-light` | `#EFE9F0` | Hover, selected rows, gradebook sum columns, counts, quiet tags |
| `--saffron` | `#FF911E` | Primary buttons (with ink text), the current nav item, active tab underline, active step |
| `--saffron-hover` | `#F5850F` | Primary button hover |
| `--saffron-deep` | `#A85400` | Links and link buttons; the icon in empty states |
| `--saffron-light` | `#FFF1E0` | The first stat card, notes, "your class" timetable slots, warning tags |
| `--stone` | `#7C7C7A` | Control borders, secondary button borders, placeholders |
| `--muted` | `#666664` | Secondary text, labels, captions |
| `--hairline` | `#E6E2DE` | Every border and rule |
| `--credit` | `#2E7353` | `ok` tags, completed steps |
| `--debit` | `#B3261E` | `bad` tags, errors, danger buttons, absent (A), timetable clashes |

Saffron is a fill colour only; text that needs to be orange uses `--saffron-deep`. Borders are hairlines, and shadows appear only on things that float: dropdowns, the search list, modals and toasts.

**Status tags** (`.tag`, 4px radius, 12px bold):

| Class | Background | Text |
|---|---|---|
| default | `--mauve-light` | `--mauve` |
| `ok` | `#E3F1EA` | `--credit` |
| `warn` | `--saffron-light` | `--saffron-deep` |
| `bad` | `#FDECEA` | `--debit` |
| `dk` | `--ink` | white |

**Grade colours** (the timetable): `--g0` to `--g6`, one per grade, each a fill paired with an edge colour. In the timetable grid a slot is a white card with the grade's edge colour as a 4px left border. Extra slots use `--gx` (`#EFEDE9` with a `#7C7C7A` edge) and a dashed border.

| | g0 | g1 | g2 | g3 | g4 | g5 | g6 |
|---|---|---|---|---|---|---|---|
| fill | `#FFE7CC` | `#EBE3F0` | `#DCEBF5` | `#E0F0E6` | `#F7E1E7` | `#FFF4C2` | `#DDF1F0` |
| edge | `#FF911E` | `#6E5A70` | `#3D7BA8` | `#2E7353` | `#B0476A` | `#A88A00` | `#2C807C` |

## 4. Type

The font is **Lato**, falling back to Helvetica Neue and then Arial. The pages load the 300, 400, 700 and 900 weights from Google Fonts. Numbers in tables and stats use `font-variant-numeric: tabular-nums`.

| Size | Role | Count in code |
|---|---|---|
| 40px / 900 | Hero title (`index.html`) | 1 |
| 26px / 900 | Stat value (`.stat b`) | 3 |
| 24px / 700 | Page title (`.page-head h1`), letter-spacing −0.01em | 2 |
| 18px | Wordmark, modal title, dashboard headline | 4 |
| 16px / 700 | Card heading (`.sh`) | 1 |
| 14px | Body, table cells, buttons, inputs | 24 |
| 13px | Table heads, small buttons, breadcrumbs, notes | 17 |
| 12.5px | Captions: stat labels, item subtext, `.small` | 9 |
| 12px | Tags, counts, table percentages | 12 |
| 11.5px | Field labels (uppercase, 0.04em tracking), table sub-lines, side-column small text | 10 |
| 11px | Side-column headings (uppercase, 0.08em tracking), Admin badge, `sai seva sangh` | 4 |

Weights in use: 400, 700 and 900. Weights 600 and 800 also appear (`.dash-headline`, `.dash-day li.brk`), but those aren't loaded, so the browser substitutes the nearest one.

## 5. Shape and spacing

| Radius | Used for |
|---|---|
| `999px` (`--btn-radius`) | Buttons, counts, the search box, the attendance picker, steps, toasts |
| `16px` (`--r-panel`) | Cards, empty states, modals |
| `12px` | Stat cards, table frames, dropdowns, choice cards, the search list |
| `8px` (`--r-card`) | Notes, slots, menu items, errors |
| `4px` (`--r-input`) | Inputs, tags, the `Ab` chip |

The colour guide asked for 8px buttons; the stylesheet's comment notes that pills were chosen and 8px is the conservative option.

Gaps used most often: 8, 10, 6, 4, 12 and 18px. Page sections stack 18px apart (`.stack`). Cards have 20px × 24px padding and 14px between their contents. Grids (`.grid2`, `.grid3`, `.cols`) use 20px column gaps.

Fixed heights:
- Buttons: 40px, or 32px for small (`.s`)
- Inputs: 38px
- Table rows: 48px; table heads: 42px
- Tabs: 38px
- Main nav links: 38px, or 44px on phones

## 6. Components

All of these are defined in `assets/ledger.css` and built by the helpers in `assets/lib.js`.

- **Buttons** (`btn()`): pills with 700-weight text.
  - Primary (`.p`): saffron fill with ink text.
  - Secondary: white with a stone border; mauve-light on hover.
  - Danger: debit-coloured text.
  - Labels are verbs in Title Case: Add Test, Save Changes, Save Attendance, Mark All Present, Enroll & Create Profile, Confirm Withdrawal.
- **Page head** (`pageHead()`): an h1 and a muted one-line description on the left, actions on the right.
- **Card** (`card()`): a white panel with a 16px radius and a 16px bold heading over a hairline rule.
- **Stats** (`stat()`): a row of value-and-label tiles. The first is always light saffron.
- **Tables**:
  - `.tt`, the list table: left-aligned, sticky head, `.num` cells right-aligned.
  - `.tbl`, the gradebook (section 1).
  - `.tg` / `.ttg`, the timetable: periods are rows, days are columns, and lunch is an off-white row across the full width.
- **Tabs** (`tabs()`): text tabs with a 3px saffron underline on the active one and a mauve pill count.
- **Attendance picker** (`.seg`): a segmented pill of P / A / L. Selected P is mauve, A is debit red, L is saffron, and Leave is light mauve.
- **Empty state** (`emptyState()`): a dashed panel with a 48px icon on a light saffron circle, a 17px title and one line of text. Examples from the code: "No tests yet", "No students on this roster", "No timetable published yet".
- **Note** (`.note`): a light saffron strip for read-only notices, such as "View only. You can see this class's marks but can't edit them."
- **Stepper** (`.steps`): numbered pills used for New Transfer (Pick student → Type and destination → Effective date and records → Review and confirm).
- **Choice cards** (`.choice`): radio cards that turn saffron when picked (Incoming / Outgoing / Internal).
- **Modal and toast**: modals are native `<dialog>` with Cancel and a primary action. Toasts are ink-coloured pills at the bottom centre, red for errors.

## 7. Words

Use the database's terms, with the labels the UI already gives them:

| Field | Labels |
|---|---|
| Attendance | P = Present · A = Absent · L = Late · Leave |
| Residential | Hostler · Day scholar |
| Student status | active · withdrawn · transferred · graduated |
| Application | Draft · New · In review · Accepted · Rejected · Enrolled |
| Transfer kind | Incoming · Outgoing · Internal |
| Transfer status | Draft · Pending · Completed · Cancelled |
| Withdrawal | Awaiting TC · Completed |
| Staff status | Active · Invited · Inactive |
| Permission level | Hidden · View · View + edit own · Full access |
| Room type | Classroom · Laboratory · Library · Outdoor |
| Week | Mon–Sat · Mon–Fri |

Dates appear as `10 Jul 2025` in tables and `10/07/2025` in details; the academic year is written `2025–26` with an en dash. A class is named `{Grade} – {Subject}`, for example "Grade 6 – Mathematics".

## 8. Loose ends in the code

These are values that sit outside the token set, gathered so they can be folded in or removed:

- **Unnamed tints**: `#FBDDB8` (saffron border), `#FDECEA` and `#F3C5C1` (error), `#E3F1EA` (ok), `#D3CBD4` (dashed border), `#DED3DF` and `#E6DDE7` (gradebook sums), `#FAF8F6`, `#F7F5F2` and `#FCFBFA` (near-white backgrounds), `#A8A29E` (free-period label), `#E9E3EA` and `#F3EEF4` (nav text).
- **An undefined token**: `var(--paper, #FAF8F6)` in `.dash-empty` refers to `--paper`, which is never defined.
- **Weights that aren't loaded**: 600 and 800 (see Type).
- **Two navs styled side by side**: the old wireframe `nav[aria-label="Primary"]` styles and the newer `.site-nav`. Pages built from `tools/*-header.html` use `.site-nav`, which marks the current item with a saffron fill rather than an underline.
- **Logo**: `assets/logo.svg` is a placeholder (README). Replace it with the Sai Seva Sangh logo under the same name.
