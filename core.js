// Pure functions: Thai baht text, PromptPay payload, totals.
(function (root) {
  const D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  function readInt(s) {
    // s: digit string without leading zeros issues; handles millions recursively
    if (s.length > 6) {
      const head = s.slice(0, s.length - 6);
      const tail = s.slice(-6);
      return readInt(head) + 'ล้าน' + (/^0+$/.test(tail) ? '' : readInt(tail));
    }
    let out = '';
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const d = +s[i];
      const pos = n - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && n > 1) out += 'เอ็ด';
      else if (pos === 1 && d === 2) out += 'ยี่สิบ';
      else if (pos === 1 && d === 1) out += 'สิบ';
      else out += D[d] + P[pos];
    }
    return out;
  }

  // Whole satang, rounded half up. Binary floating point makes 2.055 * 100 = 205.49999999999997, so a plain
  // Math.round gives 2.05; toPrecision(14) drops that noise (like a spreadsheet) so 68.50 x 3% = 2.06.
  function toSatang(x) {
    const n = +x;
    if (!isFinite(n)) return NaN;
    const sign = n < 0 ? -1 : 1;
    return (sign * Math.round(+(Math.abs(n) * 100).toPrecision(14))) || 0;
  }

  function bahtText(amount) {
    const v = toSatang(amount);
    if (!isFinite(v) || v < 0) return '';
    if (v === 0) return 'ศูนย์บาทถ้วน';
    const baht = Math.floor(v / 100);
    const sat = v % 100;
    let out = '';
    if (baht > 0) out += readInt(String(baht)) + 'บาท';
    out += sat === 0 ? 'ถ้วน' : readInt(String(sat)) + 'สตางค์';
    return out;
  }

  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function en999(n) {
    let s = '';
    if (n >= 100) { s += ONES[Math.floor(n / 100)] + ' hundred'; n %= 100; if (n) s += ' '; }
    if (n >= 20) { s += TENS[Math.floor(n / 10)]; if (n % 10) s += '-' + ONES[n % 10]; }
    else if (n) s += ONES[n];
    return s;
  }

  function enInt(n) {
    const scales = ['', 'thousand', 'million', 'billion'];
    const parts = [];
    for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
      const c = n % 1000;
      if (c) parts.unshift(en999(c) + (scales[i] ? ' ' + scales[i] : ''));
    }
    return parts.join(' ');
  }

  function bahtTextEn(amount) {
    const v = toSatang(amount);
    if (!isFinite(v) || v < 0) return '';
    if (v === 0) return 'Zero baht only';
    const baht = Math.floor(v / 100);
    const sat = v % 100;
    let out = baht > 0 ? enInt(baht) + ' baht' : '';
    out += sat ? (baht ? ' and ' : '') + enInt(sat) + ' satang' : ' only';
    return out[0].toUpperCase() + out.slice(1);
  }

  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function tlv(id, val) {
    return id + String(val.length).padStart(2, '0') + val;
  }

  function promptPayPayload(target, amount) {
    const t = String(target || '').replace(/\D/g, '');
    if (!t) return '';
    let sub, key;
    if (t.length >= 13) { sub = '02'; key = t.slice(0, 13); }
    else if (t.length === 15) { sub = '03'; key = t; }
    else { sub = '01'; key = '0066' + t.replace(/^0/, ''); }
    const amt = +amount > 0 ? (+amount).toFixed(2) : '';
    let p = tlv('00', '01') + tlv('01', amt ? '12' : '11') +
      tlv('29', tlv('00', 'A000000677010111') + tlv(sub, key)) +
      tlv('53', '764') + (amt ? tlv('54', amt) : '') + tlv('58', 'TH');
    p += '6304';
    return p + crc16(p);
  }

  function round2(x) { return toSatang(x) / 100; }

  function totals(items, o) {
    const sub = round2(items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0));
    const disc = round2(Math.min(+o.discount || 0, sub));
    const base = round2(sub - disc);
    let vat = 0, net = base;
    if (o.vatMode === 'exclude') { vat = round2(base * 0.07); }
    else if (o.vatMode === 'include') { net = round2(base / 1.07); vat = round2(base - net); }
    const baseExVat = o.vatMode === 'include' ? net : base;
    const wht = round2(baseExVat * ((+o.whtRate || 0) / 100));
    const grand = o.vatMode === 'include' ? base : round2(base + vat);
    const pay = round2(grand - wht);
    return { sub, disc, base, vat, wht, grand, pay };
  }

  const api = { bahtText, bahtTextEn, promptPayPayload, crc16, totals };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BahtDoc = api;
})(typeof window !== 'undefined' ? window : globalThis);
