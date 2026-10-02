// C-007 SYNTHETIC sanitized page samples. Every value here is invented for offline replay.
// Shape references only: the public Duo entry (heading, 暂未发售, pickup unavailable, disabled 继续; Oct 2) and the
// historical Pro pickup stage (我要取货, store, native date choice, time SELECT with a 可选时段 placeholder; Oct 1).
// Markup, class names, maintenance wording, timings, dates, slot counts and durations are NOT Apple facts.
// Slot lists are generated from caller parameters; nothing here fixes a slot count, duration or closing time.

const BANNER = `<p class="synthetic-banner">合成样本 SYNTHETIC — 非 Apple 页面，仅用于本机回放</p>`;
const doc = (body, title = "合成样本") => `<!doctype html><html lang="zh-CN"><head><title>${title}</title></head><body>${BANNER}${body}</body></html>`;

export const FAKE_TARGET = { products: [{id:'FAKE-duo', model:'iPhone Duo', capacity:'256GB', color:'星光白色'}], stores: ["FAKE 门店甲"] };

/** Synthetic time ranges from start to end with the given step in minutes (all three are test parameters). */
export function timeRanges(from, to, minutes) {
  if (![from, to].every(t => typeof t === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || !Number.isInteger(minutes) || minutes <= 0 || from >= to) throw new Error('InvalidSyntheticRange');
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const out = [];
  for (let m = toMin(from); m + minutes <= toMin(to); m += minutes) out.push([fmt(m), fmt(m + minutes)]);
  return out;
}

export const samples = {
  prelaunch: (o = {}) => doc(`<main><h1>iPhone Duo</h1><p>256GB 星光白色 RMB 15,999（合成价格）</p>
    <p>暂未发售</p><p>目前暂不提供 Apple Store 零售店取货服务</p>
    <button type="button" disabled${o.attr ? ` class="${o.attr}"` : ""}>继续</button></main>`),
  /** UNVERIFIED wording: no current official maintenance page has been observed. */
  maintenance: () => doc(`<main><h1>我们正在更新 Apple Store。</h1><p>请稍后再来看看。（合成维护文案）</p></main>`),
  partial: () => doc(`<header><nav>合成导航</nav></header><main aria-busy="true"><div class="skeleton"></div></main>`),
  /** Recovered entry. layout "a" mirrors the observed order; "b" reorders blocks, renames classes, uses a role=button. */
  entry: (o = {}) => o.layout === "b"
    ? doc(`<div class="x9-shell"><section><div role="button" aria-label="继续" tabindex="0" class="cta-v2">继续 ›</div></section>
      <section><p>iPhone Duo 256GB 星光白色</p><p>FAKE 价格 RMB 15,999</p></section><header><h1>iPhone Duo</h1></header></div>`)
    : doc(`<main><h1>iPhone Duo</h1><p>256GB 星光白色 RMB 15,999（合成价格）</p><button type="button">继续</button></main>`),
  wrongProduct: () => doc(`<main><h1>iPhone 18 Pro</h1><button type="button">继续</button></main>`),
  signIn: () => doc(`<main><h2>登录以结账</h2><button type="button">以游客身份继续</button></main>`),
  consent: () => doc(`<main><h2>Apple 和你的数据隐私</h2><button type="button" disabled>同意并继续</button></main>`),
  unknown: () => doc(`<main><h2>合成：无法理解的页面</h2><p>请稍候</p></main>`),
  /**
   * Pickup date/time stage. dates: [{ label, enabled }]; selected: index into dates; times: [[start,end]] for the
   * selected date; layout "select" mirrors the observed native controls, "radios" uses changed control types/order.
   */
  pickup: ({ dates, selected = 0, times, disabledTimes = [], layout = "select", store = "FAKE 门店甲", product = "iPhone Duo", capacity='256GB', color='星光白色', price=15999, quantity=1, pickup=true }) => {
    const opt = ([s, e]) => `${s}–${e}`;
    if (layout === "radios") {
      const dateTabs = dates.map((d, i) => `<span role="tab" aria-selected="${i === selected}"${d.enabled ? "" : ' aria-disabled="true"'}>${d.label}</span>`).join("");
      const timeRadios = times.map((t) => `<label role="radio" aria-checked="false"${disabledTimes.includes(t[0]) ? ' aria-disabled="true"' : ""}>${opt(t)}</label>`).join("");
      return doc(`<div class="pk-v2"><aside><div role="radiogroup" aria-label="时段">${timeRadios}</div></aside>
        <section><div role="tablist">${dateTabs}</div><p>${store}</p><p>${product} ${capacity} ${color}</p><p>RMB ${price}</p><p>数量: ${quantity}</p><button role="radio" aria-checked="${pickup}">我要取货</button></section>
        <div role="button" aria-label="继续填写取货详情">继续填写取货详情</div></div>`);
    }
    const dateOpts = dates.map((d, i) => `<option${i === selected ? " selected" : ""}${d.enabled ? "" : " disabled"}>${d.label}</option>`).join("");
    const dateControl = layout==='input-radios' ? `<div role="radiogroup" aria-label="取货日期">${dates.map((d,i)=>`<label><input type="radio" name="synthetic-date" aria-label="${d.label}"${i===selected?' checked':''}${d.enabled?'':' disabled'}>${d.label}</label>`).join('')}</div>` : `<select aria-label="取货日期">${dateOpts}</select>`;
    const timeOpts = times.map((t) => `<option${disabledTimes.includes(t[0]) ? " disabled" : ""}>${opt(t)}</option>`).join("");
    return doc(`<main><h2>到店自提</h2><button role="radio" aria-checked="${pickup}">我要取货</button><p>${store}</p><p>${product} ${capacity} ${color}</p><p>RMB ${price}</p><p>数量: ${quantity}</p><p>需要签到</p>
      ${dateControl}
      <select aria-label="取货时段"><option disabled selected>可选时段</option>${timeOpts}</select>
      <button type="button">继续填写取货详情</button></main>`);
  },
};
