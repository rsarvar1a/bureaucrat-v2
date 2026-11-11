-- Views spawned before `detach` stored their game-end subscription as a destroy;
-- an ended game now keeps its views' messages, controls stripped.
UPDATE "abc"."Subscription" SET "action" = 'detach' WHERE "action" = 'destroy' AND "contextLabel" LIKE 'game::%::ended';
