import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@wtp/database";

const SESSION_DAYS = 30;

function normalizePhone(input: string): string {
  const phone = input.replace(/[\s()+-]/g, "");
  if (!/^\d{8,15}$/.test(phone)) {
    throw new BadRequestException("请输入有效的国际手机号码，例如 25412345678。");
  }
  return phone;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createReferralCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}

@Injectable()
export class AuthService {
  private async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.authSession.create({
      data: { userId, refreshTokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }

  async register(input: { phone: string; password: string; inviteCode?: string }) {
    const phone = normalizePhone(input.phone);
    const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing) throw new ConflictException("该手机号码已经注册。");

    const inviterCode = input.inviteCode?.trim().toUpperCase();
    const inviter = inviterCode
      ? await prisma.user.findUnique({
          where: { referralCode: inviterCode },
          select: { id: true, ancestors: { select: { ancestorUserId: true, depth: true } } },
        })
      : null;
    if (inviterCode && !inviter) throw new BadRequestException("邀请码无效，请检查后重试。");

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const referralCode = createReferralCode();

    const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone,
            passwordHash,
            referralCode,
            status: "ACTIVE",
            profile: { create: { locale: "zh-CN", timezone: "UTC" } },
          },
          select: { id: true, phone: true, referralCode: true, status: true },
        });

        if (inviter) {
          await tx.referralEdge.create({
            data: { inviteeUserId: created.id, inviterUserId: inviter.id },
          });
          const ancestors = [
            { descendantUserId: created.id, ancestorUserId: inviter.id, depth: 1 },
            ...inviter.ancestors
              .filter((ancestor) => ancestor.depth < 3)
              .map((ancestor) => ({
                descendantUserId: created.id,
                ancestorUserId: ancestor.ancestorUserId,
                depth: ancestor.depth + 1,
              })),
          ];
          await tx.referralAncestor.createMany({ data: ancestors });
        }
        return created;
      }).catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          throw new ConflictException("手机号码或邀请码冲突，请重试。");
        }
        throw error;
      });

    const session = await this.createSession(user.id);
    return { user, ...session };
  }

  async login(input: { phone: string; password: string }) {
    const phone = normalizePhone(input.phone);
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, passwordHash: true, referralCode: true, status: true },
    });
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException("手机号码或密码错误。");
    }
    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("账户当前不可登录，请联系平台支持。");
    }
    const session = await this.createSession(user.id);
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return { user: publicUser, ...session };
  }

  async refresh(token: string) {
    const current = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashToken(token) },
      include: { user: { select: { id: true, phone: true, referralCode: true, status: true } } },
    });
    if (!current || current.revokedAt || current.expiresAt <= new Date() || current.user.status !== "ACTIVE") {
      throw new UnauthorizedException("登录会话已失效，请重新登录。");
    }
    const nextToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.authSession.update({ where: { id: current.id }, data: { revokedAt: new Date() } }),
      prisma.authSession.create({
        data: { userId: current.userId, refreshTokenHash: hashToken(nextToken), expiresAt },
      }),
    ]);
    return { user: current.user, token: nextToken, expiresAt };
  }

  async logout(token?: string) {
    if (!token) return;
    await prisma.authSession.updateMany({
      where: { refreshTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async updateProfile(token: string | undefined, input: { displayName?: string; locale?: string; timezone?: string }) {
    const user = await this.getCurrentUser(token);
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName: input.displayName?.trim() || null,
        locale: input.locale || "zh-CN",
        timezone: input.timezone || "UTC",
      },
      update: {
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() || null } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
      select: { displayName: true, locale: true, timezone: true },
    });
    return { ...user, profile };
  }

  async getCurrentUser(token?: string) {
    if (!token) throw new UnauthorizedException("请先登录。");
    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            referralCode: true,
            status: true,
            createdAt: true,
            profile: { select: { displayName: true, locale: true, timezone: true } },
          },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("登录会话已失效，请重新登录。");
    }
    return session.user;
  }
}
