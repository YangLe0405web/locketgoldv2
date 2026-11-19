/**
 * Locket Gold VIP - RevenueCat Unlock
 * Tác giả: Lê Hoàng Giang
 * Github: https://github.com/YangLe0405web/locketgoldv2
 * Email: lehoanggiang0405@gmail.com
 */

const purchaseDate = "2024-05-18T08:30:00Z";
const expiresDate = "2099-12-31T23:59:59Z";

let obj = {};
try {
  obj = JSON.parse($response.body);
} catch (e) {
  obj = {};
}

obj["Attention"] = "Locket Gold VIP - Kích hoạt thành công bởi Lê Hoàng Giang (YangLe0405web)!";

const subData = {
  "auto_resume_date": null,
  "display_name": "locket_1600_1y",
  "is_sandbox": false,
  "ownership_type": "PURCHASED",
  "billing_issues_detected_at": null,
  "management_url": "https://apps.apple.com/account/subscriptions",
  "period_type": "normal",
  "price": {
    "amount": 399000,
    "currency": "VND"
  },
  "expires_date": expiresDate,
  "grace_period_expires_date": null,
  "refunded_at": null,
  "unsubscribe_detected_at": null,
  "original_purchase_date": purchaseDate,
  "purchase_date": purchaseDate,
  "store": "app_store",
  "store_transaction_id": "2000001108724193"
};

const entitlementData = {
  "grace_period_expires_date": null,
  "purchase_date": purchaseDate,
  "original_purchase_date": purchaseDate,
  "product_identifier": "locket_1600_1y",
  "expires_date": expiresDate,
  "ownership_type": "PURCHASED",
  "store": "app_store"
};

obj.subscriber = obj.subscriber || {};
obj.subscriber.first_seen = purchaseDate;
obj.subscriber.original_purchase_date = purchaseDate;
obj.subscriber.management_url = "https://apps.apple.com/account/subscriptions";
obj.subscriber.subscriptions = obj.subscriber.subscriptions || {};
obj.subscriber.entitlements = obj.subscriber.entitlements || {};

obj.subscriber.subscriptions["locket_1600_1y"] = subData;
obj.subscriber.entitlements["Gold"] = entitlementData;
obj.subscriber.entitlements["pro"] = entitlementData;
obj.subscriber.entitlements["vip"] = entitlementData;

// Gửi thông báo đẩy iOS chúc mừng và cảm ơn từ GiangDev
if (typeof $notification !== "undefined") {
  $notification.post(
    "🎉 GiangDev - Locket Gold VIP",
    "Kích hoạt Gold + Full Filter thành công!",
    "Cảm ơn bạn đã nâng cấp dịch vụ của GiangDev. Chúc bạn có trải nghiệm tuyệt vời! (t.me/Giangdev_it)"
  );
}

$done({ body: JSON.stringify(obj) });
