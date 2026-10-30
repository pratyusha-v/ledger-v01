-- The school runs up to Grade 12.
insert into grade_levels (name, position)
select v.name, v.position from (values ('Grade 11', 11), ('Grade 12', 12)) as v(name, position)
where not exists (select 1 from grade_levels g where g.name = v.name);
