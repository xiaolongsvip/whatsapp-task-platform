import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./auth.dto";

const COOKIE_NAME = "wtp_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

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

function clearSessionCookie(response: Response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(body);
    setSessionCookie(response, result.token);
    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body);
    setSessionCookie(response, result.token);
    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post("refresh")
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = readCookie(request, COOKIE_NAME);
    if (!token) return this.auth.getCurrentUser(undefined);
    const result = await this.auth.refresh(token);
    setSessionCookie(response, result.token);
    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readCookie(request, COOKIE_NAME));
    clearSessionCookie(response);
    return { success: true };
  }

  @Get("me")
  me(@Req() request: Request) {
    return this.auth.getCurrentUser(readCookie(request, COOKIE_NAME));
  }
}
