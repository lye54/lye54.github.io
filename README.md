# lye54.github.io

Personal website for GitHub Pages.

## Publish it

1. Create a new GitHub repository named `lye54.github.io`.
2. Put these files in that repository.
3. Push to GitHub.
4. Visit `https://lye54.github.io`.

For a user site, GitHub Pages publishes the repository named exactly
`lye54.github.io` automatically from the default branch.

## Customize it

- Edit `index.html` to change your name, intro, project cards, and contact links.
- Edit `styles.css` to change the colors, spacing, and layout.
- Edit `script.js` to adjust the theme button behavior.

## Pet tracker

The standalone tracker lives at `https://lye54.github.io/pets/`. It uses plain
HTML, CSS, and JavaScript with no build step, backend, or external dependencies.
The portfolio homepage is unchanged.

- Add, edit, or delete pet profiles and add dated care notes.
- Choose one photo per pet, preview it, replace it, or remove it while editing.
  Photos are resized without upscaling to a maximum of 400 pixels on the longest
  side and encoded as JPEG at 80% quality. Transparent areas become white.
- Profiles, care notes, and photo data URLs are saved as an array under the
  `pets` localStorage key. Old profiles without a `photo` show an initial instead.
- A failed save leaves the previously saved data and the current form intact.
  If storage is full, remove a photo or delete an unused pet and retry.
- Data stays in this browser on this device. It is not uploaded or synced, and
  clearing browser data deletes it. GitHub Pages serves only the app files.
- The theme button shares the portfolio's light/night preference.

For local development, serve the repository root with `python3 -m http.server`
and open `/pets/` on that server. No installation or build is needed. Use a
separate browser profile or origin when testing to avoid changing real pet data.

Run the dependency-free regression checks with Node.js 22 or newer:

```sh
node --test tests/pets.test.cjs
```
