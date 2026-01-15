import type { PageLoad } from './$types';

type ExpectedStats = {
  matched: number;
  pending: number;
  total: number;
};

type FileStats = {
  uploaded: number;
  processed: number;
  total: number;
};

type DashboardData = {
  expected: ExpectedStats;
  files: FileStats;
  linkedInvoices: number;
};

const emptyExpected: ExpectedStats = {
  matched: 0,
  pending: 0,
  total: 0,
};

const emptyFiles: FileStats = {
  uploaded: 0,
  processed: 0,
  total: 0,
};

export const load: PageLoad = async ({ fetch }) => {
  const [expectedRes, filesRes, knownRes] = await Promise.all([
    fetch('/api/expected-invoices'),
    fetch('/api/files'),
    fetch('/api/invoices-known'),
  ]);

  let expected = emptyExpected;
  let files = emptyFiles;
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
    if (filesRes.ok) {
      const data = (await filesRes.json()) as any;
      const stats = data?.stats || {};
      files = {
        uploaded: stats.uploaded ?? 0,
        processed: stats.processed ?? 0,
        total: stats.total ?? 0,
      } satisfies FileStats;
    }
  } catch (error) {
    console.error('Dashboard load files error', error);
  }

  try {
    if (knownRes.ok) {
      const data = (await knownRes.json()) as any;
      const items = data?.items || [];
      linkedInvoices = items.filter(
        (item: any) => item?.expectedInvoiceId != null || item?.fileId != null
      ).length;
    }
  } catch (error) {
    console.error('Dashboard load invoices-known error', error);
  }

  const stats: DashboardData = {
    expected,
    files,
    linkedInvoices,
  };

  return { stats };
};
