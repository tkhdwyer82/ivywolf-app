-- Job B.2 (Home v4, Figma 1737:2): flat project hues, and a reference picture for every idea that has no picture of its own.
--
--   projects.hue             coral | sage | butter | slate, assigned as projects are made, cycling in that order; My
--                            things is always cool-grey. The hue is a card's fallback block while a picture is found,
--                            the chip's underline, and the project's swatch. Ink text on every hue. Replaces the
--                            gradients (0034) everywhere they were drawn; projects.gradient and its trigger stay, unread.
--   cards.reference_picture  The first free reference for the card (findReferences(card, {limit: 1})), stored so Home
--                            doesn't search on every open: {source, id, url, thumb_url, link_url, credit: {name, url},
--                            width, height, track_url?}. Unsplash or Pixabay only, never Pinterest (its terms: pins are
--                            never stored). Shown only when the card has no picture of its own and no Unsplash photo.
--                            The image itself is never copied: url is the provider's (Unsplash hotlinking rules).

-- ── Hues ────────────────────────────────────────────────────────────────────────────────────────────────────────

create function project_hues() returns text[]
language sql
immutable
as $$
  select array['coral', 'sage', 'butter', 'slate'];
$$;

alter table projects add column hue text check (hue = any (project_hues()) or hue = 'cool-grey');

-- My things is cool-grey. Anything else takes the next hue for its creator: how many of her projects already wear
-- one of the four, round the four. A multi-row insert sees the rows before it in the same statement (as 0034's does).
create function assign_project_hue() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'things' then
    new.hue := 'cool-grey';
  elsif new.hue is null then
    new.hue := (project_hues())[
      (select count(*) from projects where creator_id = new.creator_id and kind <> 'things') % array_length(project_hues(), 1) + 1
    ];
  end if;
  return new;
end;
$$;
revoke execute on function assign_project_hue() from public, anon, authenticated;

create trigger projects_assign_hue before insert on projects
  for each row execute function assign_project_hue();

-- Backfill: My things cool-grey; each creator's other projects in the order she made them.
update projects set hue = 'cool-grey' where kind = 'things';
update projects p
   set hue = (project_hues())[((o.n - 1) % array_length(project_hues(), 1)) + 1]
  from (
    select id, row_number() over (partition by creator_id order by created_at, is_default desc, id) as n
      from projects
     where kind <> 'things'
  ) o
 where o.id = p.id;

alter table projects alter column hue set not null;

-- ── Reference pictures ──────────────────────────────────────────────────────────────────────────────────────────

alter table cards add column reference_picture jsonb
  check (reference_picture is null or (reference_picture ->> 'source') in ('unsplash', 'pixabay'));
