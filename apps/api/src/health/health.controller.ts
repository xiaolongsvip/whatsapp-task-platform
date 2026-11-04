import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check(): {
    status: "ok";
    service: "whatsapp-task-platform-api";
    timestamp: string;
  } {
    return {
      status: "ok",
      service: "whatsapp-task-platform-api",
      timestamp: new Date().toISOString(),
    };
  }
}
