-- The enum value must exist in its OWN committed transaction before use.
alter type public.interest_status add value if not exists 'MATCHED';
