# Waymark — Travel organiser

Mobile-friendly journey planning app with a calendar, journey timeline, document wallet and checklists.

## Current status

The Supabase backend is **not yet installed or verified**. Do not upload real travel documents until database row-level security and private Storage policies are configured and tested.

## Existing source package

The Waymark V2 GitHub-ready ZIP package was generated in the project conversation. Its app source includes:

- `index.html` — application shell
- `styles.css` — styling
- `app.js` — authentication and journey interactions
- `config.js` — Supabase **publishable** configuration
- `schema.sql` — isolated table and storage policies
- `vercel.json` — static Vercel deployment settings

**Note:** The application source files have not all been uploaded to this repository yet. This README is a setup checkpoint, not a claim that the web app is runnable from GitHub.

## Backend

The intended Supabase project is **New Manager Notes**, with a separate `waymark_workspaces` table and `waymark-documents` private bucket. Authentication users are shared with that project.

Never commit a Supabase service-role/secret key, user passwords, ticket images, boarding passes, or genuine travel documents.

## Next steps

1. Upload the application source files from the prepared ZIP.
2. Apply and verify `schema.sql` in Supabase.
3. Test sign-up, sign-in, per-user isolation, document uploads and deletion.
4. Configure authentication redirect URLs.
5. Deploy from GitHub to Vercel.
