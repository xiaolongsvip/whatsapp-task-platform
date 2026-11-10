import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "@wtp/database";
import { allocateAvailableNumbersToOldestPublishedTask } from "./task-slot-allocation";

const ALLOCATION_INTERVAL_MS = 60_000;

@Injectable()
export class TaskSlotAllocationWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  onModuleInit() {
    if (process.env.TASK_SLOT_ALLOCATION_WORKER_ENABLED === "false") return;
    this.timer = setInterval(() => { void this.runOnce(); }, ALLOCATION_INTERVAL_MS);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await prisma.$transaction((tx) => allocateAvailableNumbersToOldestPublishedTask(tx));
      const moved = result.allocatedCount + result.reassignedCount;
      if (moved > 0) {
        console.info("[task-slot-allocation] inventory assigned", {
          taskId: result.taskId,
          allocatedCount: result.allocatedCount,
          reassignedCount: result.reassignedCount,
        });
      }
    } catch (error) {
      console.error("[task-slot-allocation] scheduled allocation failed", error);
    } finally {
      this.running = false;
    }
  }
}
