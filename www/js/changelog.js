// Yenilikler: en yeni üstte. id her sürümde bir artar; güncellemeden sonra görülmemiş kayıtlar bir kez gösterilir.
// CI, en yeni kaydı güncelleme penceresinde göstermek üzere notes.txt'ye yazar (scripts/build-www.mjs).
export const CHANGELOG = [
  {
    id: 6,
    title: 'Yeni ad ve ikon, yedekleme',
    items: ['Uygulamanın adı “Iptv Player Pro” oldu, yeni ikon', 'Ayarlar › Genel ayarlar › Yedekle / geri yükle: kaynaklar, favoriler, kategori düzeni ve ayarlar tek dosyaya kaydedilir, yeni cihazda geri yüklenir', 'Yenilikler: güncellemeden sonra neler eklendiği burada gösterilir'],
  },
  {
    id: 5,
    title: 'Yayını cihaza kaydetme',
    items: ['Oynatıcıda “Kaydet”: izlenen canlı yayın cihaza kaydedilir (süre seçilebilir)', 'Ana ekran › Kayıtlar: kaydı istediğiniz yere sararak izleyin, silin', '“Durdur ve baştan izle” ve “Canlıya dön”'],
  },
  {
    id: 4,
    title: 'Yedek adres ve çalışmayan kanal işareti',
    items: ['Kanal açılmazsa listedeki aynı adlı kanal otomatik denenir', 'Açılamayan kanallar listede “Çalışmıyor olabilir” diye işaretlenir'],
  },
  {
    id: 3,
    title: 'Rakamla kanal, son kanal, uyku zamanlayıcısı',
    items: ['Kumanda rakamlarıyla kanal numarası girin; “0” son izlenen kanala döner', 'Oynatıcıda uyku zamanlayıcısı (15 dk – 2 saat)', 'Başlıkta kanal numarası görünür'],
  },
  {
    id: 2,
    title: 'Sıralama',
    items: ['Kanal, film ve dizi listelerinde yeni eklenen, A–Z, Z–A ve puana göre sıralama (Favoriler dahil)'],
  },
  {
    id: 1,
    title: 'Uygulama şifresi',
    items: ['4–6 rakamlık uygulama şifresi; kategorileri çocuk kilidiyle şifreleyebilirsiniz (Genel ayarlar › Uygulama şifresi)'],
  },
];

export const LATEST_ID = CHANGELOG[0].id;

// Görülmemiş kayıtlar. seen: son gösterilen id (yoksa null). Kurulu kullanıcı (kaynağı var) ilk kez güncelliyorsa hepsi sayılır; temiz kurulumda hiçbiri.
export function unseenEntries(seen, hasData, list = CHANGELOG) {
  const s = seen == null ? (hasData ? 0 : list[0] ? list[0].id : 0) : seen;
  return list.filter((e) => e.id > s);
}

// Güncelleme penceresindeki kısa not: en yeni kaydın maddeleri, satır satır.
export function latestNotes(list = CHANGELOG) {
  const e = list[0];
  return e ? e.items.map((x) => '• ' + x).join('\n').slice(0, 480) : '';
}
