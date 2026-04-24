## Plan: Descriptive Tooltips and Listing Labels in Feed Cards

### Overview

Update the feed task card icons and chips to show more specific, actionable titles instead of generic labels. Localize all new strings across English, German, and Spanish.

### Changes

#### 1. Add new i18n keys (all three locales)

In each `src/locales/{en,de,es}/tasks.json`, add inside the `"tasks"` object:

```json
"offer": "Offer",
"request": "Request",
"listing": {
  "commentBy": "Comment by {{author}}",
  "clickToClose": "{{type}} — click to close",
  "clickToReactivate": "Inactive {{type}} — click to reactivate",
  "fulfilled": "Request fulfilled",
  "sold": "Offer unavailable"
}
```

- **German translations**: `Angebot`, `Gesuch`, `Kommentar von {{author}}`, `{{type}} — zum Schließen klicken`, `Erfülltes {{type}} — zum Reaktivieren klicken`, `Anfrage erfüllt`, `Angebot vergeben`
- **Spanish translations**: `Oferta`, `Solicitud`, `Comentario de {{author}}`, `{{type}} — haz clic para cerrar`, `{{type}} cumplida — haz clic para reactivar`, `Solicitud Cumplida`, `Oferta Vendida`

#### 2. Update `src/components/tasks/feed/FeedTaskCard.tsx`

**a) Translate `feedMessageLabel**`
Replace the hardcoded `"Offer"` and `"Request"` with `t("tasks.offer")` and `t("tasks.request")`.

**b) Comment icon tooltip**
Change the `MessageSquare` icon wrapper `title` from `feedMessageLabel` (plain "Comment") to `t("tasks.listing.commentBy", { author: authorMeta.primary })`.

**c) Listing icon tooltips**
Replace the current inline title strings for the `Package`/`HandHelping` button with the new i18n keys:

- Active + interactive: `t("tasks.listing.clickToClose", { type: feedMessageLabel })`
- Sold + interactive: `t("tasks.listing.clickToReactivate", { type: feedMessageLabel })`
- Non-interactive sold: replace with `t("tasks.listing.fulfilled")` or `t("tasks.listing.sold")` based on type

**d) "Sold" chip text**
Replace the literal `{listingStatus}` chip text (`"sold"`) with a type-aware label:

- Offers: `t("tasks.listing.sold")`
- Requests: `t("tasks.listing.fulfilled")`

#### 3. Verification

Run a focused build check (`npm run build`) to confirm no TypeScript or i18n interpolation errors were introduced.

### Affected Files

- `src/locales/en/tasks.json`
- `src/locales/de/tasks.json`
- `src/locales/es/tasks.json`
- `src/components/tasks/feed/FeedTaskCard.tsx`