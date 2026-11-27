# Expanding the answer pools

Each personal question has a pool of answer options. Every player sees **6** of them
(4 regular + 2 humorous), a different six per player, so with a pool of ~30 the choices
feel fresh each game. The whole pool is also used for wrong answers in the quiz.

## Steps

1. `npx tsx scripts/export-answer-pools.ts 30` writes `answer-pools-to-expand.json`
   (already generated: 147 active questions, target 20 regular + 10 humorous each).
2. Give that file and the prompt below to a model. Large files: send ~25 questions at a time.
3. Save the reply as e.g. `expanded.json`, then
   `npx tsx scripts/import-answer-pools.ts expanded.json`
   (keeps existing options and ids, adds new ones, skips duplicates and anything over 40 characters).
4. `npx tsx scripts/build-setup-sql.ts`, re-run `neon-setup.sql` in Neon, then deploy.

## Prompt for the model

> You are expanding answer choices for a family party game. Players answer questions about
> themselves by picking from a short list, and friends later guess their answer.
>
> For each item in the JSON below, add `add_regular` new entries to `regular` and
> `add_humorous` new entries to `humorous`. Keep every existing entry unchanged.
>
> Rules:
> - Regular answers: real, common, believable answers a typical family member might give.
>   Varied (don't cluster on one sub-type), each clearly different from the others, no near
>   synonyms ("Pizza" vs "Pizza pie"), no brand names unless very common.
> - Humorous answers: light, family-friendly jokes that still read as an answer to the question.
>   Nothing mean, about bodies, money worries, alcohol, politics, religion or romance.
> - Max 40 characters each, Title-free sentence case like the existing entries, no emoji,
>   no trailing punctuation.
> - Seasonal questions (seasonal is not null) should stay on that season/holiday.
> - Return ONLY a JSON array with the same objects and fields (id, category, question, seasonal,
>   regular, humorous). The add_* fields may be omitted. No commentary.
