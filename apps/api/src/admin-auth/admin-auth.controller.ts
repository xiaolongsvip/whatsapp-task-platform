import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthService } from "./admin-auth.service";
import { AdminBootstrapDto, AdminLoginDto } from "./admin-auth.dto";

const COOKIE_NAME = "wtp_admin_session";
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000;

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

function setSessionCookie(response: Response, token: string) {
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

@Controller("admin-auth")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post("bootstrap")
  async bootstrap(@Body() body: AdminBootstrapDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.bootstrap(body.bootstrapToken, body.email, body.password);
    setSessionCookie(response, result.token);
    return { admin: result.admin, expiresAt: result.expiresAt };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  async login(@Body() body: AdminLoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.email, body.password);
    setSessionCookie(response, result.token);
    return { admin: result.admin, expiresAt: result.expiresAt };
  }

  @Get("me")
  async me(@Req() request: Request) {
    return this.auth.getCurrentAdmin(readCookie(request, COOKIE_NAME));
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readCookie(request, COOKIE_NAME));
    response.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return { success: true };
  }
}
