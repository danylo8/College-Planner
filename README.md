# The Binder — Fall 2026

A calendar + planner for your four Fall 2026 courses (Futures Past, Asian
American Digital Culture, Intro to Comparative Politics, Behavior Disorders),
built from the syllabi. Pure HTML/CSS/JS — no build step, no server.

**Live features**
- Month-by-month calendar (Aug–Dec 2026) color-coded by course, with quick-jump
  month tabs (Aug/Sep/Oct/Nov/Dec) above the grid so you're never stuck on
  one month
- Full chronological list view — includes the weekly reading/topic
  schedule for all four courses, not just assignments and exams
- A planner/checklist (assignments + exams + reading, auto-populated, check
  things off, add your own tasks) — saved in your browser via `localStorage`.
  Each item shows its reading citation (e.g. "Craighead 3") right under the
  title, and a "Course info & required textbooks" panel above the calendar
  spells out what those citations refer to
- **Edit tab**: change or remove any date, title, detail, or event type, add
  brand-new events, and edit course info (name, instructor, room, meeting
  time, color) — all directly on the site, no code editing required. Saved
  in your browser via `localStorage`.

All the original due dates live in **`data.js`**. A few dates are marked
`TBA` as placeholders (final exam dates not yet announced) — once the real
dates are posted, open the **Edit** tab on the live site and fill them in
directly; no need to touch `data.js` at all.

The `syllabi/` folder has the four original syllabus PDFs (Futures Past,
Asian American Digital Culture, Behavior Disorders, Intro to Comparative
Politics), kept here for reference in case you want to double-check
anything against the source. They aren't used by the site itself — safe to
leave out of the GitHub Pages upload, or include them if you'd like a copy
alongside the code.

## Put this on GitHub Pages (no command line needed)

1. Go to [github.com](https://github.com) and log in (or create a free account).
2. Click the **+** in the top right → **New repository**. Name it something
   like `syllabus-hub`. Set it to **Public** (GitHub Pages on a free account
   needs a public repo). Don't add a README/gitignore — leave it empty. Click
   **Create repository**.
3. On the new repo's page, click **"uploading an existing file"** (or
   **Add file → Upload files**).
4. Drag in the four site files: `index.html`, `style.css`, `app.js`,
   `data.js`. (The `syllabi/` folder is just reference material — you can
   skip it or upload it too, it won't affect the live site either way.)
   Commit the upload.
5. Go to the repo's **Settings → Pages** (left sidebar).
6. Under "Build and deployment," set **Source** to **Deploy from a branch**,
   branch **main**, folder **/(root)**. Click **Save**.
7. Wait about a minute, then refresh — GitHub will show your live URL, something
   like:

   ```
   https://YOURUSERNAME.github.io/syllabus-hub/
   ```

That's it — no GitHub Desktop, no `git` commands required, everything above
is done through the browser.

### Making changes later

Whenever a professor updates a due date, adds an assignment, or you learn a
final exam date, just open the live site, go to the **Edit** tab, and update
it there — no GitHub editing required. Changes are saved in that browser (so
they follow you on that device, but won't appear on a different device or
browser unless you also make the change there).

If you'd rather change the underlying data everyone gets by default (e.g.
before sharing the link with classmates), you can still click into `data.js`
on GitHub, hit the pencil icon, edit the line, and commit — the live site
updates automatically within a minute or two.

## Double-check against Brightspace

This was built by reading the four syllabi you uploaded. A few things worth
verifying yourself once the semester is underway:

- **Futures Past final exam** and **PLSC 113 Exam #3** — both syllabi say
  "date TBA." I put placeholder dates near the end of finals week so they
  show up on the calendar; update them in the **Edit** tab once announced.
- **PSYC 223 final exam** — "during Finals Week (Dec 10–16), exact date TBA."
  Same placeholder treatment.
- Everything else (paper due dates, exam dates, breaks, schedule quirks like
  "Monday classes meet") is transcribed directly from the syllabi as posted.
