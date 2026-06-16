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

### Debugging UI bugs: diagnose before coding
Before touching any code, ask:
1. **"What URL are you on?"** — distinguishes routes (`/gallery`) from page sections (`/#gallery`)
2. **"What exactly do you see vs. expect?"** — separates missing rendering from missing data
3. **"Does it affect all items or only some?"** — divergent behavior (photos work, videos don't) means divergent code branches

Then read the component that actually renders the broken element and check every conditional branch before investigating data fetching or caching. This project lost multiple sessions to RLS/caching investigation when the real bug was that video branches in `GallerySection.tsx` simply never had tag rendering code.
