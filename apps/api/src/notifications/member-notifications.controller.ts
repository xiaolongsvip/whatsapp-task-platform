import { Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "./notifications.service";

function sessionToken(request: Request): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  const item = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("wtp_session="));
  return item ? decodeURIComponent(item.slice("wtp_session=".length)) : undefined;
}

@Controller("users/notifications")
export class MemberNotificationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("limit") limit?: string,
    @Query("beforePublishedAt") beforePublishedAt?: string,
    @Query("beforeId") beforeId?: string,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.notifications.listForMember(user.id, { limit, beforePublishedAt, beforeId });
  }

  @Patch(":id/read")
  async markRead(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.notifications.markMemberNotificationRead(user.id, id);
  }

  @Post("read-all")
  async markAllRead(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.notifications.markAllMemberNotificationsRead(user.id);
  }
}
