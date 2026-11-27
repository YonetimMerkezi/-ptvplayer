// Lig katalogu ve ikinci kaynak (LiveScore/Mackolik) eşlemesi: Lig sayfası (webOS) ve Spor ekranının lig görünümü (Android) ortak kullanır.
// ESPN ligleri sports.js'te; burada ESPN'de bulunmayan Türkiye alt ligleri ve "bu maç hangi lige ait" kuralları vardır.
import { LEAGUES, norm } from './sports.js';

// Lig katalogu: ESPN ligleri + ESPN'de bulunmayan Türkiye alt ligleri. Alt liglerin haftası yalnız ikinci kaynaktan kurulur.
export const IKINCI_LIGLER = [
  { id: 'tff.1', name: 'Türkiye 1. Lig', ikinci: true },
  { id: 'tff.2', name: 'Türkiye 2. Lig', ikinci: true },
];
export const TUM_LIGLER = LEAGUES.slice(0, 1).concat(IKINCI_LIGLER, LEAGUES.slice(1)); // Süper Lig'in hemen ardından alt ligler
export const ligBul = (id) => TUM_LIGLER.find((l) => l.id === id) || null;
export const ikinciLigMi = (id) => IKINCI_LIGLER.some((l) => l.id === id);

// İkinci kaynağın maçı hangi lige ait? Yarışma adı ve grubundan (lg kimlikleri ESPN'inkilerle aynı değildir: "ls:turkey-super-lig").
const trAd = (re) => (m) => m.grp === 'tr' && re.test(norm(m.lgName || ''));
const adda = (re) => (m) => re.test(norm(m.lgName || ''));
const ESLER = {
  'tur.1': trAd(/(^| )super lig( |$)/),
  'tff.1': trAd(/(^| )(1 lig|1st lig|first lig)( |$)/),
  'tff.2': trAd(/(^| )2 lig( |$)/),
  'eng.1': adda(/(ingiltere|england) premier/),
  'esp.1': adda(/(ispanya|spain) (la ?liga|primera)/),
  'ita.1': adda(/(italya|italy) serie a/),
  'ger.1': adda(/(almanya|germany) bundesliga(?! 2)/),
  'fra.1': adda(/(fransa|france) ligue 1/),
  'uefa.champions': adda(/champions league/),
  'uefa.europa': adda(/(^| )europa league/),
  'uefa.europa.conf': adda(/conference league/),
};
export const ligEsler = (id) => ESLER[id] || (() => false);
// İkinci kaynakta tanınan (maç haftası günlerden kurulabilen) ligler: milli maç yarışmalarının eşleme kuralı yoktur, ESPN penceresiyle çalışır
export const ikinciKaynakVar = (id) => !!ESLER[id];
export const HAFTALI_LIGLER = TUM_LIGLER.filter((l) => ESLER[l.id]); // hafta numaralı lig görünümü olan ligler (sıra: katalog sırası)
// Maç bu lige ait mi: ESPN kimliği ya da ikinci kaynağın yarışma adı
export const ligMaci = (m, id) => !!m && (m.lg === id || ligEsler(id)(m));

// LiveScore günü servis içinde yalnız bu ülkelerin yarışmalarına süzülür (arayüz günlük ~600 maçı işlerken 5 sn donuyordu)
const TR_ULKE = 'u=turkey,turkiye';
const AVRUPA_ULKE = 'u=europe,uefa,international,world';
export const LIG_ULKE = { 'tur.1': TR_ULKE, 'tff.1': TR_ULKE, 'tff.2': TR_ULKE, 'eng.1': 'u=england', 'esp.1': 'u=spain', 'ita.1': 'u=italy', 'ger.1': 'u=germany', 'fra.1': 'u=france', 'uefa.champions': AVRUPA_ULKE, 'uefa.europa': AVRUPA_ULKE, 'uefa.europa.conf': AVRUPA_ULKE };
