# Email reminders — one-time setup (~5 minutes)

**What you get:** one email each morning (~7am Eastern) to dosadchuk@binghamton.edu
listing everything that's **due today or overdue and not checked off yet**. Check an
item off in The Binder's Planner and it disappears from the emails. If nothing is due,
no email is sent.

The website can't send email on its own (it's just static files on GitHub), so this
uses a free Google Apps Script that lives in your Google account.

## Steps

1. Go to **https://script.google.com** while signed in as **dosadchuk@binghamton.edu**
   (your Binghamton login is Google-based). Click **New project**.
   - If Binghamton has Apps Script turned off for student accounts, sign in with a
     personal Gmail instead. Everything below works the same, and the emails still
     get sent *to* your Binghamton address.

2. Delete the starter code, then paste in everything from **`Code.gs`** (in this folder).

3. Near the top, change `SECRET` to any random phrase (e.g. `plum-lantern-4821`).
   Don't reuse a real password. You'll type the same phrase into the site in step 7.

4. Click **Save**. Then in the function dropdown at the top pick **`setup`** and click
   **Run**. Google will ask for permission:
   - Click **Review permissions** → choose your account → **Advanced** →
     **Go to (project name) (unsafe)** → **Allow**.
   - The "unsafe" warning is just because *you* wrote the script and Google hasn't
     reviewed it. It only needs permission to send mail as you and run on a schedule.
   - This creates the daily 7am trigger.

5. Click **Deploy → New deployment**. Click the gear next to "Select type" →
   **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
   Click **Deploy** and **copy the Web app URL** (ends in `/exec`).

6. Open The Binder → **Edit** tab → **Email reminders**.

7. Paste the URL and your secret → **Save & sync** → then **Send test email**.
   Check your inbox (and spam folder the first time). 

After that it's automatic: every check-off, edit, or new task syncs in the background.

## Good to know

- **Readings are not included** by default (the planner has ~80 of them, and unchecked
  ones would pile up in every email). Assignments, exams, Pen Pal letters, and your own
  custom tasks are. To include readings too, set `INCLUDE_READINGS = true` in `Code.gs`.
- **Emails only know what the site has synced.** The site syncs when you open it or change
  something, so if you check something off on your phone, your phone's browser needs the
  URL + secret entered too (the settings are stored per browser, as are your check-offs).
- **Changed `Code.gs` later?** Deploy → Manage deployments → pencil icon → Version:
  **New version** → Deploy. (The URL stays the same.)
- **Change the time or email:** edit `SEND_HOUR` / `EMAIL` at the top of `Code.gs`, then run
  `setup` again (it replaces the old trigger).
- **Stop the emails completely:** in the Apps Script editor, open the clock icon
  (Triggers) and delete the trigger.
- **Privacy:** your task list is stored in that Apps Script project in your Google account,
  nowhere else. The URL + secret are saved only in your browser, not in the GitHub repo.
  Anyone who has *both* the URL and the secret could overwrite your task list, so don't
  share them.
