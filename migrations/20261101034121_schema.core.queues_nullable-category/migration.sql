ALTER TABLE "core"."Queue" ALTER COLUMN "category" DROP NOT NULL;
UPDATE "core"."Queue" SET "category" = NULL WHERE "category" = 0;