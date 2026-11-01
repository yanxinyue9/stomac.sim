/* =====================================================================
 * 日记板块：入口二选一
 *   1) 投喂      —— 交给 FeedPet（输入今天吃什么 → 生成食物 → 拖给小人）
 *   2) 记录分析  —— 记录一日三餐 / 睡眠 / 运动，一键生成分析报告
 * 两个入口都严格内嵌于模拟器：只有点击左侧「日记」按钮才会出现。
 * ===================================================================== */
(function () {
  'use strict';

  function gut() { return window.__gut || null; }

  /* ---------------- 通用小工具 ---------------- */
  const METRICS = [
    { key: 'diversity', label: '菌群多样性', good: 1 },
    { key: 'butyrate', label: '丁酸水平', good: 1 },
    { key: 'inflammation', label: '炎症水平', good: -1 },
    { key: 'gas', label: '肠道产气', good: -1 },
    { key: 'barrier', label: '肠屏障', good: 1 },
  ];

  function snap() {
    const G = gut();
    const s = G.sim;
    const o = { health: GUT.healthOf(s) };
    METRICS.forEach((m) => { o[m.key] = s[m.key]; });
    return o;
  }

  const pct = (v) => Math.round(v * 100);
  const delta = (a, b) => b - a;

  function arrow(d, inverse) {
    if (Math.abs(d) < 0.006) return { sign: '→', txt: '基本不变', col: '#7c8f95' };
    const better = inverse ? d < 0 : d > 0;
    return {
      sign: d > 0 ? '↑' : '↓',
      txt: (d > 0 ? '上升 ' : '下降 ') + Math.abs(d * 100).toFixed(1),
      col: better ? '#34D399' : '#FF6B4A',
    };
  }

  /* ---------------- 入口选择 ---------------- */
  function open() {
    const G = gut();
    if (!G || !G.ui || !G.ui.openModal) { return; }
    G.ui.openModal(`
      <span class="mTag" style="color:#7DD3FC;border-color:#7DD3FC66;background:#7DD3FC12">日记 · Diary</span>
      <h3 class="mTitle">今天想做点什么？</h3>
      <p class="mSub">两个入口随便选：喂她吃东西，或者把一天记下来做个分析。</p>
      <div class="dhGrid">
        <button class="dhCard" id="dhFeed">
          <b>🍚 投喂</b>
          <span>写下今天吃什么 → 生成食物图片 → 拖给她吃，看她开心还是捂肚子</span>
          <em>需要互动：鼠标拖拽 / 手指滑动</em>
        </button>
        <button class="dhCard" id="dhRecord">
          <b>📒 记录分析</b>
          <span>记录一日三餐、睡眠、运动与压力 → 一键生成肠道影响分析</span>
          <em>产出：菌群变化 + 未来饮食建议</em>
        </button>
      </div>
      <p class="mFoot">${GUT.BASELINE_NOTE}</p>
    `);
    const feed = document.getElementById('dhFeed');
    const rec = document.getElementById('dhRecord');
    if (feed) feed.addEventListener('click', () => {
      G.ui.closeModal();
      if (window.FeedPet) window.FeedPet.open();
    });
    if (rec) rec.addEventListener('click', () => {
      G.ui.closeModal();
      openRecord();
    });
  }

  /* =====================================================================
   * 记录分析
   * ===================================================================== */
  const SLEEP_Q = [
    ['good', '睡得很好'], ['ok', '一般'], ['hard', '入睡困难'], ['wake', '半夜易醒'],
  ];
  const SPORT = [
    ['none', '没有运动'], ['walk', '散步'], ['run', '快走 / 慢跑'], ['gym', '力量训练'], ['hiit', '高强度间歇'],
  ];
  const STRESS = [['low', '轻松'], ['mid', '一般'], ['high', '紧张 / 压力大']];

  function openRecord() {
    const G = gut();
    if (!G || !G.ui) return;
    G.ui.openModal(`
      <span class="mTag" style="color:#C3E34A;border-color:#C3E34A66;background:#C3E34A12">记录分析</span>
      <h3 class="mTitle">记下今天，一键分析</h3>
      <p class="mSub">三餐照实写（用空格分隔多种食物），再填睡眠与运动；点「一键分析」生成报告。</p>

      <h4 class="repH">一日三餐</h4>
      <div class="raGrid">
        <label class="raField"><span>早餐</span><input id="raB" type="text" placeholder="燕麦 牛奶 蓝莓" /></label>
        <label class="raField"><span>午餐</span><input id="raL" type="text" placeholder="糙米 鸡胸肉 西兰花" /></label>
        <label class="raField"><span>晚餐</span><input id="raD" type="text" placeholder="豆腐 青菜 紫薯" /></label>
        <label class="raField"><span>加餐 / 零食（可空）</span><input id="raS" type="text" placeholder="奶茶 蛋糕" /></label>
      </div>

      <h4 class="repH">睡眠</h4>
      <div class="raGrid">
        <label class="raField"><span>睡眠时长（小时）</span><input id="raSH" type="number" step="0.5" min="0" max="14" value="7.5" /></label>
        <label class="raField"><span>睡眠质量</span><select id="raSQ">${SLEEP_Q.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>

      <h4 class="repH">运动与压力</h4>
      <div class="raGrid">
        <label class="raField"><span>运动类型</span><select id="raET">${SPORT.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label class="raField"><span>运动时长（分钟）</span><input id="raEM" type="number" step="5" min="0" max="240" value="30" /></label>
        <label class="raField"><span>今日压力</span><select id="raST">${STRESS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>

      <div class="repBtns">
        <button class="btn btn-primary" id="raGo">一键分析</button>
        <button class="btn btn-ghost" id="raCancel">取消</button>
      </div>
      <p class="mFoot">分析会把这三餐真正喂进当前的肠道生态模型里，所以报告里的变化是「你这条肠道」的实测结果。${GUT.BASELINE_NOTE}</p>
    `);
    const go = document.getElementById('raGo');
    const cancel = document.getElementById('raCancel');
    if (cancel) cancel.addEventListener('click', () => G.ui.closeModal());
    if (go) go.addEventListener('click', () => analyze({
      b: document.getElementById('raB').value,
      l: document.getElementById('raL').value,
      d: document.getElementById('raD').value,
      s: document.getElementById('raS').value,
      sh: parseFloat(document.getElementById('raSH').value) || 0,
      sq: document.getElementById('raSQ').value,
      et: document.getElementById('raET').value,
      em: parseFloat(document.getElementById('raEM').value) || 0,
      st: document.getElementById('raST').value,
    }));
  }

  function analyze(input) {
    const G = gut();
    if (!G || !G.ui) return;
    const ui = G.ui, sim = G.sim;

    /* ---- 1) 解析三餐 ---- */
    const meals = [
      { name: '早餐', text: input.b }, { name: '午餐', text: input.l },
      { name: '晚餐', text: input.d }, { name: '加餐', text: input.s },
    ].map((x) => ({ ...x, m: x.text.trim() ? ui.parseMeal(x.text) : null }))
      .filter((x) => x.m && x.m.items.length);

    if (!meals.length) {
      ui.toast('至少写出一餐（例如：燕麦 牛奶 蓝莓）再分析');
      return;
    }

    /* ---- 2) 记录前快照 ---- */
    const before = snap();

    /* ---- 3) 三餐真正进入生态模型 ---- */
    meals.forEach((x) => {
      const m = x.m;
      const labeled = Object.assign({}, m, { label: x.name + '：' + m.label });
      sim.meal(labeled);
    });
    if (ui.renderMeals) ui.renderMeals();

    /* ---- 4) 睡眠 / 运动 / 压力的生活影响 ---- */
    const life = applyLifestyle(input, sim);

    ui.openModal(`
      <span class="mTag" style="color:#C3E34A;border-color:#C3E34A66;background:#C3E34A12">记录分析</span>
      <h3 class="mTitle">正在把今天喂进肠道模型…</h3>
      <p class="mSub">消化需要一点点时间，马上给你结果。</p>
    `);

    /* ---- 5) 等模型消化后再对比 ---- */
    setTimeout(() => {
      const after = snap();
      openDayReport(input, meals, before, after, life);
    }, 1800);
  }

  /* 生活方式（睡眠/运动/压力）→ 对生态的轻微影响 + 解读 */
  function applyLifestyle(input, sim) {
    const out = { lines: [], advice: [] };
    const sh = input.sh, sq = input.sq, em = input.em, et = input.et;

    /* 睡眠 */
    if (sh < 6.5 || sq === 'hard' || sq === 'wake') {
      const bad = sh < 6.5 ? 1 : 0.6;
      sim.inflammation = Math.min(1, sim.inflammation + 0.03 * bad);
      sim.diversity = Math.max(0, sim.diversity - 0.015 * bad);
      out.lines.push(`睡眠不足 / 碎片化（${sh} 小时，${SLEEP_Q.find((q) => q[0] === sq)[1]}）：炎症上升、多样性小幅下降。睡眠剥夺会削弱昼夜节律，让肠黏膜通透性升高，菌群组成也会更偏向促炎型。`);
      out.advice.push('把睡眠稳定在 7 小时以上、固定作息时间——这是成本最低的「抗炎」手段，对菌群多样性的恢复比任何单一食物都快。');
    } else {
      out.lines.push(`睡眠充足（${sh} 小时）：昼夜节律稳定，有助于维持黏膜屏障与菌群的节律性波动。`);
    }

    /* 运动 */
    if (et !== 'none' && em >= 20) {
      sim.butyrate = Math.min(1, sim.butyrate + (em >= 40 ? 0.04 : 0.025));
      sim.diversity = Math.min(1, sim.diversity + 0.012);
      sim.gas = Math.max(0, sim.gas - 0.02);
      out.lines.push(`运动 ${em} 分钟（${SPORT.find((s) => s[0] === et)[1]}）：丁酸上升、多样性小幅提升。规律运动能增加产丁酸菌的丰度，并促进肠蠕动、减少气体滞留。`);
      if (em >= 75) {
        sim.inflammation = Math.min(1, sim.inflammation + 0.02);
        sim.barrier = Math.max(0.05, sim.barrier - 0.02);
        out.lines.push(`但单次 ${em} 分钟属于较长时间的运动：强度过大时血液会优先供应肌肉，肠道短暂缺血，可能带来一过性的屏障波动与不适。`);
        out.advice.push('长时间高强度训练后注意补水与碳水补充，避免空腹高强度，给肠道留出恢复时间。');
      }
    } else if (et !== 'none' && em > 0) {
      out.lines.push(`活动量偏少（${em} 分钟）：对菌群的正向刺激有限，建议累计到 20 分钟以上。`);
      out.advice.push('中等强度运动每周累计 150 分钟（每次 ≥ 20 分钟）是已被证实能提升菌群多样性的剂量。');
    } else {
      sim.gas = Math.min(1, sim.gas + 0.02);
      out.lines.push('今天没有运动：久坐会让肠蠕动变慢，气体更容易滞留，产气相关的不适感会加重。');
      out.advice.push('哪怕只是饭后散步 15 分钟，也能明显加快结肠传输、缓解胀气。');
    }

    /* 压力 */
    if (input.st === 'high') {
      sim.inflammation = Math.min(1, sim.inflammation + 0.025);
      sim.barrier = Math.max(0.05, sim.barrier - 0.02);
      out.lines.push('压力偏高：通过脑肠轴（HPA 轴）提升通透性与炎症，也会改变摄食偏好（更想吃高糖高脂）。');
      out.advice.push('压力大的日子更要有意识地准备「顺手就能吃」的高纤维食物（即食燕麦、水果、坚果），避免应激性进食。');
    }
    return out;
  }

  /* ---------------- 报告 ---------------- */
  function openDayReport(input, meals, before, after, life) {
    const G = gut();
    const ui = G.ui, sim = G.sim;

    /* 每餐的食物标签 */
    const mealBlocks = meals.map((x) => {
      const m = x.m;
      const tags = m.items.map(({ food, qty }) => {
        const c = GUT.FOOD_CATS[food.cat];
        const tip = food.desc ? ` title="${String(food.desc).replace(/"/g, '&quot;')}"` : '';
        return `<span class="foodTag"${tip} style="border-color:${c.color}55;background:${c.color}14">
          <i style="background:${c.color}"></i>${food.n}${qty !== 1 ? ' ×' + qty : ''}<em>${c.label}</em></span>`;
      }).join('');
      const sc = Math.round(m.score);
      return `<div class="raMeal">
        <div class="raMealHead"><b>${x.name}</b>
          <em style="color:${ui.scoreColor(m.score)}">菌群友好度 ${sc}</em></div>
        <div class="foodList">${tags}</div>
        ${m.unknown.length ? `<p class="tiny">没认出：${m.unknown.join('、')}</p>` : ''}
      </div>`;
    }).join('');

    /* 全天平均维度（0～3 刻度） */
    const avg = (k) => meals.reduce((a, x) => a + x.m[k], 0) / meals.length;
    const dims = [
      { label: '膳食纤维', v: avg('af'), color: '#34D399' },
      { label: '蛋白与脂肪', v: avg('ap'), color: '#FF6B4A' },
      { label: '发酵食品', v: avg('az'), color: '#2DD4BF' },
      { label: '糖分', v: avg('as'), color: '#D946EF' },
    ];
    const dimBars = dims.map((d) => `<div class="mdRow"><span>${d.label}</span>
      <i class="mdBar"><b style="width:${Math.min(100, (d.v / 3) * 100).toFixed(0)}%;background:${d.color}"></b></i>
      <em>${d.v.toFixed(1)} / 3</em></div>`).join('');
    const dayScore = meals.reduce((a, x) => a + x.m.score, 0) / meals.length;

    /* 指标变化表 */
    const rows = METRICS.map((m) => {
      const d = delta(before[m.key], after[m.key]);
      const a = arrow(d, m.good < 0);
      return `<div><span>${m.label}</span><b style="color:${a.col}">${a.sign} ${Math.abs(d) < 0.006 ? '基本不变' : Math.abs(d * 100).toFixed(1)}</b>
        <em>${pct(before[m.key])} → ${pct(after[m.key])}</em></div>`;
    }).join('');
    const hd = delta(before.health, after.health);
    const ha = arrow(hd, false);

    /* 变化 → 影响 */
    const impacts = [];
    const push = (k, txt) => {
      const d = delta(before[k], after[k]);
      if (Math.abs(d) >= 0.006) impacts.push(txt(d > 0 ? '上升' : '下降', Math.abs(d * 100).toFixed(1)));
    };
    push('diversity', (dir, v) => `菌群多样性${dir} ${v}：多样性越高，生态越"抗打"——面对一次火锅或一次抗生素，恢复速度更快；持续下降则意味着菌群结构在变单调，代谢产物也随之变少。`);
    push('butyrate', (dir, v) => `丁酸${dir} ${v}：丁酸是结肠细胞的主要能量来源，也是抗炎与修复屏障的关键分子；它下降时，黏膜更容易被刺激物突破。`);
    push('inflammation', (dir, v) => `炎症水平${dir} ${v}：低度慢性炎症是肠道不适的放大器，会让腹胀、排便不规律更明显，也会进一步抑制有益菌生长。`);
    push('gas', (dir, v) => `产气${dir} ${v}：气体增多通常来自糖分与纤维的快速发酵，短期表现为腹胀与肠鸣；若长期偏高，提示发酵模式偏向产气菌。`);
    push('barrier', (dir, v) => `肠屏障${dir} ${v}：屏障是"守门人"，它变弱意味着未被完全分解的食物残渣与细菌产物更容易进入体内，触发免疫反应。`);
    life.lines.forEach((l) => impacts.push(l));
    if (!impacts.length) impacts.push('各项核心指标变化都很小——今天这顿对生态的冲击有限，菌群稳态没有被明显推动。真正的改变来自长期重复的饮食模式。');

    /* 未来饮食建议 */
    const tips = [];
    const f = avg('af'), p = avg('ap'), z = avg('az'), s = avg('as');
    if (f < 1.2) tips.push(`纤维偏低（平均每餐 ${f.toFixed(1)}/3）：明天把「每餐都有纤维」当作唯一目标——早餐加燕麦或奇亚籽，午晚餐保证一拳大小的蔬菜 + 一份豆类/全谷，菌群会在 1～2 天内开始产更多丁酸。`);
    else if (f >= 2) tips.push(`纤维充足（${f.toFixed(1)}/3）：继续保持，但注意加量要循序渐进并多喝水，否则产气会先于丁酸增加，反而胀气。`);
    else tips.push(`纤维中等（${f.toFixed(1)}/3）：再往上加一点就进入"甜区"，优先增加植物性食物的**种类**（每周 30 种不同植物）而不是单纯加大分量。`);

    if (s >= 1.2) tips.push(`糖分偏高（${s.toFixed(1)}/3）：甜饮、甜品与精制主食会把发酵推向产气与乳酸方向。先用"无糖版本 + 水果"替代一半，保留口感同时把糖负荷降下来。`);
    if (p >= 1.8) tips.push(`蛋白与脂肪偏高（${p.toFixed(1)}/3）：大量动物蛋白与油脂会抬高胆汁酸与硫化氢。建议把其中 1/3 换成植物蛋白（豆腐、豆类），并减少油炸与红肉频率。`);
    if (z < 0.5) tips.push(`发酵食品几乎为零（${z.toFixed(1)}/3）：每天加一份无糖酸奶、泡菜或纳豆，直接带来过路有益菌与有机酸，是成本最低的多样性补充方式。`);
    if (dayScore < 50) tips.push(`今天全天菌群友好度只有 ${Math.round(dayScore)} 分：不用补救式节食，明天优先安排一顿"高纤维 + 发酵食品"的正餐，让生态重新拿到原料。`);
    else if (dayScore >= 70) tips.push(`全天友好度 ${Math.round(dayScore)} 分，结构不错：保持这个模式，配合规律作息，菌群会在数天内朝多样性更高的方向稳定下来。`);
    life.advice.forEach((a) => tips.push(a));

    ui.openModal(`
      <span class="mTag" style="color:#C3E34A;border-color:#C3E34A66;background:#C3E34A12">记录分析 · 报告</span>
      <h3 class="mTitle">今天这张肠道成绩单</h3>
      <p class="mSub">共记录 ${meals.length} 餐 · 睡眠 ${input.sh} 小时 · ${SPORT.find((x) => x[0] === input.et)[1]} ${input.et === 'none' ? '' : input.em + ' 分钟'} · 压力${STRESS.find((x) => x[0] === input.st)[1]}</p>

      <div class="mScore" style="--c:${ui.scoreColor(dayScore)}"><b>${Math.round(dayScore)}</b><span>全天菌群友好度 · ${
        dayScore >= 75 ? '对菌群很友好' : dayScore >= 60 ? '还不错' : dayScore >= 45 ? '一般，有改进空间' : dayScore >= 30 ? '偏西式快餐结构' : '对菌群不太友好'}</span></div>
      <div class="mdWrap">${dimBars}</div>

      <h4 class="repH">今天的记录</h4>
      ${mealBlocks}

      <h4 class="repH">肠道菌群发生了什么变化</h4>
      <div class="mGrid">${rows}
        <div><span>生态健康度（综合）</span><b style="color:${ha.col}">${ha.sign} ${Math.abs(hd) < 0.006 ? '基本不变' : Math.abs(hd * 100).toFixed(1)}</b>
          <em>${pct(before.health)} → ${pct(after.health)}</em></div>
      </div>

      <h4 class="repH">这些变化可能造成的影响</h4>
      <ul class="repCause">${impacts.map((t) => `<li data-i="i">${t}</li>`).join('')}</ul>

      <h4 class="repH">对未来饮食的建议</h4>
      <ul class="repCause">${tips.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>

      <div class="repBtns">
        <button class="btn btn-ghost" id="raBack">再记一次</button>
      </div>
      <p class="mFoot">报告里的数字来自当前生态模型的实测前后对比；饮食建议只针对"菌群友好度"，不构成医疗建议。${GUT.BASELINE_NOTE}</p>
    `);
    const back = document.getElementById('raBack');
    if (back) back.addEventListener('click', () => openRecord());
  }

  window.DiaryHub = { open, openRecord };
})();
