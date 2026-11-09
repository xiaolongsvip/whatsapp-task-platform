import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@wtp/database";

type RateSnapshot = {
  base: string;
  rates: Record<string, number>;
  source: string;
  fetchedAt: string;
  providerUpdatedAt: string;
  effectiveAt: Record<string, string>;
  staleCurrencies: Record<string, boolean>;
  marketSession: string | null;
  stale: boolean;
};

const CACHE_KEY = "system.exchangeRates.latest";
const MAX_CACHE_AGE_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = process.env.EXCHANGERATE_DEV_RATE_MODE?.trim().toLowerCase() === "live" ? 60 * 1000 : 10 * 60 * 1000;
const MAX_PROVIDER_AGE_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class ExchangeRatesService {
  private cached: RateSnapshot | null = null;

  private providerDateIsFresh(snapshot: RateSnapshot): boolean {
    const updatedAt = Date.parse(snapshot.providerUpdatedAt);
    const age = Date.now() - updatedAt;
    return Number.isFinite(updatedAt) && age >= -5 * 60 * 1000 && age <= MAX_PROVIDER_AGE_MS;
  }

  private valid(snapshot: any): snapshot is RateSnapshot {
    const mode = process.env.EXCHANGERATE_DEV_RATE_MODE?.trim().toLowerCase() === "live" ? "live" : "15m-delayed";
    return Boolean(snapshot && snapshot.base === "USD" && snapshot.rates &&
      typeof snapshot.rates === "object" && snapshot.fetchedAt &&
      Number.isFinite(Date.parse(snapshot.fetchedAt)) && snapshot.providerUpdatedAt &&
      typeof snapshot.source === "string" && snapshot.source.startsWith("exchangerate.dev/" + mode) &&
      this.providerDateIsFresh(snapshot));
  }

  async latest(force = false): Promise<RateSnapshot> {
    if (!force && this.cached && this.valid(this.cached) &&
      Date.now() - Date.parse(this.cached.fetchedAt) < REFRESH_INTERVAL_MS) {
      return { ...this.cached, stale: false };
    }
    if (!force) {
      const persisted = await prisma.taskConfiguration.findUnique({ where: { key: CACHE_KEY }, select: { value: true } }).catch(() => null);
      if (this.valid(persisted?.value)) {
        const snapshot = persisted!.value as unknown as RateSnapshot;
        if (Date.now() - Date.parse(snapshot.fetchedAt) < REFRESH_INTERVAL_MS) {
          this.cached = snapshot;
          return { ...snapshot, stale: false };
        }
      }
    }
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      const apiKey = process.env.EXCHANGERATE_DEV_API_KEY?.trim();
      const liveMode = process.env.EXCHANGERATE_DEV_RATE_MODE?.trim().toLowerCase() === "live";
      if (liveMode && !apiKey) {
        throw new Error("Live exchange-rate mode requires EXCHANGERATE_DEV_API_KEY.");
      }
      if (apiKey) headers.authorization = "Bearer " + apiKey;
      const response = await fetch("https://api.exchangerate.dev/v1/latest/USD", {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Exchange rate provider returned HTTP " + response.status);
      const payload = await response.json() as {
        result?: string; base?: string; source?: string; timestamp?: string;
        data_updated_at?: string; effective_at?: Record<string, string>;
        market_session?: string; rates?: Record<string, number>; stale?: Record<string, boolean>;
      };
      const providerUpdatedAt = payload.data_updated_at ?? payload.timestamp ?? "";
      if (payload.base !== "USD" || !payload.rates || !providerUpdatedAt || !Number.isFinite(Date.parse(providerUpdatedAt))) {
        throw new Error("Exchange rate provider returned an invalid response.");
      }
      const rates: Record<string, number> = {};
      for (const [code, value] of Object.entries(payload.rates)) {
        if (/^[A-Z]{3}$/.test(code) && Number.isFinite(value) && value > 0) rates[code] = value;
      }
      const snapshot: RateSnapshot = {
        base: "USD",
        rates,
        source: "exchangerate.dev/" + (process.env.EXCHANGERATE_DEV_RATE_MODE?.trim().toLowerCase() === "live" ? "live" : "15m-delayed"),
        fetchedAt: new Date().toISOString(),
        providerUpdatedAt,
        effectiveAt: payload.effective_at ?? {},
        staleCurrencies: payload.stale ?? {},
        marketSession: payload.market_session ?? null,
        stale: false,
      };
      if (!this.providerDateIsFresh(snapshot)) {
        throw new Error("Exchange rate provider observation is outside the permitted freshness window.");
      }
      this.cached = snapshot;
      await prisma.taskConfiguration.upsert({
        where: { key: CACHE_KEY },
        create: { key: CACHE_KEY, value: snapshot as any },
        update: { value: snapshot as any },
      });
      return snapshot;
    } catch (error) {
      const stored = await prisma.taskConfiguration.findUnique({ where: { key: CACHE_KEY }, select: { value: true } }).catch(() => null);
      const snapshot = this.valid(stored?.value) ? stored!.value as unknown as RateSnapshot : this.cached;
      if (snapshot && this.providerDateIsFresh(snapshot) &&
        Date.now() - Date.parse(snapshot.fetchedAt) <= MAX_CACHE_AGE_MS) {
        this.cached = snapshot;
        return { ...snapshot, stale: true };
      }
      throw new BadRequestException("当前无法获取足够新鲜的汇率，请稍后重试；系统不会使用过期汇率创建跨币种提现。");
    }
  }

  async manualRates() {
    const row = await prisma.taskConfiguration.findUnique({ where: { key: "system.exchangeRates.manual" }, select: { value: true } });
    const value = row?.value as any;
    return { items: Array.isArray(value?.items) ? value.items : [] };
  }

  async setManualRate(input: { from: string; to: string; rate: number; validUntil?: string | null; note?: string }, adminId: string) {
    const from = String(input.from ?? "").trim().toUpperCase();
    const to = String(input.to ?? "").trim().toUpperCase();
    const rate = Number(input.rate);
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
      throw new BadRequestException("请填写不同的三位 ISO 货币代码。");
    }
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000000) {
      throw new BadRequestException("汇率必须是大于零的有效数字。");
    }
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil.getTime() <= Date.now())) {
      throw new BadRequestException("手动汇率有效期必须晚于当前时间。");
    }
    const row = await prisma.taskConfiguration.findUnique({ where: { key: "system.exchangeRates.manual" }, select: { value: true } });
    const current = row?.value as any;
    const items = Array.isArray(current?.items) ? [...current.items] : [];
    const item = { id: from + "_" + to, from, to, rate, source: "MANUAL_ADMIN", updatedAt: new Date().toISOString(), validUntil: validUntil?.toISOString() ?? null, note: String(input.note ?? "").trim().slice(0, 300), updatedBy: adminId, enabled: true };
    const index = items.findIndex((x: any) => String(x.from).toUpperCase() === from && String(x.to).toUpperCase() === to);
    if (index >= 0) items[index] = item; else items.unshift(item);
    await prisma.taskConfiguration.upsert({
      where: { key: "system.exchangeRates.manual" },
      create: { key: "system.exchangeRates.manual", value: { items } as any },
      update: { value: { items } as any },
    });
    await prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "MANUAL_EXCHANGE_RATE_UPDATED", targetType: "SYSTEM_SETTING", targetId: item.id, metadata: { from, to, rate, validUntil: item.validUntil, note: item.note } } });
    return item;
  }

  async disableManualRate(fromInput: string, toInput: string, adminId: string) {
    const from = String(fromInput ?? "").trim().toUpperCase(), to = String(toInput ?? "").trim().toUpperCase();
    const row = await prisma.taskConfiguration.findUnique({ where: { key: "system.exchangeRates.manual" }, select: { value: true } });
    const current = row?.value as any;
    const items = Array.isArray(current?.items) ? [...current.items] : [];
    const item = items.find((x: any) => String(x.from).toUpperCase() === from && String(x.to).toUpperCase() === to);
    if (!item) throw new BadRequestException("指定的手动汇率不存在。");
    item.enabled = false;
    item.disabledAt = new Date().toISOString();
    await prisma.taskConfiguration.upsert({ where: { key: "system.exchangeRates.manual" }, create: { key: "system.exchangeRates.manual", value: { items } as any }, update: { value: { items } as any } });
    await prisma.auditEvent.create({ data: { actorType: "ADMIN", actorId: adminId, action: "MANUAL_EXCHANGE_RATE_DISABLED", targetType: "SYSTEM_SETTING", targetId: from + "_" + to, metadata: { from, to } } });
    return { from, to, enabled: false };
  }

  async getRate(fromInput: string, toInput: string) {
    const from = fromInput.trim().toUpperCase(), to = toInput.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      throw new BadRequestException("Invalid currency pair.");
    }
    if (from === to) {
      return {
        rate: 1, source: "IDENTITY", fetchedAt: new Date().toISOString(),
        providerUpdatedAt: null, effectiveAt: null, marketSession: null, stale: false,
      };
    }
    const manualRow = await prisma.taskConfiguration.findUnique({ where: { key: "system.exchangeRates.manual" }, select: { value: true } });
    const manualItems = Array.isArray((manualRow?.value as any)?.items) ? (manualRow!.value as any).items as Array<Record<string, any>> : [];
    const manual = manualItems.find(item =>
      item.enabled !== false &&
      String(item.from ?? "").trim().toUpperCase() === from &&
      String(item.to ?? "").trim().toUpperCase() === to
    );
    if (manual) {
      const validUntil = manual.validUntil ? Date.parse(String(manual.validUntil)) : null;
      if (validUntil !== null && (!Number.isFinite(validUntil) || validUntil <= Date.now())) {
        throw new BadRequestException("管理员设置的手动汇率已过期，请更新汇率后再提交提现。");
      }
      const rate = Number(manual.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new BadRequestException("管理员设置的手动汇率无效。");
      return {
        rate, source: "MANUAL_ADMIN", fetchedAt: String(manual.updatedAt ?? new Date().toISOString()),
        providerUpdatedAt: null, effectiveAt: String(manual.updatedAt ?? new Date().toISOString()),
        marketSession: null, stale: false, manual: true, note: String(manual.note ?? ""),
      };
    }
    const snapshot = await this.latest();
    if (snapshot.stale) {
      throw new BadRequestException("汇率服务暂时不可用，缓存报价已过期；为避免错误到账金额，暂不能提交跨币种提现。");
    }
    const usdToFrom = from === "USD" ? 1 : snapshot.rates[from];
    const usdToTo = to === "USD" ? 1 : snapshot.rates[to];
    if (!Number.isFinite(usdToFrom) || usdToFrom <= 0 || !Number.isFinite(usdToTo) || usdToTo <= 0) {
      throw new BadRequestException("The exchange rate provider does not support " + from + "/" + to + ".");
    }
    if (snapshot.staleCurrencies[from] === true || snapshot.staleCurrencies[to] === true) {
      throw new BadRequestException("当前币种只有过期参考汇率，暂不能创建跨币种提现。");
    }
    const effectiveTimes = [from, to].filter(code => code !== "USD")
      .map(code => snapshot.effectiveAt[code]).filter(Boolean);
    const effectiveAt = effectiveTimes.length ? effectiveTimes.sort()[0] : snapshot.providerUpdatedAt;
    return {
      rate: usdToTo / usdToFrom,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      providerUpdatedAt: snapshot.providerUpdatedAt,
      effectiveAt,
      marketSession: snapshot.marketSession,
      stale: false,
    };
  }

  toPayoutMinor(amountMinor: bigint, from: string, to: string, rate: number): bigint {
    const digits = (code: string) => {
      try { return Math.max(0, new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2); }
      catch { return 2; }
    };
    const fromDigits = digits(from), toDigits = digits(to);
    const scaledRate = BigInt(rate.toFixed(12).replace(".", ""));
    const numerator = amountMinor * scaledRate * (10n ** BigInt(toDigits));
    const denominator = 1_000_000_000_000n * (10n ** BigInt(fromDigits));
    return (numerator + denominator / 2n) / denominator;
  }
}
