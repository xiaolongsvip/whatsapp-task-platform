import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { prisma } from "@wtp/database";

const ADMIN_SESSION_HOURS = 8;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AdminAuthService {
  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const admin = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, status: true },
    });

    if (
      !admin ||
      admin.status !== "ACTIVE" ||
      !(await argon2.verify(admin.passwordHash, password))
    ) {
      throw new UnauthorizedException("管理员邮箱或密码错误，或账号已停用。");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
    await prisma.adminSession.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });

    return {
      admin: { id: admin.id, email: admin.email },
      token,
      expiresAt,
    };
  }

  async getCurrentAdmin(token?: string) {
    if (!token) throw new UnauthorizedException("请先登录管理员账号。");

    const session = await prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        adminUser: {
          select: { id: true, email: true, status: true },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.adminUser.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException("管理员登录会话已失效，请重新登录。");
    }

    return {
      id: session.adminUser.id,
      email: session.adminUser.email,
    };
  }

  async logout(token?: string) {
    if (!token) return;
    await prisma.adminSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
