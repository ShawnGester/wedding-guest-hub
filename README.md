# Wedding Guest Hub

Lightweight, local-first wedding guest manager for ~120 guests: emails, Google Form RSVP tracking, physical-invite address intakes, and save-the-date sending from the browser. Hosted for free on GitHub Pages.

**Location (sibling of `pokemon-grading-advisor`):**

- Windows: `C:\Users\shawn\Projects\wedding-guest-hub`
- WSL (once virtualization works): `/mnt/c/Users/shawn/Projects/wedding-guest-hub`

## Features

- Guest list with email, household, tags, party size, notes
- Downloadable guest CSV template (same columns as export) for manual intake, plus CSV import from Google Form responses
- Separate physical-invite track + address intake status / mailing address
- Save-the-date composer (subject, HTML/text, links, photo/file attachments)
- Send from the site via free [EmailJS](https://www.emailjs.com/) (or mailto fallback)
- Dashboard metrics, optional PIN lock, JSON backup export/import

## Free stack

| Piece | Choice |
| --- | --- |
| Hosting | GitHub Pages (static) |
| Data | Browser `localStorage` + JSON/CSV export (no paid backend) |
| Email | EmailJS free tier (~200 emails/month — enough for one save-the-date blast) |

No server required. Data stays in the browser you use — export backups before switching devices.

## Run locally (Windows)

```powershell
cd C:\Users\shawn\Projects\wedding-guest-hub
npm install
npm run dev
```

## Run in WSL (preferred once enabled)

WSL Ubuntu is installed but **cannot start** on this machine until:

1. **BIOS:** enable virtualization (Intel VT-x / AMD-V). Currently reported as *Virtualization Enabled In Firmware: No*.
2. **Windows (Admin PowerShell):**

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
wsl --update
wsl --set-default-version 2
```

3. Reboot, then:

```bash
wsl -d Ubuntu
# inside Ubuntu:
cd /mnt/c/Users/shawn/Projects/wedding-guest-hub
# optional faster Linux copy:
# mkdir -p ~/Projects && cp -a /mnt/c/Users/shawn/Projects/wedding-guest-hub ~/Projects/
# cd ~/Projects/wedding-guest-hub

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
npm install
npm run dev
```

Or run the helper script after WSL works:

```bash
bash scripts/setup-wsl.sh
```

Dev server URL is printed in the terminal (usually `http://localhost:5173/wedding-guest-hub/`).

## Deploy to GitHub Pages

1. Create a GitHub repo named `wedding-guest-hub` (or change `base` in `vite.config.ts` to match).
2. Push this project.
3. Enable GitHub Pages from the `gh-pages` branch **or** run:

```bash
npm run deploy
```

4. Open `https://<your-user>.github.io/wedding-guest-hub/`.

## EmailJS setup (one-time)

1. Create a free EmailJS account and email service (Gmail, etc.).
2. Create a template with variables: `to_email`, `to_name`, `subject`, `message_html`, `message`, `from_name`, `reply_to`.
3. Paste Public Key, Service ID, and Template ID into **Settings** in the app.

Large photos: host on Drive/Dropbox and paste share links — free EmailJS works best with links rather than huge binary attachments.
