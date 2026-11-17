// Üyelik: 1 haftalık deneme → yıllık Standart üyelik (uygulamayı kullanmak için) → yıllık Pro üyelik (Pro özellikleri için).
// Burada yalnız saf mantık var; saklama, ekranlar ve satın alma app.js'tedir.
// Satın alma Google Play faturalandırmasıyla yapılacak. O bağlanana kadar BILLING_READY kapalıdır: hiçbir kilit çalışmaz, uygulama bugünkü
// gibi tamamen açıktır. Kilitli hâl yalnız yönetici önizlemesiyle (Ayarlar > Üyelik, yönetici açıkken) o cihazda denenir.

export const BILLING_READY = false;
export const TRIAL_DAYS = 7;
export const TRIAL_HAS_PRO = true; // deneme süresinde Pro özellikleri de açık: kullanıcı neyi satın alacağını görür
const DAY_MS = 86400000;

// Pro'ya bağlı özellikler. id, kodda needPro('id') ile sorulur.
export const PRO_FEATURES = [
  ['multi', 'Çoklu ekran', 'Aynı anda birden fazla kanal'],
  ['rec', 'Kayıt', 'Canlı yayını kaydet, zamanlı kayıt kur'],
  ['dl', 'İndirme', 'Film ve dizileri çevrimdışı izle'],
  ['sources', 'Birden fazla kaynak', 'İkinci ve sonraki listeleri ekle'],
  ['rows', 'Netflix görünümü', 'Yatay satırlar ve TV vitrini'],
  ['themes', 'Renkli temalar', 'Çok renkli uygulama temaları'],
  ['backup', 'Yedekleme', 'Yedekle, geri yükle, TV ile eşitle'],
  ['remind', 'Program hatırlatıcısı', 'Program ve maç başlamadan haber ver'],
  ['sportdetail', 'Spor ekranı detayı', 'Maç ayrıntıları, kadro ve istatistik'],
  ['seriesfollow', 'Dizi takibi', 'Takip ettiğin dizilerin yeni bölümleri'],
  ['teamfollow', 'Takım takibi', 'Takımının maçlarını kaçırma'],
  ['cast', 'TV’den oynatma ve kontrol', 'Telefondan TV’ye gönder, telefondan yönet'],
  ['tvlink', 'Listeyi TV’ye aktar', 'QR kod ya da kodla telefondaki listeyi TV’ye aktar'],
  ['kid', 'Çocuk kilidi', 'Şifreli çocuk profili'],
  ['profiles', 'Profiller', 'Her aile üyesine ayrı favoriler ve izleme listesi'],
].map(([id, name, desc]) => ({ id, name, desc }));

export const isProFeature = (id) => PRO_FEATURES.some((f) => f.id === id);
export const proFeature = (id) => PRO_FEATURES.find((f) => f.id === id) || null;

export const TIERS = { trial: 'Deneme', standard: 'Standart', pro: 'Pro', expired: 'Süresi doldu' };
export const PREVIEWS = [['', 'Kapalı'], ['trial', 'Deneme'], ['expired', 'Deneme bitti'], ['standard', 'Standart üye'], ['pro', 'Pro üye']];
export const normalizePreview = (v) => (PREVIEWS.some(([k]) => k === v) ? v : '');

// Kilitler çalışıyor mu? Faturalandırma bağlandıysa herkeste; değilse yalnız önizleme seçilmiş cihazda.
export const enforced = (preview = '') => BILLING_READY || !!normalizePreview(preview);

// Üyelik durumu. start: denemenin başladığı an (ms); ent: satın alınmış hak { tier: 'standard' | 'pro', until: ms } ya da null.
// Dönen: { tier, until, daysLeft } — daysLeft: bitişe kalan tam gün sayısı (yukarı yuvarlanır), bitmişse 0.
export function memberState({ start = 0, ent = null, preview = '', now = Date.now() } = {}) {
  const pv = normalizePreview(preview);
  if (pv === 'expired') return { tier: 'expired', until: now - DAY_MS, daysLeft: 0 };
  if (pv === 'trial') return { tier: 'trial', until: now + 5 * DAY_MS, daysLeft: 5 };
  if (pv === 'standard' || pv === 'pro') return { tier: pv, until: now + 200 * DAY_MS, daysLeft: 200 };
  const left = (until) => Math.max(0, Math.ceil((until - now) / DAY_MS));
  if (ent && (ent.tier === 'standard' || ent.tier === 'pro') && Number(ent.until) > now) return { tier: ent.tier, until: Number(ent.until), daysLeft: left(Number(ent.until)) };
  const s = Number(start) > 0 && Number(start) <= now ? Number(start) : now; // saat geri alınmışsa deneme uzamaz: bugünden sayılır
  const until = s + TRIAL_DAYS * DAY_MS;
  return until > now ? { tier: 'trial', until, daysLeft: left(until) } : { tier: 'expired', until, daysLeft: 0 };
}

// Uygulama kullanılabilir mi (deneme sürüyor ya da üyelik var)?
export const canUseApp = (st) => st.tier !== 'expired';
// Pro özelliği kullanılabilir mi?
export const canUsePro = (st) => st.tier === 'pro' || (TRIAL_HAS_PRO && st.tier === 'trial');
export const canUse = (feature, st) => (isProFeature(feature) ? canUsePro(st) : canUseApp(st));

export function stateText(st) {
  if (st.tier === 'trial') return `Deneme süresi: ${st.daysLeft} gün kaldı`;
  if (st.tier === 'expired') return 'Deneme süresi doldu';
  return `${TIERS[st.tier]} üyelik: ${st.daysLeft} gün kaldı`;
}

// ---- Pro kapısı: arayüz modülleri (spor, bugün, dizi akışı…) özelliğe girerken sorar. app.js açılışta gerçek denetimi bağlar;
// bağlanmadıysa (testler, tek başına modül) her şey açıktır.
let gate = () => true;
export const setProGate = (fn) => {
  gate = typeof fn === 'function' ? fn : () => true;
};
// true: devam et. false: kullanıcıya Pro sayfası gösterildi, işlem yapılmaz.
export const needPro = (feature) => gate(feature, false) !== false;
// Sessiz soru (kendiliğinden çalışan işler için, ör. otomatik maç hatırlatıcısı): sayfa açılmaz.
export const hasPro = (feature) => gate(feature, true) !== false;
