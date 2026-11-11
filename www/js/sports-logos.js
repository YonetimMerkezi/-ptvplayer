// Takım simgeleri: milli takımlar için ülke bayrağı (ad → ISO kodu → flagcdn.com), kulüpler için rozet (ESPN logosu; yoksa TheSportsDB aramasından).
// Saf mantık (ağ dışarıdan verilir). Ekran sports-ui.js ve sports-detail-ui.js'te.
import { norm } from './sports.js';

export const FLAG_HOST = 'https://flagcdn.com';
export const BADGE_HOST = 'https://www.thesportsdb.com/api/v1/json/123';

export const flagUrl = (code) => `${FLAG_HOST}/w80/${code}.png`;

// 'iso|Ad|Başka yazım…' — Türkçe adlar (yayın akışı siteleri), İngilizce adlar (ESPN/LiveScore) ve yaygın yazımlar
const TABLE = `ad|Andorra
ae|Birleşik Arap Emirlikleri|United Arab Emirates|UAE|BAE
af|Afganistan|Afghanistan
ag|Antigua ve Barbuda|Antigua and Barbuda
ai|Anguilla
al|Arnavutluk|Albania
am|Ermenistan|Armenia
ao|Angola
ar|Arjantin|Argentina
as|Amerikan Samoası|American Samoa
at|Avusturya|Austria
au|Avustralya|Australia
aw|Aruba
az|Azerbaycan|Azerbaijan
ba|Bosna-Hersek|Bosnia and Herzegovina|Bosnia-Herzegovina|Bosna Hersek
bb|Barbados
bd|Bangladeş|Bangladesh
be|Belçika|Belgium
bf|Burkina Faso
bg|Bulgaristan|Bulgaria
bh|Bahreyn|Bahrain
bi|Burundi
bj|Benin
bm|Bermuda
bn|Brunei
bo|Bolivya|Bolivia
br|Brezilya|Brazil
bs|Bahamalar|Bahamas
bt|Butan|Bhutan
bw|Botsvana|Botswana
by|Belarus|Beyaz Rusya
bz|Belize
ca|Kanada|Canada
cd|Kongo Demokratik Cumhuriyeti|DR Congo|Congo DR|Demokratik Kongo
cf|Orta Afrika Cumhuriyeti|Central African Republic
cg|Kongo|Congo
ch|İsviçre|Switzerland
ci|Fildişi Sahili|Ivory Coast|Cote d'Ivoire
ck|Cook Adaları|Cook Islands
cl|Şili|Chile
cm|Kamerun|Cameroon
cn|Çin|China|China PR|Çin Halk Cumhuriyeti
co|Kolombiya|Colombia
cr|Kosta Rika|Costa Rica
cu|Küba|Cuba
cv|Yeşil Burun Adaları|Cape Verde|Cabo Verde|Yeşil Burun
cw|Curaçao|Curacao
cy|Kıbrıs|Cyprus|Güney Kıbrıs
cz|Çekya|Czechia|Czech Republic|Çek Cumhuriyeti
de|Almanya|Germany
dj|Cibuti|Djibouti
dk|Danimarka|Denmark
dm|Dominika|Dominica
do|Dominik Cumhuriyeti|Dominican Republic
dz|Cezayir|Algeria
ec|Ekvador|Ecuador
ee|Estonya|Estonia
eg|Mısır|Egypt
er|Eritre|Eritrea
es|İspanya|Spain
et|Etiyopya|Ethiopia
fi|Finlandiya|Finland
fj|Fiji
fo|Faroe Adaları|Faroe Islands|Faroe
fr|Fransa|France
ga|Gabon
gb-eng|İngiltere|England
gb-nir|Kuzey İrlanda|Northern Ireland
gb-sct|İskoçya|Scotland
gb-wls|Galler|Wales
gd|Grenada
ge|Gürcistan|Georgia
gh|Gana|Ghana
gi|Cebelitarık|Gibraltar
gm|Gambiya|Gambia
gn|Gine|Guinea
gq|Ekvator Ginesi|Equatorial Guinea
gr|Yunanistan|Greece
gt|Guatemala|Guetemala
gu|Guam
gw|Gine-Bissau|Guinea-Bissau
gy|Guyana
hk|Hong Kong
hn|Honduras
hr|Hırvatistan|Croatia
ht|Haiti
hu|Macaristan|Hungary
id|Endonezya|Indonesia
ie|İrlanda|Ireland|Republic of Ireland|İrlanda Cumhuriyeti
il|İsrail|Israel
in|Hindistan|India
iq|Irak|Iraq
ir|İran|Iran|IR Iran
is|İzlanda|Iceland
it|İtalya|Italy
jm|Jamaika|Jamaica
jo|Ürdün|Jordan
jp|Japonya|Japan
ke|Kenya
kg|Kırgızistan|Kyrgyzstan|Kyrgyz Republic
kh|Kamboçya|Cambodia
km|Komorlar|Comoros
kn|Saint Kitts ve Nevis|St. Kitts and Nevis|Saint Kitts and Nevis
kp|Kuzey Kore|North Korea|Korea DPR
kr|Güney Kore|South Korea|Korea Republic|Kore Cumhuriyeti
kw|Kuveyt|Kuwait
ky|Cayman Adaları|Cayman Islands
kz|Kazakistan|Kazakhstan
la|Laos
lb|Lübnan|Lebanon
lc|Saint Lucia|St. Lucia
li|Lihtenştayn|Liechtenstein
lk|Sri Lanka
lr|Liberya|Liberia
ls|Lesotho
lt|Litvanya|Lithuania
lu|Lüksemburg|Luxembourg
lv|Letonya|Latvia
ly|Libya
ma|Fas|Morocco
md|Moldova|Moldovya
me|Karadağ|Montenegro
mf|Saint Martin
mg|Madagaskar|Madagascar
mk|Kuzey Makedonya|North Macedonia
ml|Mali
mm|Myanmar
mn|Moğolistan|Mongolia
mo|Makao|Macau
mq|Martinik|Martinique
mr|Moritanya|Mauritania
ms|Montserrat
mt|Malta
mu|Mauritius
mv|Maldivler|Maldives
mw|Malavi|Malawi
mx|Meksika|Mexico
my|Malezya|Malaysia
mz|Mozambik|Mozambique
na|Namibya|Namibia
nc|Yeni Kaledonya|New Caledonia
ne|Nijer|Niger
ng|Nijerya|Nigeria
ni|Nikaragua|Nicaragua
nl|Hollanda|Netherlands
no|Norveç|Norway
np|Nepal
nz|Yeni Zelanda|New Zealand
om|Umman|Oman
pa|Panama
pe|Peru
pf|Tahiti|French Polynesia
pg|Papua Yeni Gine|Papua New Guinea
ph|Filipinler|Philippines
pk|Pakistan
pl|Polonya|Poland
pr|Porto Riko|Puerto Rico
ps|Filistin|Palestine
pt|Portekiz|Portugal
py|Paraguay
qa|Katar|Qatar
ro|Romanya|Romania
rs|Sırbistan|Serbia
ru|Rusya|Russia
rw|Ruanda|Rwanda
sa|Suudi Arabistan|Saudi Arabia
sb|Solomon Adaları|Solomon Islands
sc|Seyşeller|Seychelles
sd|Sudan
se|İsveç|Sweden
sg|Singapur|Singapore
si|Slovenya|Slovenia
sk|Slovakya|Slovakia
sl|Sierra Leone
sm|San Marino
sn|Senegal
so|Somali|Somalia
sr|Surinam|Suriname
ss|Güney Sudan|South Sudan
st|Sao Tome ve Principe|Sao Tome and Principe
sv|El Salvador
sy|Suriye|Syria
sz|Esvatini|Eswatini|Svaziland|Swaziland
tc|Turks ve Caicos|Turks and Caicos
td|Çad|Chad
tg|Togo
th|Tayland|Thailand
tj|Tacikistan|Tajikistan
tl|Doğu Timor|Timor-Leste|East Timor
tm|Türkmenistan|Turkmenistan
tn|Tunus|Tunisia
to|Tonga
tr|Türkiye|Turkey
tt|Trinidad ve Tobago|Trinidad and Tobago
tw|Çin Taipei|Chinese Taipei|Tayvan|Taiwan
tz|Tanzanya|Tanzania
ua|Ukrayna|Ukraine
ug|Uganda
us|ABD|USA|United States|Amerika Birleşik Devletleri
uy|Uruguay
uz|Özbekistan|Uzbekistan
va|Vatikan
vc|Saint Vincent ve Grenadinler|St. Vincent and the Grenadines
ve|Venezuela
vg|Britanya Virjin Adaları|British Virgin Islands
vi|ABD Virjin Adaları|US Virgin Islands
vn|Vietnam
vu|Vanuatu
ws|Samoa
xk|Kosova|Kosovo
ye|Yemen
za|Güney Afrika|South Africa
zm|Zambiya|Zambia
zw|Zimbabve|Zimbabwe`;

const FLAGS = new Map();
for (const line of TABLE.split('\n')) {
  const [code, ...names] = line.split('|');
  for (const n of names) FLAGS.set(norm(n), code);
}

// Takım adındaki yaş/cinsiyet ekleri ("U21", "U-17", "(K)", "Kadınlar", "Women") ülkeyi değiştirmez
const strip = (n) => n.replace(/(^| )u ?\d{2}( |$)/g, ' ').replace(/(^| )(k|kadin|kadinlar|women|womens|w|olimpiyat|olympic)( |$)/g, ' ').replace(/\s+/g, ' ').trim();

// Milli takım adı → bayrak kodu ('' = milli takım değil)
export const nationCode = (name) => FLAGS.get(strip(norm(name))) || '';

// İki takım da milli takımsa ikisinin de bayrağı (kulüp adı bir ülke adıyla aynı olabilir: "Monaco - Lille" bayrak almaz)
export function nationFlags(home, away) {
  const a = nationCode(home);
  const b = nationCode(away);
  return a && b ? { home: flagUrl(a), away: flagUrl(b) } : null;
}

// Arama için takım adı: yaş/cinsiyet eki atılır
export const badgeQuery = (name) => String(name || '').replace(/\s*\((?:k|w)\)\s*/gi, ' ').replace(/\s+u-?\d{2}\b/gi, '').replace(/\s+/g, ' ').trim();

export const badgeSearchUrl = (name, host = BADGE_HOST) => `${host}/searchteams.php?t=${encodeURIComponent(badgeQuery(name))}`;

// TheSportsDB arama yanıtı → rozet adresi (boyut eki yok: satırda '/tiny' 50px, ayrıntıda '/small' 200px eklenir): yalnız futbol takımı ve adı
// (kısa ad/yan adlar dahil) birebir tutan; yoksa ''
export function pickBadge(json, name) {
  const list = Array.isArray(json && json.teams) ? json.teams : [];
  const want = norm(badgeQuery(name));
  if (!want) return '';
  const names = (t) => [t.strTeam, t.strTeamShort, ...String(t.strAlternate || '').split(',')].map(norm).filter(Boolean);
  const hit = list.find((t) => t && /soccer|football/i.test(t.strSport || '') && typeof t.strBadge === 'string' && /^https?:\/\//i.test(t.strBadge) && names(t).includes(want));
  return hit ? hit.strBadge : '';
}

// Yer tutucu için takımın baş harfi
export const initialOf = (label) => {
  const m = /[\p{L}\p{N}]/u.exec(String(label || ''));
  return m ? m[0].toLocaleUpperCase('tr') : '?';
};

// Takımın gösterilecek simgesi: { src, flag }. İki takım da milli takımsa bayrak (tutarlı görünüm); yoksa kaynağın logosu (ESPN); yoksa rozet araması (badgeOf).
// src '' ise yer tutucu (baş harf) gösterilir.
export function sideLogo(side, other, badgeOf = () => '') {
  const a = nationCode(side.name);
  const b = nationCode(other.name);
  if (a && b) return { src: flagUrl(a), flag: true };
  if (side.logo) return { src: side.logo, flag: false };
  return { src: badgeOf(side.name) || '', flag: false };
}

// Simge kutusu: altta baş harf (CSS ::before, metin değil), üstte görsel; görsel yüklenince harf gizlenir, yüklenemezse görsel kalkar ve harf kalır.
export function logoHtml(lg, label, esc) {
  const img = lg.src
    ? `<img src="${esc(lg.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">`
    : '';
  return `<span class="sp-flag${lg.flag ? ' fl' : ''}" data-i="${esc(initialOf(label))}">${img}</span>`;
}
