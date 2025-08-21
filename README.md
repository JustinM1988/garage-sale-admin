# Garage Sale Admin (Front‑End Only)

A tiny, modern, front‑end web app to add/update points in a single ArcGIS Online Hosted Feature Layer.

- No backend. Uses **ArcGIS Maps SDK for JavaScript** and `applyEdits()`.
- Click an existing point to load it into the form, edit, and Save; or click the map to place a new point and Save.
- The form maps to these fields in your layer:
  - `Address` (text)
  - `Description` (text) — optionally composed from time range + details
  - `Date_1` (date) — start date
  - `EndDate` (date) — end date

## Run locally
Just open `index.html` in a local web server (Chrome blocks some ESM imports from `file://`).

```bash
# any static server works
python3 -m http.server 5173
# then open http://localhost:5173/mnt/data/garage-sale-admin/index.html
```

Or serve with your favorite static host (GitHub Pages, Cloudflare Pages, Netlify).

## Configuration
`app.js` has a small `CONFIG` block:

```js
const CONFIG = {
  LAYER_URL: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/Garage_Sales/FeatureServer/0",
  PORTAL_URL: "https://www.arcgis.com",
  OAUTH_APPID: null, // set an AGOL OAuth app ID if the layer requires authenticated edits
  CENTER: [-97.323, 27.876],
  ZOOM: 13
};
```

If your layer allows **public editing**, leave `OAUTH_APPID` as `null`.  
If not, [register an OAuth app in AGOL](https://developers.arcgis.com/documentation/security-and-authentication/user-logins/) and paste the App ID here to enable sign‑in.

## Field mapping
The code assumes your layer fields are named exactly:

- `Address`
- `Description`
- `Date_1`
- `EndDate`

If different, edit the `FIELDS` object in `app.js`.

## Compose Description
When *Compose Description* is checked, the app builds the value saved to `Description` as:

```
{startHour}:{startMin} {AM|PM} - {endHour}:{endMin} {AM|PM}: {details}
```

Uncheck to type a custom `Description` manually.

## Attachments
Attachments are not surfaced here, but can be added in a follow‑up if you want a photo uploader.

## Notes
- Make sure your AGOL org allows CORS from your hosting domain.
- Edits will respect the signed‑in user's privileges.
- This is front‑end only; do not expose layers that shouldn't be publicly editable.
