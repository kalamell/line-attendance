import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, attendanceRecords, officeLocations, users } from '@poszee/db';

const LATE_CUTOFF_MIN = 9 * 60; // 09:00 — TODO: per-tenant shift config

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const todayStr = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class AttendanceService {
  async checkIn(tenantId: string, userId: string, lat: number, lng: number) {
    let offices = await db.select().from(officeLocations).where(eq(officeLocations.tenantId, tenantId));
    // if the employee is assigned to a specific site, only that site's geofence applies
    const [u] = await db.select({ officeId: users.officeId }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.officeId) offices = offices.filter((o) => o.id === u.officeId);
    if (offices.length === 0) throw new BadRequestException('ยังไม่ได้ตั้งค่าสถานที่ปฏิบัติงาน กรุณาติดต่อฝ่ายบุคคล');
    const office = offices.find((o) => haversineMeters(lat, lng, o.lat, o.lng) <= o.radiusM);
    if (!office) throw new BadRequestException('อยู่นอกพื้นที่ทำงาน');

    const now = new Date();
    const late = now.getHours() * 60 + now.getMinutes() > LATE_CUTOFF_MIN;

    const [rec] = await db
      .insert(attendanceRecords)
      .values({
        tenantId,
        userId,
        workDate: todayStr(),
        checkInAt: now,
        checkInLat: lat,
        checkInLng: lng,
        officeId: office.id,
        status: late ? 'late' : 'present',
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.userId, attendanceRecords.workDate],
        set: { checkInAt: now, checkInLat: lat, checkInLng: lng, officeId: office.id, status: late ? 'late' : 'present' },
      })
      .returning();

    return rec;
  }

  async checkOut(tenantId: string, userId: string) {
    const [rec] = await db
      .update(attendanceRecords)
      .set({ checkOutAt: new Date() })
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.workDate, todayStr()),
        ),
      )
      .returning();
    if (!rec) throw new BadRequestException('ยังไม่ได้เช็คอินวันนี้');
    return rec;
  }

  history(tenantId: string, userId: string, limit = 30) {
    return db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.userId, userId)))
      .orderBy(desc(attendanceRecords.workDate))
      .limit(limit);
  }

  /** Real home stats: hours worked this ISO week + late count this month. */
  async summary(tenantId: string, userId: string) {
    const recs = await this.history(tenantId, userId, 200);
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Monday=0
    const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(now.getDate() - day);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let weekMs = 0; let lateThisMonth = 0;
    for (const r of recs) {
      if (r.status === 'late' && (r.workDate ?? '').startsWith(monthKey)) lateThisMonth++;
      if (r.checkInAt && r.checkOutAt && new Date(r.workDate) >= weekStart) {
        weekMs += new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime();
      }
    }
    return { weekHours: Math.round((weekMs / 3600000) * 10) / 10, lateThisMonth };
  }

  listOffices(tenantId: string) {
    return db.select().from(officeLocations).where(eq(officeLocations.tenantId, tenantId)).orderBy(officeLocations.createdAt);
  }

  async createOffice(tenantId: string, dto: { name?: string; lat: number; lng: number; radiusM: number }) {
    const existing = await this.listOffices(tenantId);
    const [o] = await db
      .insert(officeLocations)
      .values({ tenantId, name: dto.name || 'สาขา', lat: dto.lat, lng: dto.lng, radiusM: dto.radiusM, isDefault: existing.length === 0 })
      .returning();
    return o;
  }

  /** Mark one site as the tenant default (new employees inherit it). */
  async setDefaultOffice(tenantId: string, id: string) {
    await db.update(officeLocations).set({ isDefault: false }).where(eq(officeLocations.tenantId, tenantId));
    const [o] = await db.update(officeLocations).set({ isDefault: true }).where(and(eq(officeLocations.tenantId, tenantId), eq(officeLocations.id, id))).returning();
    if (!o) throw new BadRequestException('ไม่พบสถานที่');
    return { ok: true };
  }

  async defaultOfficeId(tenantId: string): Promise<string | null> {
    const [d] = await db.select({ id: officeLocations.id }).from(officeLocations).where(and(eq(officeLocations.tenantId, tenantId), eq(officeLocations.isDefault, true))).limit(1);
    return d?.id ?? null;
  }

  async updateOffice(tenantId: string, id: string, dto: { name?: string; lat: number; lng: number; radiusM: number }) {
    const [o] = await db
      .update(officeLocations)
      .set({ name: dto.name || undefined, lat: dto.lat, lng: dto.lng, radiusM: dto.radiusM })
      .where(and(eq(officeLocations.tenantId, tenantId), eq(officeLocations.id, id)))
      .returning();
    if (!o) throw new BadRequestException('ไม่พบสถานที่');
    return o;
  }

  async removeOffice(tenantId: string, id: string) {
    await db.delete(officeLocations).where(and(eq(officeLocations.tenantId, tenantId), eq(officeLocations.id, id)));
    return { ok: true };
  }

  async today(tenantId: string, userId: string) {
    const [rec] = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.workDate, todayStr()),
        ),
      )
      .limit(1);
    return rec ?? null;
  }
}
