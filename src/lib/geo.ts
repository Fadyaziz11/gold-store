export type Coords = { lat: number; lng: number; accuracy: number };

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("خدمة تحديد الموقع غير متاحة على هذا الجهاز."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED)
          reject(new Error("تم رفض إذن الوصول للموقع. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة."));
        else if (err.code === err.POSITION_UNAVAILABLE)
          reject(new Error("تعذر تحديد موقعك الحالي. تأكد من تفعيل GPS ثم أعد المحاولة."));
        else if (err.code === err.TIMEOUT)
          reject(new Error("انتهت مهلة تحديد الموقع. أعد المحاولة في مكان بإشارة أفضل."));
        else reject(new Error("حدث خطأ أثناء تحديد الموقع."));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}
