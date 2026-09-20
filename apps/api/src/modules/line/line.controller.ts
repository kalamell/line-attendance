import { Controller, Post, Get, Req, Headers, HttpCode } from '@nestjs/common';
import type { Request } from 'express';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { LineService } from './line.service';

@Controller('line')
export class LineController {
  constructor(private readonly line: LineService) {}

  /** Frontend LIFF fetches this (by tenant subdomain/header) before liff.init(). */
  @Get('config')
  config(@TenantId() tenantId: string) {
    return this.line.publicConfig(tenantId);
  }
  /**
   * Per-tenant webhook: LINE Developers points <sub>.poszee.com/api/line/webhook here.
   * TODO: verify `x-line-signature` (HMAC-SHA256 of the raw body with the tenant's
   * channel secret) before trusting events — needs the raw body buffer.
   */
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @TenantId(false) tenantId: string | null,
    @Headers('x-line-signature') _signature: string,
    @Req() req: Request,
  ) {
    const events = (req.body as { events?: unknown[] })?.events ?? [];
    // eslint-disable-next-line no-console
    console.log(`[line] tenant=${tenantId} events=${events.length}`);
    return { ok: true };
  }
}
