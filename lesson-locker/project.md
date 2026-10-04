# Lesson Locker

## What the app does and who it's for
Teachers keep their lesson files (PDF, Word or PowerPoint) in one place, with a short note on each. For every lesson, the teacher decides who can see it: nobody else, specific teachers they choose by username, or every teacher who signs in. It's for teachers who want to stop emailing files around and share good lessons with the right people.

## Sign-in
- Two ways: "Sign in with GitHub", or email and password.
- Password rules (set in Supabase): at least 8 characters, with a lowercase letter, an uppercase letter and a number.
- Confirm email is OFF (Supabase's free email only reaches the project owner).
- GitHub users don't have a password in this app, so Settings tells them that instead of showing the change-password box.

## Tables
**profiles**: one row per teacher
- id: the teacher's user id (from Supabase sign-in)
- username: unique, 3 to 20 lowercase letters, numbers or underscores
- created_at: when they joined

**lessons**: one row per lesson, owned by one teacher
- id: a number for each lesson
- owner_id: the teacher who uploaded it
- title, subject, grade, note
- file_path: where the file is in the lesson-files bucket
- file_name: the file's original name
- visibility: private, people or everyone
- created_at: when it was added

**lesson_shares**: who a lesson is shared with (only used when visibility is "people")
- lesson_id: which lesson
- shared_with: which teacher

## Who can see what
- **Usernames:** any signed-in teacher can see usernames (so they can share). Nobody can see anyone else's email.
- **Private lesson:** only the owner can see it.
- **Shared with people:** the owner, plus each teacher on its share list.
- **Everyone:** any signed-in teacher.
- **Changing or deleting a lesson:** only the owner, whatever the visibility.
- **Share lists:** only the lesson's owner can add or remove people.
- **Signed out:** nothing at all.

## Buckets
**lesson-files**: private
- Allowed types: PDF, Word (.docx), PowerPoint (.pptx)
- Size limit: 10 MB per file
- Each teacher's files go in a folder named after their user id. Only they can upload to it or delete from it.
- A teacher can open a file if it's in their own folder, or if its lesson is shared with everyone or with them.
- Files open through a link that stops working after 60 seconds.

## Screens
1. Sign in: GitHub, or email and password
2. Pick a username: first sign-in only
3. My lessons: upload, open, delete, choose who can see each lesson, add or remove people
4. Shared with me: lessons other teachers have shared with me or with everyone
5. Settings: change password (email users only)

## Code files
- index.html: the page and its styles (HTML and CSS). Loads config.js, then app.js.
- app.js: everything the app does (JavaScript).
- config.js: only the Supabase URL and the publishable key.

## Rules for every chat
- This app uses exactly three code files: index.html, app.js, config.js. Do not create more.
- index.html contains the HTML and CSS, and loads config.js before app.js.
- config.js contains only the Supabase URL and the publishable key.
- When you change code, name the file and give me the whole file, not a snippet.
- Change nothing I did not ask you to change.
- Never put a secret key in any file.

## Addresses
- Live: https://smith-teaches-tech.github.io/demo-portfolio/lesson-locker/
- Local (Live Server): http://127.0.0.1:5500/lesson-locker/
- Supabase Site URL: https://smith-teaches-tech.github.io/demo-portfolio/
- Supabase Redirect URLs: http://127.0.0.1:5500/** and https://smith-teaches-tech.github.io/demo-portfolio/**

## Secrets
- GitHub client secret: in Supabase, under Authentication, GitHub sign-in settings. Never in code.
- Supabase secret key: not used anywhere in this app.
- (The publishable key in config.js is not a secret. Row-Level Security protects the data.)

## Supabase setup
Do these once, in this order.

1. **SQL Editor:** paste everything in the box below and click Run. It makes the three tables, the rules, the bucket and the bucket rules.
2. **Authentication → Sign In / Providers → Email:** turn Confirm email OFF. Set the minimum password length to 8 and require lowercase, uppercase and digits.
3. **GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App. Homepage URL: the live address. Callback URL: copy it from Supabase's GitHub provider page. Generate a client secret.
4. **Authentication → Sign In / Providers → GitHub:** turn it on, then paste the Client ID and client secret.
5. **Authentication → URL Configuration:** set the Site URL and both Redirect URLs from the Addresses section.
6. **config.js:** paste the project URL and publishable key (Project Settings → API Keys).

```sql
-- 1. Usernames
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz default now()
);

-- 2. Lessons
create table lessons (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null,
  subject text,
  grade text,
  note text,
  file_path text not null,
  file_name text not null,
  visibility text not null default 'private' check (visibility in ('private', 'people', 'everyone')),
  created_at timestamptz default now()
);

-- 3. Who each lesson is shared with (only used when visibility is 'people')
create table lesson_shares (
  lesson_id bigint references lessons(id) on delete cascade,
  shared_with uuid references profiles(id) on delete cascade,
  primary key (lesson_id, shared_with)
);

-- 4. Two helper checks. They look at the tables without triggering the rules again,
--    which stops the lessons rule and the lesson_shares rule from checking each other forever.
create function public.owns_lesson(lid bigint) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.lessons where id = lid and owner_id = auth.uid()) $$;

create function public.shared_with_me(lid bigint) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.lesson_shares where lesson_id = lid and shared_with = auth.uid()) $$;

-- 5. Turn on Row-Level Security
alter table profiles enable row level security;
alter table lessons enable row level security;
alter table lesson_shares enable row level security;

-- profiles: signed-in teachers can see usernames (so they can share). You can only make or change your own.
create policy "Signed-in users can see usernames" on profiles
  for select to authenticated using (true);
create policy "You can create your own profile" on profiles
  for insert to authenticated with check (id = auth.uid());
create policy "You can change your own profile" on profiles
  for update to authenticated using (id = auth.uid());

-- lessons: you see your own, anything shared with everyone, and anything shared with you.
create policy "See lessons you are allowed to see" on lessons
  for select to authenticated using (
    owner_id = auth.uid()
    or visibility = 'everyone'
    or (visibility = 'people' and public.shared_with_me(id))
  );
create policy "Add your own lessons" on lessons
  for insert to authenticated with check (owner_id = auth.uid());
create policy "Change your own lessons" on lessons
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Delete your own lessons" on lessons
  for delete to authenticated using (owner_id = auth.uid());

-- lesson_shares: the lesson's owner manages the list. You can see shares that name you.
create policy "See shares for your lessons or to you" on lesson_shares
  for select to authenticated using (public.owns_lesson(lesson_id) or shared_with = auth.uid());
create policy "Share your own lessons" on lesson_shares
  for insert to authenticated with check (public.owns_lesson(lesson_id));
create policy "Stop sharing your own lessons" on lesson_shares
  for delete to authenticated using (public.owns_lesson(lesson_id));

-- 6. The bucket: private, 10 MB, PDF / Word / PowerPoint only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-files', 'lesson-files', false, 10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
);

-- 7. Bucket rules. Each teacher's files live in a folder named after their user id.
create policy "Upload to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lesson-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Delete from your own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lesson-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Open files you are allowed to see" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-files' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.lessons l
        where l.file_path = objects.name
          and (l.visibility = 'everyone' or (l.visibility = 'people' and public.shared_with_me(l.id)))
      )
    )
  );
```

## Where we are right now
All three code files are written. Supabase isn't set up yet, so the app shows "Not connected to Supabase yet."

## NOT doing, on purpose
- Forgot-password and email confirmation (free Supabase email only reaches the owner)
- Editing a lesson's title or note after uploading (delete and re-upload instead)
- Previewing Word and PowerPoint files in the browser (they download; PDFs open)
- Searching or filtering the shared library (maybe later)
- Comments or ratings on lessons

## Next thing I want to add
Set up Supabase (the six steps above), then test with three accounts: one private lesson, one shared with one person, one shared with everyone.

## Change log
- 2026-10-04: Planned and built all three files. Supabase not connected yet.
