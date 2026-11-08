import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@wtp/database";

function digest(userId: string, email: string, code: string): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new ServiceUnavailableException("请配置 EMAIL_VERIFICATION_SECRET（至少 32 个字符）。");
  return createHmac("sha256", secret).update(userId + "|" + email + "|" + code).digest("hex");
}

@Injectable()
export class EmailVerificationService {
  async send(userId: string, emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new BadRequestException("请输入有效的业务邮箱地址。");
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) throw new ServiceUnavailableException("邮箱验证服务尚未配置，请联系管理员。");
    const now = new Date();
    const recent = await prisma.emailVerificationChallenge.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } });
    if (recent >= 5) throw new BadRequestException("一小时内最多发送 5 次验证码，请稍后重试。");
    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    await prisma.$transaction(async tx => {
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, email, emailVerifiedAt: null },
        update: { email, emailVerifiedAt: null },
      });
      await tx.emailVerificationChallenge.create({ data: { userId, email, codeHash: digest(userId, email, code), expiresAt } });
    });
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "EasyEarn 业务邮箱验证码",
          html: `<div style="font-family:Arial,sans-serif"><h2>EasyEarn 邮箱验证</h2><p>您的验证码为：</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效，请勿向他人透露。</p></div>`,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException("验证码邮件发送失败，请检查邮件服务配置后重试。");
    }
    if (!response.ok) throw new ServiceUnavailableException("验证码邮件发送失败，请检查发件域名和邮件服务商配置。");
    return { success: true, email, expiresInSeconds: 600, message: "验证码已发送，请检查邮箱。" };
  }

  async verify(userId: string, emailInput: string, codeInput: string) {
    const email = emailInput.trim().toLowerCase();
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) throw new BadRequestException("请输入 6 位邮箱验证码。");
    const challenge = await prisma.emailVerificationChallenge.findFirst({
      where: { userId, email, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new BadRequestException("验证码不存在或已过期，请重新获取。");
    const supplied = Buffer.from(digest(userId, email, code), "hex");
    const expected = Buffer.from(challenge.codeHash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {\n      await prisma.emailVerificationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });\n      throw new BadRequestException("邮箱验证码不正确；最多允许尝试 5 次。");\n    }
    const verifiedAt = new Date();
    await prisma.$transaction(async tx => {
      await tx.emailVerificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: verifiedAt } });
      await tx.userProfile.update({ where: { userId }, data: { email, emailVerifiedAt: verifiedAt } });
    });
    return { success: true, email, verifiedAt: verifiedAt.toISOString() };
  }

  async requireVerified(userId: string) {
    const settings = await prisma.taskConfiguration.findUnique({ where: { key: "system.accountSecurity" }, select: { value: true } });
    const value = settings?.value && typeof settings.value === "object" && !Array.isArray(settings.value) ? settings.value as Record<string, unknown> : {};
    if (value.businessEmailVerification !== true) return;
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { email: true, emailVerifiedAt: true } });
    if (!profile?.email || !profile.emailVerifiedAt) throw new BadRequestException("当前平台已启用业务邮箱验证，请先绑定并验证邮箱后再继续。");
  }
}
