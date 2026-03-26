

## Remove Filters from Segmented Control, Add Hamburger Menu

### Overview
Remove the "filters" segment from the mobile nav segmented control so it only contains the four main views (Feed, Tree, List, Calendar). Add a hamburger menu icon to the left of the segmented control that opens the existing Manage/Filters view.

### Changes

#### 1. `src/components/mobile/MobileNav.tsx`
- Remove `"filters"` from the `allSegments` array → `["feed", "tree", "list", "calendar"]`
- Remove the `MobileViewType` union that includes `"filters"` — simplify to just re-export `ViewType` or keep as the 4 main views
- Add a hamburger/menu icon button to the left of the segmented control container
- Add a new `onFiltersOpen` callback prop for the hamburger button
- Remove the filter icon import and related filter segment rendering

#### 2. `src/components/mobile/MobileLayout.tsx`
- Update `mobileViews` array (already correct without filters)
- Pass `onFiltersOpen={openManageView}` to `MobileNav`
- Update `handleMobileViewChange` to remove the `view === "filters"` branch
- Update `mobileCurrentView` to no longer map to `"filters"`
- Keep all existing Manage/Filters panel logic (just triggered differently now)

#### 3. Layout structure
```text
┌──────────────────────────────────────────┐
│ ☰  [ Feed | Tree | List | Calendar ]     │
│     ════                    sliding pill  │
└──────────────────────────────────────────┘
```
The hamburger icon sits outside the segmented control, left-aligned, with a tap target of 44px. Tapping it calls `onFiltersOpen` which triggers the existing `openManageView()` flow.

### Technical Details
- The `MobileViewType` type will be simplified to exclude `"filters"` (or a separate `onFiltersOpen` prop replaces that path)
- Swipe-right from the leftmost view (Feed) will still open the manage view, preserving the existing gesture
- The hamburger button will use the `Menu` icon from lucide-react, styled to match the muted segmented control aesthetic
- Existing onboarding `data-onboarding="mobile-nav-manage"` attribute moves to the hamburger button

