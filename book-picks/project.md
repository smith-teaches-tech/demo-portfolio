# Book Picks

## What the app does and who it's for
A shared board where anyone in our class can recommend one book and say why. Everyone sees every pick. It's for students who want something good to read next.

## Table
**book_picks**
- id: a number for each row (Supabase fills this in)
- title: the book's title
- author: who wrote it
- why: one or two sentences on why people should read it
- picked_by: the first name of the person who picked it
- added_at: when it was added (Supabase fills this in)

## Who can see what
- Anyone can read every pick.
- Anyone can add a pick.
- Nobody can edit or delete a pick from the app. Only the owner can, from the Supabase dashboard.

## Supabase setup
Run this in the Supabase SQL Editor:

```sql
create table book_picks (
  id bigint generated always as identity primary key,
  title text not null,
  author text not null,
  why text not null,
  picked_by text not null,
  added_at timestamptz default now()
);

alter table book_picks enable row level security;

create policy "Anyone can read"
on book_picks for select
to anon
using (true);

create policy "Anyone can add"
on book_picks for insert
to anon
with check (true);
```

## Code files
- index.html: everything. The page, the styles and the JavaScript are all in one file.

## Addresses
- Live: https://smith-teaches-tech.github.io/demo-portfolio/book-picks/
- Local (Live Server): http://127.0.0.1:5500/book-picks/

## Secrets
- None. The publishable key is in the code on purpose. It's safe because the policies decide what anyone can do.

## Where we are right now
The app works in demo mode. It isn't connected to Supabase yet, so picks disappear when you refresh.

## NOT doing, on purpose
- Accounts and sign-in (Build 2)
- Editing or deleting picks
- Book covers or photos (Build 2)

## Next thing I want to add
Split index.html into three files: index.html, app.js and config.js.

## Change log
- 2026-10-04: Built the one-file version in demo mode.
