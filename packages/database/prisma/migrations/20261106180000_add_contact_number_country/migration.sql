ALTER TABLE "contact_numbers"
  ADD COLUMN "country_code" CHAR(2),
  ADD COLUMN "country_name" VARCHAR(100);

CREATE INDEX "contact_numbers_country_code_import_order_idx"
  ON "contact_numbers"("country_code", "import_order");
