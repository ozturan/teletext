const path = require('path');
const TICKERS = require(path.join(__dirname, '..', 'tickers.json'));

const COUNTRY_FEEDS = {
  TR: [
    { url: 'https://www.cumhuriyet.com.tr/rss',                    label: 'Cumhuriyet' },
    { url: 'https://www.birgun.net/rss',                           label: 'BirGün' },
    { url: 'https://www.gazeteduvar.com.tr/rss/tum-haberler',      label: 'Gazete Duvar' },
    { url: 'https://www.evrensel.net/rss/haber.xml',               label: 'Evrensel' },
  ],
  CA: [
    { url: 'https://www.cbc.ca/webfeed/rss/rss-topstories',       label: 'CBC News' },
    { url: 'https://www.cbc.ca/webfeed/rss/rss-canada',           label: 'CBC Canada' },
    { url: 'https://globalnews.ca/feed/',                          label: 'Global News' },
    { url: 'https://nationalpost.com/feed',                        label: 'National Post' },
  ],
  US: [
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', label: 'NYT' },
    { url: 'https://feeds.washingtonpost.com/rss/national',              label: 'Washington Post' },
    { url: 'https://feeds.npr.org/1001/rss.xml',                        label: 'NPR' },
    { url: 'https://feeds.nbcnews.com/nbcnews/public/news',             label: 'NBC News' },
  ],
  GB: [
    { url: 'https://feeds.bbci.co.uk/news/rss.xml',               label: 'BBC News' },
    { url: 'https://www.theguardian.com/uk-news/rss',              label: 'The Guardian' },
    { url: 'https://www.independent.co.uk/news/uk/rss',            label: 'The Independent' },
    { url: 'https://www.telegraph.co.uk/rss.xml',                  label: 'The Telegraph' },
  ],
  DE: [
    { url: 'https://www.spiegel.de/international/index.rss',       label: 'Der Spiegel' },
    { url: 'https://rss.dw.com/rdf/rss-en-all',                   label: 'Deutsche Welle' },
  ],
  FR: [
    { url: 'https://www.france24.com/en/rss',                     label: 'France 24' },
    { url: 'https://www.rfi.fr/en/rss',                           label: 'RFI' },
  ],
  JP: [{ url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',         label: 'NHK' }],
  IN: [
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', label: 'Times of India' },
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss',  label: 'The Hindu' },
  ],
  AU: [
    { url: 'https://www.abc.net.au/news/feed/2942460/rss.xml',    label: 'ABC Australia' },
    { url: 'https://www.sbs.com.au/news/feed',                    label: 'SBS News' },
  ],
  BR: [{ url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', label: 'Folha' }],
  KR: [{ url: 'https://en.yna.co.kr/RSS/news.xml',                      label: 'Yonhap' }],
  NL: [{ url: 'https://feeds.nos.nl/nosnieuwsalgemeen',                  label: 'NOS' }],
  ES: [{ url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada', label: 'El País' }],
  IT: [{ url: 'https://www.ansa.it/sito/ansait_rss.xml',                 label: 'ANSA' }],
  MX: [{ url: 'https://www.eluniversal.com.mx/rss.xml',                  label: 'El Universal' }],
  SE: [{ url: 'https://www.thelocal.se/feed',                            label: 'The Local SE' }],
  NO: [{ url: 'https://www.thelocal.no/feed',                            label: 'The Local NO' }],
};

const TTL = {
  POST:           24 * 60 * 60,       // 24 hours (seconds)
  CONFIG:         90 * 24 * 60 * 60,  // 90 days
  FLOOD_WINDOW:   10 * 60,            // 10 minutes
  RATE_LIMIT:     10,                 // 10 seconds
  REPORT_COOLDOWN: 30,                // 30 seconds
  ONLINE:         5 * 60,             // 5 minutes
  FINANCE_CACHE:  10 * 60,            // 10 minutes
  QUOTE_CACHE:    5 * 60,             // 5 minutes
  NEWS_CACHE:     10 * 60,            // 10 minutes
};

const LIMITS = {
  MAX_POSTS:       50,
  MAX_NAME_LENGTH: 30,
  MAX_MSG_LENGTH:  280,
  MAX_CONFIG_SIZE: 4000,
  FLOOD_MAX:       15,
  REPORTS_TO_DELETE: 5,
};

module.exports = { TICKERS, COUNTRY_FEEDS, TTL, LIMITS };
