-- Run in SQL Editor as postgres: see ALL interests involving user's dogs (00003b36).
select
  sd.name as from_dog, ad.name as to_dog,
  i.status, i.strength, i.cooldown_until, i.created_at
from public.interests i
join public.dogs sd on sd.id = i.source_dog_id
join public.dogs ad on ad.id = i.target_dog_id
where sd.owner_id = '00003b36-2537-4add-a1fe-2d04e737bada'
   or ad.owner_id = '00003b36-2537-4add-a1fe-2d04e737bada'
order by i.created_at desc;
