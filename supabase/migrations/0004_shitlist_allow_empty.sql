-- Migration 0004: allow empty Shitlist item text.
--
-- The fluid Apple-Notes-style editor creates an empty item first, then you type into it (and an
-- item you clear stays as an empty bullet until you backspace it away). So the text length floor
-- of 1 from 0002 no longer holds; only the 500-char ceiling remains.

alter table public.shitlist_items drop constraint if exists shitlist_items_text_check;

alter table public.shitlist_items
  add constraint shitlist_items_text_check check (char_length(text) <= 500);
