import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@wtp/database";
import type { Prisma } from "@wtp/database";

type NoticeInput = { title?: unknown; content?: unknown; target?: unknown };
type TemplateInput = { name?: unknown; title?: unknown; content?: unknown };

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateNotice(input: NoticeInput) {
  const title = cleanText(input.title, 180);
  const content = cleanText(input.content, 5000);
  const target = input.target === "ACTIVE" ? "ACTIVE" : input.target === "ALL" ? "ALL" : "";
  if (!title) throw new BadRequestException("通知标题不能为空。");
  if (!content) throw new BadRequestException("通知内容不能为空。");
  if (!target) throw new BadRequestException("通知范围无效，请选择全部用户或正常用户。");
  return { title, content, target };
}

function validateTemplate(input: TemplateInput) {
  const name = cleanText(input.name, 160);
  const title = cleanText(input.title, 180);
  const content = cleanText(input.content, 5000);
  if (!name) throw new BadRequestException("模板名称不能为空。");
  if (!title) throw new BadRequestException("通知标题不能为空。");
  if (!content) throw new BadRequestException("通知内容不能为空。");
  return { name, title, content };
}

@Injectable()
export class NotificationsService {
  async list(input: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const keyword = input.keyword?.trim() ?? "";
    const allowed = ["DRAFT", "PUBLISHED", "DISABLED"];
    const where: Prisma.AdminNotificationWhereInput = {};
    if (input.status && input.status !== "ALL" && allowed.includes(input.status)) {
      where.status = input.status;
    }
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: "insensitive" } },
        { content: { contains: keyword, mode: "insensitive" } },
      ];
    }
    const [total, notices, allCount, draftCount, publishedCount, disabledCount, recipientCount] = await prisma.$transaction([
      prisma.adminNotification.count({ where }),
      prisma.adminNotification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adminNotification.count(),
      prisma.adminNotification.count({ where: { status: "DRAFT" } }),
      prisma.adminNotification.count({ where: { status: "PUBLISHED" } }),
      prisma.adminNotification.count({ where: { status: "DISABLED" } }),
      prisma.adminNotification.aggregate({ where: { status: "PUBLISHED" }, _sum: { recipientCount: true } }),
    ]);
    return {
      items: notices.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        target: item.target,
        status: item.status,
        recipientCount: item.recipientCount,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        publishedAt: item.publishedAt?.toISOString() ?? null,
        disabledAt: item.disabledAt?.toISOString() ?? null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      stats: {
        total: allCount,
        draft: draftCount,
        published: publishedCount,
        disabled: disabledCount,
        publishedAudience: recipientCount._sum.recipientCount ?? 0,
      },
      deliveryMode: "IN_APP",
    };
  }

  async listRecords(input: { page?: number; pageSize?: number; keyword?: string }) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(input.pageSize) || 20)));
    const keyword = input.keyword?.trim() ?? "";
    const where: Prisma.AdminNotificationWhereInput = { publishedAt: { not: null } };
    if (keyword) where.AND = [
      { OR: [
        { title: { contains: keyword, mode: "insensitive" } },
        { content: { contains: keyword, mode: "insensitive" } },
      ] },
    ];
    const [total, notices] = await prisma.$transaction([
      prisma.adminNotification.count({ where }),
      prisma.adminNotification.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: notices.map((item) => ({
        id: item.id, title: item.title, content: item.content, target: item.target,
        status: item.status, recipientCount: item.recipientCount,
        createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
        publishedAt: item.publishedAt?.toISOString() ?? null, disabledAt: item.disabledAt?.toISOString() ?? null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      stats: { total, draft: 0, published: notices.filter((x) => x.status === "PUBLISHED").length, disabled: notices.filter((x) => x.status === "DISABLED").length, publishedAudience: notices.reduce((sum, item) => sum + item.recipientCount, 0) },
      deliveryMode: "IN_APP" as const,
    };
  }

  async create(input: NoticeInput, adminId: string) {
    const data = validateNotice(input);
    const notice = await prisma.adminNotification.create({
      data: { ...data, createdByAdminId: adminId },
    });
    await prisma.auditEvent.create({
      data: {
        actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_DRAFT_CREATED",
        targetType: "ADMIN_NOTIFICATION", targetId: notice.id,
        metadata: { title: notice.title, target: notice.target },
      },
    });
    return { success: true, item: notice };
  }

  async update(id: string, input: NoticeInput, adminId: string) {
    const data = validateNotice(input);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM admin_notifications WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.adminNotification.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("通知记录不存在。");
      if (existing.status !== "DRAFT") {
        throw new ConflictException("只有草稿通知可以编辑；已发布通知请停用后保留原发送记录。");
      }
      const updated = await tx.adminNotification.update({ where: { id }, data });
      await tx.auditEvent.create({
        data: {
          actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_DRAFT_UPDATED",
          targetType: "ADMIN_NOTIFICATION", targetId: id,
          metadata: { title: updated.title, target: updated.target },
        },
      });
      return { success: true, item: updated };
    });
  }

  async publish(id: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM admin_notifications WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.adminNotification.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("通知记录不存在。");
      if (existing.status !== "DRAFT") {
        throw new ConflictException("只有草稿通知可以发布，不能重复发布。");
      }
      const recipientCount = await tx.user.count({
        where: existing.target === "ACTIVE" ? { status: "ACTIVE" } : {},
      });
      const now = new Date();
      const updated = await tx.adminNotification.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          recipientCount,
          publishedByAdminId: adminId,
          publishedAt: now,
          disabledAt: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_PUBLISHED",
          targetType: "ADMIN_NOTIFICATION", targetId: id,
          metadata: { title: updated.title, target: updated.target, recipientCount },
        },
      });
      return {
        success: true,
        deliveryMode: "IN_APP",
        item: {
          id: updated.id,
          status: updated.status,
          recipientCount: updated.recipientCount,
          publishedAt: updated.publishedAt?.toISOString() ?? now.toISOString(),
        },
      };
    });
  }

  async disable(id: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM admin_notifications WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.adminNotification.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("通知记录不存在。");
      if (existing.status !== "PUBLISHED") throw new ConflictException("只有已发布的通知可以停用。");
      const updated = await tx.adminNotification.update({
        where: { id },
        data: { status: "DISABLED", disabledAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_DISABLED",
          targetType: "ADMIN_NOTIFICATION", targetId: id,
          metadata: { title: updated.title, recipientCount: updated.recipientCount },
        },
      });
      return { success: true, item: updated };
    });
  }

  async listTemplates(input: { keyword?: string; enabled?: string }) {
    const keyword = input.keyword?.trim() ?? "";
    const where: Prisma.NotificationTemplateWhereInput = {};
    if (input.enabled === "true") where.enabled = true;
    if (input.enabled === "false") where.enabled = false;
    if (keyword) where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { title: { contains: keyword, mode: "insensitive" } },
      { content: { contains: keyword, mode: "insensitive" } },
    ];
    const [items, total, enabledCount] = await prisma.$transaction([
      prisma.notificationTemplate.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }),
      prisma.notificationTemplate.count({ where }),
      prisma.notificationTemplate.count({ where: { enabled: true } }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id, name: item.name, title: item.title, content: item.content,
        enabled: item.enabled, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      })),
      total,
      enabledCount,
    };
  }

  async createTemplate(input: TemplateInput, adminId: string) {
    const data = validateTemplate(input);
    const item = await prisma.notificationTemplate.create({
      data: { ...data, createdByAdminId: adminId, updatedByAdminId: adminId },
    });
    await prisma.auditEvent.create({
      data: {
        actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_TEMPLATE_CREATED",
        targetType: "NOTIFICATION_TEMPLATE", targetId: item.id,
        metadata: { name: item.name },
      },
    });
    return { success: true, item };
  }

  async updateTemplate(id: string, input: TemplateInput, adminId: string) {
    const data = validateTemplate(input);
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("通知模板不存在。");
    const item = await prisma.notificationTemplate.update({
      where: { id },
      data: { ...data, updatedByAdminId: adminId },
    });
    await prisma.auditEvent.create({
      data: {
        actorType: "ADMIN", actorId: adminId, action: "APP_NOTICE_TEMPLATE_UPDATED",
        targetType: "NOTIFICATION_TEMPLATE", targetId: id,
        metadata: { name: item.name },
      },
    });
    return { success: true, item };
  }

  async toggleTemplate(id: string, enabled: boolean, adminId: string) {
    const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("通知模板不存在。");
    const item = await prisma.notificationTemplate.update({
      where: { id },
      data: { enabled, updatedByAdminId: adminId },
    });
    await prisma.auditEvent.create({
      data: {
        actorType: "ADMIN", actorId: adminId,
        action: enabled ? "APP_NOTICE_TEMPLATE_ENABLED" : "APP_NOTICE_TEMPLATE_DISABLED",
        targetType: "NOTIFICATION_TEMPLATE", targetId: id,
        metadata: { name: item.name },
      },
    });
    return { success: true, item };
  }

  async publicAnnouncements(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    const targetFilter = user?.status === "ACTIVE" ? ["ALL", "ACTIVE"] : ["ALL"];
    const notices = await prisma.adminNotification.findMany({
      where: { status: "PUBLISHED", target: { in: targetFilter } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { title: true, content: true },
    });
    return notices.map((item) => item.title ? item.title + "： " + item.content : item.content);
  }
}
