CREATE TABLE "admin_http_request_logs" (
  "id" UUID NOT NULL,
  "request_id" VARCHAR(100) NOT NULL,
  "admin_user_id" UUID,
  "method" VARCHAR(12) NOT NULL,
  "path" TEXT NOT NULL,
  "module" VARCHAR(100) NOT NULL,
  "action" TEXT NOT NULL,
  "target_id" VARCHAR(200),
  "ip_address" VARCHAR(100),
  "user_agent" TEXT,
  "status_code" INTEGER NOT NULL,
  "result" VARCHAR(20) NOT NULL,
  "error_code" VARCHAR(160),
  "request_data" JSONB,
  "response_data" JSONB,
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_http_request_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_http_request_logs_request_id_key" ON "admin_http_request_logs"("request_id");
CREATE INDEX "admin_http_request_logs_created_at_idx" ON "admin_http_request_logs"("created_at");
CREATE INDEX "admin_http_request_logs_admin_user_id_created_at_idx" ON "admin_http_request_logs"("admin_user_id","created_at");
CREATE INDEX "admin_http_request_logs_module_created_at_idx" ON "admin_http_request_logs"("module","created_at");
CREATE INDEX "admin_http_request_logs_result_created_at_idx" ON "admin_http_request_logs"("result","created_at");
