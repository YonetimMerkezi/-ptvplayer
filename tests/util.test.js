import test from 'node:test';
import assert from 'node:assert/strict';
import { maskUrl } from '../www/js/util.js';

test('maskUrl: sorgudaki kullanıcı adı ve şifre gizlenir, sunucu ve yol kalır', () => {
  assert.equal(
    maskUrl('http://tinyurl.com/viphdizle/xmltv.php?username=sedathoca&password=42rBtAGvDt'),
    'http://tinyurl.com/viphdizle/xmltv.php?username=••••&password=••••',
  );
  assert.equal(maskUrl('http://h.tv/get.php?type=m3u_plus&USERNAME=a&Password=b&output=ts'), 'http://h.tv/get.php?type=m3u_plus&USERNAME=••••&Password=••••&output=ts');
  assert.equal(maskUrl('https://x.tv/epg.xml?token=abc123'), 'https://x.tv/epg.xml?token=••••');
});

test('maskUrl: kullanıcı:şifre@ öneki gizlenir; gizli bilgi yoksa adres aynı kalır', () => {
  assert.equal(maskUrl('http://user:pass@h.tv/epg.xml'), 'http://••••@h.tv/epg.xml');
  assert.equal(maskUrl('https://h.tv/epg.xml.gz'), 'https://h.tv/epg.xml.gz');
  assert.equal(maskUrl('https://h.tv/a?lang=tr&days=2'), 'https://h.tv/a?lang=tr&days=2');
  assert.equal(maskUrl(''), '');
  assert.equal(maskUrl(null), '');
});
