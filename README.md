# Typewriter Notes

A browser note app inspired by a digital typewriter: warm paper, a moving carriage, a reading light, and a physical letter-strike animation.

**[Open the app](https://manuka-rashen.github.io/typewriter-notes/)**

## Features

- A type slug that hits the printed letter before retracting and advancing. Ink and sound appear on contact.
- A warm carriage light with a switch and brightness control.
- On-screen and physical keyboard input, plus a device keyboard option.
- Automatic local saving, multiple notes, search, pinning, undo/redo, and recoverable deletion.
- Four paper tones, three fonts, adjustable type size, and a full-screen workspace that keeps the keyboard visible.
- Text download, copy, print/PDF, and JSON backup import/export.
- Responsive phone, landscape, and desktop layouts, with reduced-motion support.

## Run locally

Open `index.html` directly, or serve this folder with any static web server. There is no dependency installation or build step. Google Fonts is optional; local font fallbacks are included.

## Your notes

Notes stay in your browser on your device. They are not uploaded to GitHub or a server. Download a backup before clearing browser data.

Each hosting address has separate browser storage. To move notes from another address, download a backup there, then use **Notes → Import backup** in this app.

## Deployment

GitHub Pages publishes the `main` branch from the repository root. The `.nojekyll` file keeps this a plain static site.

## Validation

JavaScript syntax checks and browser checks covered letter-impact alignment across all three fonts, wrapped lines, carriage returns, typing, saving, note recovery, and responsive layouts. Phone layouts were checked in a desktop browser; physical phones were not tested.
