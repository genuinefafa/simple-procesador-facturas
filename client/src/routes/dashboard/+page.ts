import type { PageLoad } from './$types';

type ExpectedStats = {
  matched: number;
  pending: number;
  total: number;
};

type PendingStats = {
  processed: number;
  pending: number;
  reviewing: number;
  failed: number;
  total: number;
};

type DashboardData = {
  expected: ExpectedStats;
  pendingFiles: PendingStats;
  linkedInvoices: number;
};

const emptyExpected: ExpectedStats = {
  matched: 0,
  pending: 0,
  total: 0,
};

const emptyPending: PendingStats = {
  processed: 0,
  pending: 0,
  reviewing: 0,
  failed: 0,
  total: 0,
};

export const load: PageLoad = async ({ fetch }) => {
  const [expectedRes, pendingRes, knownRes] = await Promise.all([
    fetch('/api/expected-invoices'),
    fetch('/api/pending-files'),
    fetch('/api/invoices-known'),
  ]);

  let expected = emptyExpected;
  let pendingFiles = emptyPending;
  let linkedInvoices = 0;

  try {
    if (expectedRes.ok) {
      const data = (await expectedRes.json()) as any;
      const stats = data?.stats || {};
      expected = {
        matched: stats.matched ?? 0,
        pending: stats.pending ?? 0,
        total: data?.total ?? 0,
      } satisfies ExpectedStats;
    }
  } catch (error) {
    console.error('Dashboard load expected invoices error', error);
  }

  try {
    if (pendingRes.ok) {
      const data = (await pendingRes.json()) as any;
      const stats = data?.stats || {};
      pendingFiles = {
        processed: stats.processed ?? 0,
        pending: stats.pending ?? 0,
        reviewing: stats.reviewing ?? 0,
        failed: stats.failed ?? 0,
        total: stats.total ?? 0,
      } satisfies PendingStats;
    }
  } catch (error) {
    console.error('Dashboard load pending files error', error);
  }

  try {
    if (knownRes.ok) {
      const data = (await knownRes.json()) as any;
      const items = data?.items || [];
      linkedInvoices = items.filter(
        (item: any) => item?.expectedInvoiceId != null || item?.pendingFileId != null
      ).length;
    }
  } catch (error) {
    console.error('Dashboard load invoices-known error', error);
  }

  const stats: DashboardData = {
    expected,
    pendingFiles,
    linkedInvoices,
  };

  return { stats };
};
