import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";

export type DeviceReport = { deviceIdentifier: string; manufacturer?: string; model: string; androidVersion?: string; sdkInt?: number; appVersion: string };

@Injectable()
export class UserDeviceService {
  async report(userId: string, body: DeviceReport) {
    const deviceIdentifier = body.deviceIdentifier?.trim();
    const model = body.model?.trim();
    const appVersion = body.appVersion?.trim();
    if (!deviceIdentifier || deviceIdentifier.length > 128 || !model || model.length > 120 || !appVersion || appVersion.length > 40) {
      throw new BadRequestException("设备标识、设备型号或 APP 版本无效。");
    }
    const manufacturer = body.manufacturer?.trim().slice(0, 80) || null;
    const androidVersion = body.androidVersion?.trim().slice(0, 40) || null;
    const sdkInt = Number.isInteger(body.sdkInt) ? body.sdkInt : null;
    const riskConfigRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.riskSettings" }, select: { value: true } });
    const riskConfig = riskConfigRow?.value && typeof riskConfigRow.value === "object" && !Array.isArray(riskConfigRow.value)
      ? riskConfigRow.value as Record<string, unknown> : {};
    if (riskConfig.singleDeviceSingleAccount === true) {
      const linkedToAnotherAccount = await prisma.userDevice.findFirst({
        where: { deviceIdentifier, userId: { not: userId }, status: "ACTIVE" },
        select: { id: true },
      });
      if (linkedToAnotherAccount) throw new ForbiddenException("此设备已绑定其他账号，当前风控设置不允许同一设备绑定多个账号。");
    }
    const blockedDevice = await prisma.userDevice.findFirst({ where: { deviceIdentifier, status: "BLOCKED" }, select: { id: true } });
    if (blockedDevice) throw new ForbiddenException("此设备已被管理员限制，请联系平台客服。");
    const existing = await prisma.userDevice.findUnique({ where: { userId_deviceIdentifier: { userId, deviceIdentifier } } });
    const changed = !!existing && (existing.model !== model || existing.manufacturer !== manufacturer || existing.androidVersion !== androidVersion || existing.sdkInt !== sdkInt || existing.appVersion !== appVersion);
    const device = await prisma.userDevice.upsert({
      where: { userId_deviceIdentifier: { userId, deviceIdentifier } },
      create: { userId, deviceIdentifier, manufacturer, model, androidVersion, sdkInt, appVersion },
      update: { manufacturer, model, androidVersion, sdkInt, appVersion, lastSeenAt: new Date() },
    });
    if (!existing || changed) {
      await prisma.userDeviceEvent.create({ data: {
        deviceId: device.id, eventType: existing ? "DEVICE_CHANGED" : "DEVICE_REGISTERED",
        manufacturer, model, androidVersion, sdkInt, appVersion,
      } });
    }
    return { success: true, deviceId: device.id, changed };
  }
}
