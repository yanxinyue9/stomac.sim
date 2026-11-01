/* =====================================================================
 * 肠道菌群模拟器 · 投喂玩法（日记 · 今天吃什么）
 * - 点击左侧「日记」按钮打开：输入今天吃什么 → 解析食物 → 生成食物插画
 * - 用鼠标拖拽 / 手指触屏滑动，把食物投喂给绿发小人
 * - 投喂后进入健康分析（与模拟器生态联动 sim.meal + GUT.healthOf）：
 *     · 判定为健康（菌群友好度 ≥ 60）        → 开心表情（happy.png）
 *     · 不健康（< 45）且健康度降到 40 以下   → 身体不舒服（bellyache.png）
 *     · 其余情况                              → 两张平常状态图交替显示
 * - 角色素材取自上传图片的形象：idle_1 / idle_2（平常）、happy（开心）、bellyache（不舒服）
 * ===================================================================== */
(function () {
  'use strict';

  /* 素材位置自适应（双保险）：
     ① 首选路径 pet/ 失败 → 永久切换到「图片平铺在根目录」的基准；
     ② 同时修正这个 img 自己的 src（一次性渲染的食物卡片用得上）；
     ③ 角色图是逐帧重设 src 的，必须让 IMG 按新基准重算后再重绘一次。 */
  document.addEventListener('error', (e) => {
    const el = e && e.target;
    if (!el || el.tagName !== 'IMG' || el.dataset.recut) return;
    const src = el.getAttribute('src') || '';
    if (src.indexOf('pet/') !== 0) return;
    FLAT_IMG = true;
    el.dataset.recut = '1';
    el.setAttribute('src', src.indexOf('pet/food/') === 0 ? src.slice('pet/food/'.length) : src.slice('pet/'.length));
    try { paint(); } catch (err) { /* 重绘失败不影响其他逻辑 */ }
  }, true);

  /* 素材根目录自适应：
     GitHub 网页端不支持拖文件夹，图片常常被平铺到站点根目录（pet/ 结构丢失）。
     启动时试加载一张 pet/ 下的图：失败就把 FLAT_IMG 置真，之后所有路径
     都以根目录为基准实时重算——包括逐帧刷新的角色图，所以不会被覆盖回错误路径。 */
  let FLAT_IMG = false;
  const petUrl = (f) => (FLAT_IMG ? '' : 'pet/') + f;
  const foodUrl = (f) => (FLAT_IMG ? '' : 'pet/food/') + f;
  try {
    const probe = new Image();
    probe.onerror = () => { FLAT_IMG = true; try { paint(); } catch (e) {} };
    probe.src = petUrl('idle_1.png');
  } catch (e) { /* 环境不支持 Image 时忽略 */ }

  /* 本仓库正常结构：角色在 pet/，食物在 pet/food/ */
  const IMG = {
    get normal() { return [petUrl('idle_1.png'), petUrl('idle_2.png')]; },
    get happy() { return petUrl('happy.png'); },
    get sick() { return petUrl('bellyache.png'); },
  };
  /* 常见食物 → 专属插画（面包/鸡翅/水果/蛋糕/面条/紫薯/香菇/青菜 来自用户提供的图片提取；
     其余按 GUT.FOOD_CATS 分类映射） */
  const FOOD_IMG = {
    /* 用户提供的食物图 */
    '面包': 'bread', '全麦面包': 'bread', '酸面包': 'bread',
    '鸡腿': 'chicken_wings', '鸡翅': 'chicken_wings', '炸鸡': 'chicken_wings',
    '苹果': 'fruit', '橙子': 'fruit', '梨': 'fruit', '葡萄': 'fruit', '猕猴桃': 'fruit', '蓝莓': 'blueberry',
    '蛋糕': 'cake', '甜甜圈': 'cake', '冰淇淋': 'cake', '甜品': 'cake', '巧克力': 'cake', '糖果': 'cake',
    '白面条': 'noodles', '荞麦面': 'noodles', '白粥': 'noodles',
    '紫薯': 'purple_potato', '红薯': 'purple_potato', '山药': 'purple_potato',
    '蘑菇': 'mushroom', '木耳': 'mushroom',
    '白菜': 'greens', '青菜': 'greens', '生菜': 'greens', '菠菜': 'greens', '娃娃菜': 'greens', '芹菜': 'greens',
    /* AI 生成插画 */
    '燕麦': 'oatmeal', '糙米': 'oatmeal', '小米': 'oatmeal', '藜麦': 'oatmeal',
    '白米饭': 'rice', '冷米饭': 'rice', '馒头': 'rice', '炒饭': 'rice',
    '西兰花': 'broccoli', '芦笋': 'broccoli', '秋葵': 'broccoli', '蔬菜': 'broccoli',
    '豆腐': 'tofu', '豆浆': 'tofu', '豆花': 'tofu', '毛豆': 'tofu', '黄豆': 'tofu', '酸奶': 'tofu',
  };
  const CAT_IMG = {
    grain: 'oatmeal', veg: 'greens', fruit: 'fruit', legume: 'tofu',
    ferment: 'tofu', meat: 'chicken_wings', fried: 'chicken_wings', sweet: 'cake',
    alcohol: 'cake', drink: 'fruit',
  };
  const CHIPS = ['面包', '鸡翅', '水果', '蛋糕', '面条', '紫薯', '香菇', '青菜', '燕麦', '酸奶', '白米饭', '爆辣火锅', '冰汽水', '奶茶', '可乐'];
  const LINES = {
    happy: ['哇——肚子暖暖的，好舒服！', '菌群们在开派对诶！', '谢谢款待！丁酸满满的～', '开心到想转圈圈！'],
    sick: ['唔……肚子好痛……', '咕噜咕噜……好胀……', '下次别吃这么刺激了嘛……', '捂住肚子……挺一挺……'],
    plain: ['嗯……味道还行，菌群们在讨论～', '吃下去了，等肠腔的反应～', '被一口吞掉啦！'],
  };
  /* 状态表情持续时长（秒） */
  const REACT_SEC = { happy: 4.2, sick: 5.5, plain: 2.6 };
  const SWAP_MS = 640; /* 平常状态两帧交替间隔 */

  let root = null, img = null, bubble = null, fxBox = null, panel = null;
  let visible = false;
  /* 本次投喂被拦下来的「变化报告」（sim.pending）。投喂流程里不该自动弹它：
     点「不看」直接丢弃；点「ok」也丢弃，只保留 openMealReport 那一份膳食分析报告。*/
  let heldPending = null;
  let state = 'normal';        // normal / happy / sick
  let reactLeft = 0;           // 临时表情剩余秒数
  let frameIdx = 0;
  let swapTimer = null, tickTimer = null, bubbleTimer = null;
  const foods = new Set();     // 场上待投喂的食物卡片

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function gut() { return window.__gut || null; }

  /* ---------------- DOM ---------------- */
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'feedpet';
    root.id = 'feedpet';
    root.hidden = true;
    root.innerHTML = `
      <div class="fpBubble" hidden></div>
      <img class="fpImg" alt="投喂小人" draggable="false" />
      <div class="fpFx"></div>
    `;
    img = root.querySelector('.fpImg');
    bubble = root.querySelector('.fpBubble');
    fxBox = root.querySelector('.fpFx');
    document.body.appendChild(root);

    /* 面板：今天吃什么 */
    panel = document.createElement('div');
    panel.className = 'fpPanel';
    panel.hidden = true;
    panel.innerHTML = `
      <h4>今天吃什么？
        <button type="button" title="收起面板" data-close="1">×</button>
      </h4>
      <div class="fpRow">
        <input id="fpInput" type="text" autocomplete="off" placeholder="例如：燕麦 蓝莓 / 炸鸡 奶茶" />
        <button class="btn btn-primary" id="fpGo">生成食物</button>
      </div>
      <div class="fpChips">${CHIPS.map((c) => `<button type="button" data-f="${c}">${c}</button>`).join('')}</div>
      <p class="fpNote">生成<b>食物插画</b>后，用鼠标拖拽或手指滑动，把它拖到小人身上喂她。<br>她会根据<b>菌群友好度</b>与<b>肠道生态健康度</b>做出反应。</p>
    `;
    document.body.appendChild(panel);

    img.addEventListener('click', () => {
      if (state === 'normal') { say(pick(['把我拖食物过来嘛～', '饿了……点上面的面板喂我！', '（眼巴巴看着你）'])); }
    });

    const inp = panel.querySelector('#fpInput');
    panel.querySelector('#fpGo').addEventListener('click', submit);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    panel.querySelector('[data-close]').addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('.fpChips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      inp.value = (inp.value ? inp.value + ' ' : '') + b.dataset.f;
      inp.focus();
    });
  }

  /* ---------------- 显示 ---------------- */
  function say(text, sec) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, (sec || 3) * 1000);
  }

  function paint() {
    if (!img) return;
    let src;
    if (state === 'happy') src = IMG.happy;
    else if (state === 'sick') src = IMG.sick;
    else src = IMG.normal[frameIdx % 2];
    if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
    root.dataset.state = state === 'plain' ? 'normal' : state;
  }

  function startLoops() {
    stopLoops();
    swapTimer = setInterval(() => {
      if (state === 'normal') { frameIdx = (frameIdx + 1) % 2; paint(); }
    }, SWAP_MS);
    tickTimer = setInterval(() => {
      if (reactLeft > 0) {
        reactLeft -= 0.2;
        if (reactLeft <= 0) { state = 'normal'; paint(); }
      }
    }, 200);
  }
  function stopLoops() {
    if (swapTimer) { clearInterval(swapTimer); swapTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  /* 日记按钮入口：打开投喂玩法 */
  function open() {
    build();
    if (!visible) {
      visible = true;
      root.hidden = false;
      state = 'normal'; frameIdx = 0;
      paint();
      startLoops();
      say('嗨！今天想吃什么？写下来做成食物，拖过来喂我吧！', 4);
    }
    panel.hidden = false;
    const inp = panel.querySelector('#fpInput');
    if (inp) inp.focus();
  }

  /* ---------------- 待出「变化报告」的拦截 ----------------
   * sim.meal() 会顺手排一份延迟弹出的「变化报告」（sim.pending）。
   * 投喂流程里它由用户决定去留，所以先把它从队列里取出来攥在手里：
   *   · 不拦 → 关掉任何弹窗后它都会自动冒出来，成了"第二份报告"；
   *   · 拦下 → 「不看」丢弃，「ok」也丢弃（只显示膳食分析那一份）。
   * 只处理 id === 'meal' 且是本次投喂产生的那一份，不影响干预 / 档案 / 记录分析等其它流程。 */
  function holdPendingReport() {
    const G = gut();
    if (!G || !G.sim) return;
    const p = G.sim.pending;
    if (p && p.id === 'meal') { heldPending = p; G.sim.pending = null; }
  }
  function dropPendingReport() {
    const G = gut();
    if (!G || !G.sim) return;
    if (heldPending && G.sim.pending === heldPending) G.sim.pending = null;
    heldPending = null;
  }

  /* 回到投喂页面：关弹窗 → 重新露出「今天吃什么」面板 → 小人接一句话（表情状态保留） */
  function backToFeed(line) {
    const G = gut();
    if (G && G.ui && G.ui.closeModal) G.ui.closeModal();
    open();
    if (line) say(line, 3);
  }

  /* ---------------- 食物插画 ---------------- */
  function foodImgOf(name, cat) {
    const key = FOOD_IMG[name] || CAT_IMG[cat] || 'oatmeal';
    return { src: foodUrl(key + '.png'), key };
  }

  function submit() {
    const inp = panel.querySelector('#fpInput');
    const text = (inp.value || '').trim();
    if (!text) { toast('先写下今天吃什么，例如：燕麦 蓝莓'); return; }
    const G = gut();
    if (!G || !G.ui || !G.ui.parseMeal) { toast('模拟器还没就绪，稍等一下再试'); return; }
    const m = G.ui.parseMeal(text);
    if (!m.items.length) { toast('没识别出食物，换个说法试试：燕麦 / 酸奶 / 炸鸡'); return; }
    inp.value = '';
    if (foods.size >= 4) { toast('桌上食物太多啦，先喂完再生成新的'); return; }
    m.items.slice(0, 4).forEach(({ food, qty }, i) => {
      setTimeout(() => spawnFood(food), i * 180);
    });
    say('哇，' + m.label + '！拖过来喂我吧～', 3.2);
  }

  function spawnFood(food) {
    const { src } = foodImgOf(food.n, food.cat);
    const card = document.createElement('div');
    card.className = 'fpFood';
    card.innerHTML = `<img src="${src}" alt="${food.n}" draggable="false" /><span class="fpFoodName">${food.n}</span>`;
    document.body.appendChild(card);
    /* 初始位置：小人旁边 */
    const r = img.getBoundingClientRect();
    card.style.left = Math.min(window.innerWidth - 90, r.right + 14) + 'px';
    card.style.top = Math.max(10, r.top + 20 + Math.random() * 30) + 'px';
    foods.add(card);
    makeDraggable(card, food);
  }

  /* ---------------- 拖拽投喂（鼠标 + 触屏） ---------------- */
  function makeDraggable(card, food) {
    let dragging = false, offX = 0, offY = 0;
    const overGirl = (x, y) => {
      const r = img.getBoundingClientRect();
      const pad = 26;
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    };

    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      try { card.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件无活动指针，忽略 */ }
      const cr = card.getBoundingClientRect();
      offX = e.clientX - cr.left;
      offY = e.clientY - cr.top;
      card.classList.add('dragging');
      card.style.transition = 'none';
    });
    card.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const x = e.clientX - offX, y = e.clientY - offY;
      card.style.left = x + 'px';
      card.style.top = y + 'px';
      card.classList.toggle('dropOk', overGirl(e.clientX, e.clientY));
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('dragging', 'dropOk');
      if (overGirl(e.clientX, e.clientY)) {
        feed(food, card);
      } else {
        /* 没投中：弹回原位 */
        card.classList.add('snapping');
        card.style.transition = '';
        card.style.left = (parseFloat(card.dataset.ox || card.style.left)) + 'px';
        setTimeout(() => card.classList.remove('snapping'), 360);
        say(pick(['咦，掉啦？再拖一次嘛', '没拿稳呀～拖到我这里来']), 2.4);
      }
    };
    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', (e) => { if (dragging) { dragging = false; card.classList.remove('dragging', 'dropOk'); } });
    /* 记录初始位置，便于弹回 */
    setTimeout(() => { card.dataset.ox = card.style.left; card.dataset.oy = card.style.top; }, 50);
  }

  /* ---------------- 投喂与健康分析 ---------------- */
  function feed(food, card) {
    const G = gut();
    if (!G || !G.sim || !G.ui || !G.ui.parseMeal) return;
    const m = G.ui.parseMeal(food.n);
    if (!m.items.length) return;
    const before = snapshot();      /* 投喂前指标，用于事后一句话总结 */
    G.sim.meal(m);                  /* 真正落进生态模型，写时间轴 */
    if (G.ui && G.ui.renderMeals) G.ui.renderMeals();
    holdPendingReport();            /* 拦下这餐排队的「变化报告」，交给下面的询问卡片决定去留 */

    /* 吃掉动画 */
    card.classList.add('eaten');
    foods.delete(card);
    setTimeout(() => card.remove(), 520);

    /* 健康分析 */
    const health = GUT.healthOf(G.sim);          // 0 ~ 1
    const healthPct = health * 100;
    const healthy = m.score >= 60;
    let s, line;
    if (healthy) {
      s = 'happy';
      line = pick(LINES.happy) + '（' + food.n + ' · ' + Math.round(m.score) + ' 分）';
      emit('heart', 6);
    } else if (m.score < 45 && healthPct < 40) {
      s = 'sick';
      line = pick(LINES.sick) + '（健康度 ' + Math.round(healthPct) + '，撑不住了…）';
      emit('pain', 5);
    } else {
      s = 'plain';
      line = pick(LINES.plain) + '（' + food.n + ' · ' + Math.round(m.score) + ' 分）';
      emit('note', 3);
    }
    state = s === 'plain' ? 'normal' : s;
    if (s !== 'plain') root.dataset.state = s;
    paint();
    reactLeft = REACT_SEC[s] || 2.6;
    say(line, 3.4);

    /* ① 先由小人用一句话总结变化（等模型消化一会儿，数据才有意义） */
    setTimeout(() => {
      const after = snapshot();
      const summary = summarize(before, after, m);
      say(summary, 5);
      /* ② 再问用户要不要看详细变化报告 */
      setTimeout(() => askReport(m, food, summary), 1400);
    }, 1500);
  }

  /* 指标快照 */
  function snapshot() {
    const s = gut().sim;
    return {
      diversity: s.diversity, butyrate: s.butyrate, inflammation: s.inflammation,
      gas: s.gas, barrier: s.barrier, health: GUT.healthOf(s),
    };
  }

  /* 一句话总结：挑变化最大的两项说人话 */
  function summarize(before, after, m) {
    const D = [
      { k: 'butyrate', up: '丁酸变多了，肠壁细胞更有能量，屏障在被修复', down: '丁酸变少了，肠壁少了主要能量来源' },
      { k: 'diversity', up: '菌群多样性上来了，生态更抗打', down: '菌群多样性掉了，结构在变单调' },
      { k: 'inflammation', up: '炎症升高了，肚子更容易不舒服', down: '炎症降下来了，肠道在安静下来' },
      { k: 'gas', up: '产气变多，接下来可能会有点胀', down: '产气减少，腹胀在缓解' },
      { k: 'barrier', up: '肠屏障更结实了', down: '肠屏障变弱了，刺激物更容易穿透' },
      { k: 'health', up: '整体健康度提升了', down: '整体健康度下滑了' },
    ].map((x) => ({ ...x, d: after[x.k] - before[x.k] }))
      .filter((x) => Math.abs(x.d) >= 0.004)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

    if (!D.length) return '嗯……肠道里几乎没起波澜，这一口影响不大。';
    const top = D.slice(0, 2).map((x) => (x.d > 0 ? x.up : x.down)).join('，');
    const score = Math.round(m.score);
    const tail = score >= 60 ? '——这一口菌群挺喜欢的。'
      : score >= 45 ? '——不算好也不算糟。'
        : '——这一口菌群不太买账。';
    return top + tail;
  }

  /* 询问是否需要详细变化报告：ok，看看 / 不看（回到投喂页） */
  function askReport(m, food, summary) {
    const G = gut();
    if (!G.ui || !G.ui.openMealReport) return;
    G.ui.openModal(`
      <span class="mTag" style="color:#7DD3FC;border-color:#7DD3FC66;background:#7DD3FC12">投喂结果</span>
      <h3 class="mTitle">她刚刚说：${summary}</h3>
      <p class="mSub">吃到的是「${food.n}」· 菌群友好度 ${Math.round(m.score)} 分 · 要不要展开看完整变化报告？</p>
      <p class="mLead">完整报告会拆解这一口的四个营养维度、预测接下来 1～2 天菌群会发生什么，并给出改进建议。</p>
      <div class="repBtns">
        <button class="btn btn-primary" id="fpRepOk">ok，看看</button>
        <button class="btn btn-ghost" id="fpRepNo">不看，继续投喂</button>
      </div>
    `);
    const ok = document.getElementById('fpRepOk');
    const no = document.getElementById('fpRepNo');
    /* ok：只显示这一份膳食分析报告；被拦下的「变化报告」直接丢弃，不再出现第二份 */
    if (ok) ok.addEventListener('click', () => {
      dropPendingReport();
      G.ui.openMealReport(m);
      appendBackToFeedBtn();
    });
    /* 不看：不弹任何报告，直接回到投喂页面 */
    if (no) no.addEventListener('click', () => {
      dropPendingReport();
      backToFeed(pick(['好～那就不看啦', '知道啦，下次再说', '（点点头）']));
    });
  }

  /* 给「第一份报告」尾部加一个返回投喂页的入口（仅投喂流程打开的这份会被追加） */
  function appendBackToFeedBtn() {
    const body = document.getElementById('modalBody');
    if (!body || body.querySelector('#fpRepBack')) return;
    const box = document.createElement('div');
    box.className = 'repBtns';
    box.innerHTML = '<button class="btn btn-primary" id="fpRepBack">继续投喂 →</button>';
    body.appendChild(box);
    const b = box.querySelector('#fpRepBack');
    if (b) b.addEventListener('click', () => backToFeed('再来一口？想吃什么就写下来～'));
  }

  /* 左栏记录一餐 / 弹窗喂食后，同步角色反应 */
  function onMealResult(m) {
    if (!visible) return;
    const G = gut();
    const healthPct = G && G.sim ? GUT.healthOf(G.sim) * 100 : 100;
    if (m.score >= 60) { state = 'happy'; reactLeft = REACT_SEC.happy; emit('heart', 4); }
    else if (m.score < 45 && healthPct < 40) { state = 'sick'; reactLeft = REACT_SEC.sick; emit('pain', 4); }
    else { reactLeft = REACT_SEC.plain; emit('note', 2); }
    paint();
    say((m.score >= 60 ? pick(LINES.happy) : m.score < 45 && healthPct < 40 ? pick(LINES.sick) : pick(LINES.plain)) + '（' + m.label + '）', 3.2);
  }

  /* ---------------- 粒子 ---------------- */
  function emit(kind, n) {
    if (!fxBox) return;
    const glyphs = { heart: '♥', pain: '💢', note: '♪' };
    for (let i = 0; i < (n || 4); i++) {
      setTimeout(() => {
        if (!fxBox) return;
        const sp = document.createElement('span');
        sp.className = 'fpFxItem fp-' + kind;
        sp.textContent = glyphs[kind] || '✦';
        sp.style.left = (18 + Math.random() * 64) + '%';
        fxBox.appendChild(sp);
        setTimeout(() => sp.remove(), 1900);
      }, i * 240);
    }
  }

  function toast(msg) {
    const G = gut();
    if (G && G.ui && G.ui.toast) G.ui.toast(msg);
  }

  /* 预载角色帧 */
  [...IMG.normal, IMG.happy, IMG.sick].forEach((u) => { const i = new Image(); i.src = u; });

  window.FeedPet = {
    open,
    onMealResult,
    get visible() { return visible; },
    get state() { return state; },
  };
})();
