import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as argon2 from "argon2";
import { prisma } from "@wtp/database";

const ADMIN_SESSION_HOURS = 8;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AdminAuthService {
  async bootstrap(bootstrapToken: string, emailInput: string, password: string) {
    if (password.length < 10 || password.length > 128) {
      throw new UnauthorizedException("首次管理员密码必须为 10–128 个字符。");
    }

    const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!configuredToken) {
      throw new ServiceUnavailableException("尚未配置 ADMIN_BOOTSTRAP_TOKEN，暂不能初始化管理员。");
    }

    const supplied = Buffer.from(bootstrapToken);
    const expected = Buffer.from(configuredToken);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException("管理员初始化密钥不正确。");
    }

    const email = emailInput.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const admin = await prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(9137, 2401) AS locked`;
      if (!lock[0]?.locked) {
        throw new ConflictException("管理员初始化正在进行，请稍后重试。");
      }
      const count = await tx.adminUser.count();
      if (count > 0) {
        throw new ConflictException("管理员已经初始化，首次开通入口已关闭。");
      }
      return tx.adminUser.create({
        data: { email, passwordHash, status: "ACTIVE" },
        select: { id: true, email: true },
      });
    });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
    await prisma.adminSession.create({
      data: { adminUserId: admin.id, tokenHash: hashToken(token), expiresAt },
    });
    return { admin, token, expiresAt };
  }

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
