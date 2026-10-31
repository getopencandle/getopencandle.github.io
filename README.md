# getopencandle.com

The landing page for [OpenCandle](https://github.com/getopencandle/opencandle), a free, open-source desktop charting app for Windows.

This repo is plain HTML and CSS served by GitHub Pages. There is no build step, no JavaScript, no external fonts or CDNs, and no trackers or analytics.

## Files

| Path | What |
| --- | --- |
| `index.html` | The whole page, styles inline |
| `assets/` | Logo, favicon, screenshots (WebP, 1440 and 720 wide), video poster, 720p showcase video |
| `CNAME` | Custom domain for GitHub Pages: `getopencandle.com` |
| `.nojekyll` | Tells Pages to serve the files as they are |

## Preview locally

Open `index.html` in a browser, or serve the folder:

```powershell
python -m http.server 8000
```

then visit http://127.0.0.1:8000.

## Editing

- Keep the copy plain and short. No em dashes.
- Feature counts must match the app's README and CHANGELOG.
- Screenshots use the app's built-in example data only. Never real prices from a connected provider.
- The download button points at `releases/latest`, so a new release needs no change here unless the version text changes (search for `0.8.0`).

## Replacing the video

The showcase video will be replaced by a newer one soon. It is a file swap, no HTML change:

1. Overwrite `assets/opencandle-showcase-v2-720p.mp4` with the new cut (1280x720, H.264 MP4, `+faststart`, ideally under 15 MB).
2. Overwrite `assets/video-poster.webp` with a 1280x720 frame from the new cut (WebP, around 80 KB).
3. If the length changes, update "37 seconds of the real app" and the "(MP4, 4 MB)" fallback text in `index.html`.

Keep the same file names so the page and any shared links keep working. Browsers may cache the old file for a while.

## Licence

The page text and code are under the Apache License 2.0, like the app. The OpenCandle name and logo are trademarks of the OpenCandle project and are not covered by that licence.
