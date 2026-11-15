/**
 * Locket Gold VIP - Delete Cache & ETag Headers
 * Tác giả: Lê Hoàng Giang
 * Github: https://github.com/YangLe0405web/locketgoldv2
 */
const headers = Object.assign({}, $request.headers);
for (const key of Object.keys(headers)) {
  const lower = key.toLowerCase();
  if (lower === 'x-revenuecat-etag' || lower === 'if-none-match') {
    delete headers[key];
  }
}
$done({ headers });
