// Listing observations and detailed court observations remain separate in storage.
// A later detail capture enriches the same CNR without creating a duplicate UI row.
export function mergePortfolio(details, listings) {
  const result = new Map(
    listings.map((row) => [
      row.cnr,
      {
        ...row,
        data: row.data,
        hasDetails: false,
        last_checked_at: null,
        last_listed_at: row.last_seen_at,
      },
    ]),
  );
  for (const row of details) {
    const listing = result.get(row.cnr);
    result.set(row.cnr, {
      ...row,
      data: { ...(listing?.data || {}), ...row.data },
      hasDetails: true,
      last_listed_at: listing?.last_listed_at,
    });
  }
  return [...result.values()].sort(
    (a, b) =>
      Date.parse(b.last_checked_at || b.last_listed_at) -
      Date.parse(a.last_checked_at || a.last_listed_at),
  );
}
