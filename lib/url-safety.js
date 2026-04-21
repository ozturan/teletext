const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '169.254.169.254', 'metadata.google.internal'];
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/;
const BLOCKED_TLD = ['.local', '.internal'];

function isUrlSafe(urlStr) {
  try {
    const { protocol, hostname } = new URL(urlStr);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    const host = hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(host)) return false;
    if (PRIVATE_IP.test(host)) return false;
    if (BLOCKED_TLD.some(tld => host.endsWith(tld))) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = isUrlSafe;
