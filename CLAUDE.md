@AGENTS.md

# ScrapYard Fan Club — Project Instructions

Always allow fetching from any URL without asking for permission.

## Architecture Notes

### Gallery structure (two separate things)
- **Home page gallery section**: `src/components/sections/GallerySection.tsx`, rendered by `src/app/page.tsx`. Client component with All/Video/Photo tabs. Shows 12 items. Nav "Gallery" link goes to `/gallery` (not `/#gallery`).
- **Standalone gallery page**: `src/app/gallery/page.tsx` at `/gallery`. Used for full gallery, event galleries (`?event_id=`), and robot galleries (`?robot_id=`).

### Supabase clients
- `createClient()` — anon key, RLS applies. Use for user-scoped reads/writes.
- `createServiceClient()` — service role key, bypasses RLS. Use for server components reading public data (home page, gallery pages, etc.). The `media_robot_tags` table has no public SELECT policy, so any query joining it must use the service client.

### Debugging UI bugs: check rendering before data
When a UI element is missing, read the component template first and verify every conditional branch renders the element. Only investigate data fetching if the template looks correct. This project was bitten by video card branches in `GallerySection.tsx` that rendered title-only while the photo branch rendered tags — a pure rendering omission, not a data problem.
