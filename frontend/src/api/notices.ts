import * as db from "../mocks/db";
import type { SupplierNotice } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export async function getSupplierNotices(supplierId: string): Promise<SupplierNotice[]> {
  if (USE_MOCKS) return Promise.resolve(db.getSupplierNotices(supplierId));

  // Real backend does not exist yet. Defaulting to mock.
  return Promise.resolve(db.getSupplierNotices(supplierId));
}

export async function addSupplierNotice(supplierId: string, title: string, message: string): Promise<SupplierNotice> {
  if (USE_MOCKS) return Promise.resolve(db.addSupplierNotice(supplierId, title, message));

  // Real backend does not exist yet. Defaulting to mock.
  return Promise.resolve(db.addSupplierNotice(supplierId, title, message));
}

export async function markSupplierNoticeAsRead(noticeId: string): Promise<void> {
  if (USE_MOCKS) return Promise.resolve(db.markSupplierNoticeAsRead(noticeId));

  // Real backend does not exist yet. Defaulting to mock.
  return Promise.resolve(db.markSupplierNoticeAsRead(noticeId));
}
