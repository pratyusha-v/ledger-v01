-- Demo transfers showed "[School name]" placeholders on the dashboard; give them
-- (made-up) school names instead.
update transfers set from_place = 'Greenfield Public School, Guntur' where from_place = '[School name]';
update transfers set to_place = 'Riverside High School, Vijayawada' where to_place = '[School name]';
