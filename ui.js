/* 肠道菌群生态模拟器 · 界面层（面板、仪表盘、科普弹窗） */
(function (root) {
  'use strict';
  const GUT = (root.GUT = root.GUT || {});
  const S = GUT.SPECIES;
  const IX = GUT.SPECIES_INDEX;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = (id) => document.getElementById(id);
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  const ROLE_TEXT = {
    core: '核心居民',
    beneficial: '有益功能菌',
    opportunistic: '条件致病菌',
    pathogen: '病原菌',
  };
  const ROLE_COLOR = {
    core: '#F5B944',
    beneficial: '#34D399',
    opportunistic: '#FF6B4A',
    pathogen: '#D946EF',
  };

  function sup(n) {
    return String(n).split('').map((c) => SUP[c] || c).join('');
  }
  function cfu(units) {
    const v = units * 1e9;
    if (v < 1e6) return v.toFixed(0);
    const e = Math.floor(Math.log10(v));
    const m = v / Math.pow(10, e);
    return `${m.toFixed(1)}×10${sup(e)}`;
  }
  function pct1(v) { return (v * 100).toFixed(1) + '%'; }

  function toneColor(v, invert) {
    const t = clamp(invert ? 1 - v : v, 0, 1);
    if (t < 0.34) return '#FF6B4A';
    if (t < 0.6) return '#F5B944';
    return '#34D399';
  }

  GUT.createUI = function (opts) {
    const sim = opts.sim;
    const R = opts.renderer;
    const U = { selected: null, flags: {}, history: [], lastHistDay: -1 };

    /* ============ 顶栏指标 chips ============ */
    const CHIPS = [
      { key: 'diversity', label: '多样性 Shannon', get: () => sim.diversity, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.diversity > 0.75 ? '丰富' : sim.diversity > 0.55 ? '下降' : '严重降低') },
      { key: 'butyrate', label: '丁酸水平', get: () => clamp(sim.butyrate, 0, 1), fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.butyrate > 0.6 ? '充足' : sim.butyrate > 0.3 ? '偏低' : '匮乏') },
      { key: 'barrier', label: '肠屏障', get: () => sim.barrier, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.barrier > 0.65 ? '完整' : sim.barrier > 0.35 ? '变薄' : '受损') },
      { key: 'inflammation', label: '炎症水平', get: () => sim.inflammation, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.inflammation < 0.25 ? '静息' : sim.inflammation < 0.55 ? '激活' : '炎症风暴'), invert: true },
    ];
    const chipEls = [];
    function buildChips() {
      const box = $('chips');
      box.innerHTML = '';
      CHIPS.forEach((c) => {
        const el = document.createElement('div');
        el.className = 'chip';
        el.innerHTML = `<span>${c.label}</span><b>—</b><small>—</small>`;
        box.appendChild(el);
        chipEls.push(el);
      });
    }

    /* ============ 环境滑块 ============ */
    const sliderEls = [];
    function buildEnv() {
      const box = $('env');
      box.innerHTML = '';
      GUT.ENV.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'envRow';
        const tone = e.key === 'abx' ? 'danger' : e.key === 'stress' || e.key === 'protein' ? 'warn' : '';
        row.innerHTML =
          `<div class="envHead"><label>${e.label}</label><b>${e.value}</b><i class="envShift"></i></div>` +
          `<input type="range" min="0" max="100" step="1" value="${e.value}" class="${tone}" />` +
          `<p class="envHint">${e.hint}</p>`;
        const input = row.querySelector('input');
        const val = row.querySelector('b');
        const shift = row.querySelector('.envShift');
        const setP = () => input.style.setProperty('--p', ((input.value - 0) / 100) * 100 + '%');
        setP();
        input.addEventListener('input', () => {
          sim.env[e.key] = +input.value;
          setP();
          U.syncEnv();
          if (opts.onEnvChange) opts.onEnvChange(e.key, +input.value);
        });
        box.appendChild(row);
        sliderEls.push({ key: e.key, input, val, shift });
      });
    }
    /* 数值显示的是"基础值 + 状态档案偏移"后的实际生效值 */
    U.syncEnv = function () {
      sliderEls.forEach((s) => {
        const off = (sim.profEnv && sim.profEnv[s.key]) || 0;
        const eff = clamp(sim.env[s.key] + off, 0, 100);
        s.input.value = sim.env[s.key];
        s.val.textContent = Math.round(eff);
        s.input.style.setProperty('--p', sim.env[s.key] + '%');
        if (s.shift) {
          const offI = Math.round(off);
          s.shift.textContent = offI ? (offI > 0 ? '档案 +' + offI : '档案 ' + offI) : '';
          s.shift.classList.toggle('on', !!off);
          s.shift.title = off ? `基础 ${sim.env[s.key]} · 状态档案 ${off > 0 ? '+' : ''}${off}` : '';
        }
      });
    };

    /* ============ 事件按钮 ============ */
    function buildEvents() {
      const box = $('events');
      box.innerHTML = '';
      GUT.EVENTS.forEach((e) => {
        const info = GUT.EVENT_INFO[e.id];
        const b = document.createElement('button');
        b.className = 'evBtn ' + e.tone;
        b.innerHTML = `<span>${e.label}</span><i class="evInfo" title="查看解释">?</i>`;
        b.title = e.note;
        b.querySelector('.evInfo').addEventListener('click', (ev) => {
          ev.stopPropagation();
          openEvent(e.id);
        });
        b.addEventListener('click', () => {
          sim.fire(e.id);
          U.toast(e.note);
          if (e.id === 'reset') { U.syncEnv(); U.selected = null; R.highlight = null; }
          if (e.id === 'abx') for (let i = 0; i < 4; i++) R.rings.push({ r: 10 + i * 40, life: 1 });
          if (e.id === 'fmt') U.flags.fmtDone = true;
        });
        box.appendChild(b);
      });
    }

    /* ============ 画布工具 ============ */
    const TOOLS = [
      { id: 'probe', label: '观察' },
      { id: 'probiotic', label: '投放益生菌' },
      { id: 'fiber', label: '投放纤维' },
    ];
    function buildTools() {
      const box = $('tools');
      box.innerHTML = '';
      TOOLS.forEach((t) => {
        const b = document.createElement('button');
        b.className = 'toolBtn' + (t.id === 'probe' ? ' on' : '');
        b.textContent = t.label;
        b.addEventListener('click', () => {
          R.tool = t.id;
          [...box.children].forEach((c) => c.classList.remove('on'));
          b.classList.add('on');
          $('canvasHint').textContent =
            t.id === 'probe' ? '点击任意菌体 → 查看它的科普卡片' : '在肠腔内点击 → ' + t.label;
        });
        box.appendChild(b);
      });
    }

    /* ============ 我的状态档案（疾病 / 心理 / 作息 / 周期 / 用药） ============ */
    const PF = GUT.PROFILE_ITEMS;
    const PFI = GUT.PROFILE_INDEX;
    const pfChipEls = {};
    const MOL_DIR = {
      up: { s: '↑', c: '#FF6B4A', t: '升高' },
      down: { s: '↓', c: '#7B93B8', t: '降低' },
      flat: { s: '→', c: '#F5B944', t: '波动' },
    };
    const uniq = (arr) => {
      const seen = {}, out = [];
      arr.forEach((x) => { if (!seen[x]) { seen[x] = 1; out.push(x); } });
      return out;
    };
    const signed = (v, unit) => (v > 0 ? '+' : '') + v.toFixed(0) + (unit || '');

    function molRows(mols) {
      return mols.map((m, i) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return `<div class="molRow">
          <div class="molHead"><i class="molDot" style="background:${MOL_PALETTE[i % MOL_PALETTE.length]}"></i><b>${m.name}</b><em style="color:${d.c}">${d.s} ${d.t}</em></div>
          <div class="molOrgan"><span class="molTo">作用于</span>${m.organ}</div>
          <p>${m.desc}</p>
        </div>`;
      }).join('');
    }

    /* 小分子卡片的正面摘要：先给方向，再看细节 */
    function molBrief(mols) {
      if (!mols || !mols.length) return '点击查看这条状态涉及的关键分子';
      const names = mols.slice(0, 3).map((m) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return `${m.name} ${d.s}`;
      }).join('、');
      return `${names} 等 ${mols.length} 个分子——展开看它们分别作用在哪里`;
    }

    /* ---------- 小分子动态示意图（与主画布同风格：菌群 → 屏障 → 靶器官） ---------- */
    const MOL_PALETTE = ['#2DD4BF', '#F5B944', '#A78BFA', '#7DD3FC', '#F472B6', '#C3E34A', '#FF8A5C', '#8CE99A', '#FFD166', '#9775FA'];
    let molAnims = [];

    function molDiagram(cv, mols) {
      const ctx = cv.getContext('2d');
      const TAU = Math.PI * 2;
      const MONO = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      const SANS = '600 13px -apple-system, PingFang SC, sans-serif';
      const DIRF = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const ORGAN = '12px -apple-system, PingFang SC, sans-serif';
      const rowH = 48;
      const topPad = 34, botPad = 14;
      let W = 560, H = topPad + mols.length * rowH + botPad;
      let t = 0, last = 0, raf = 0, running = false, focus = null, flora = null;

      const rows = mols.map((m, i) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return {
          m,
          y: topPad + i * rowH + rowH / 2,
          color: MOL_PALETTE[i % MOL_PALETTE.length],
          speed: m.dir === 'up' ? 34 : m.dir === 'down' ? 13 : 24,
          n: m.dir === 'up' ? 5 : m.dir === 'down' ? 2 : 3,
          alpha: m.dir === 'up' ? 0.95 : m.dir === 'down' ? 0.5 : 0.75,
          sym: d.s, dirT: d.t,
          organLines: [''], organW: 0, pathX0: 112, pathX1: 400,
          ps: [], pulses: [],
        };
      });

      function fitText(txt, maxW) {
        let x = String(txt == null ? '' : txt);
        if (ctx.measureText(x).width <= maxW) return x;
        while (x.length > 1 && ctx.measureText(x + '…').width > maxW) x = x.slice(0, -1);
        return x + '…';
      }

      /* 按可用宽度折行，最多 maxLines 行；仍放不下则末尾省略 */
      function wrapText(txt, maxW, maxLines) {
        const src = String(txt == null ? '' : txt);
        if (!src) return [''];
        if (ctx.measureText(src).width <= maxW) return [src];
        /* 优先在分隔符处断开，读起来更自然 */
        const parts = src.split(/[·、,，/ ]/);
        const lines = [];
        let cur = '';
        parts.forEach((p) => {
          const seg = p.trim();
          if (!seg) return;
          const next = cur ? cur + '·' + seg : seg;
          if (ctx.measureText(next).width <= maxW) cur = next;
          else {
            if (cur) lines.push(cur);
            cur = seg;
          }
        });
        if (cur) lines.push(cur);
        if (lines.length <= maxLines) return lines;
        const keep = lines.slice(0, maxLines);
        keep[maxLines - 1] = fitText(keep[maxLines - 1] + '·' + lines.slice(maxLines).join('·'), maxW);
        return keep;
      }

      function resize() {
        const w = Math.max(320, cv.clientWidth || 560);
        const dpr = window.devicePixelRatio || 1;
        W = w;
        H = topPad + mols.length * rowH + botPad;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rows.forEach((r) => {
          ctx.font = ORGAN;
          /* 右侧靶器官区尽量宽；名字太长就折成两行，不再被截断 */
          const maxW = Math.min(240, Math.max(132, W * 0.42));
          r.organLines = wrapText(r.m.organ, maxW, 2);
          r.organW = Math.max.apply(null, r.organLines.map((x) => ctx.measureText(x).width));
          r.pathX0 = 112;
          r.pathX1 = Math.max(220, W - r.organW - 48);
          while (r.ps.length < r.n) r.ps.push({ u: Math.random(), ph: Math.random() * TAU });
          r.ps.length = r.n;
        });
        if (!flora) {
          const cols = (GUT.SPECIES || []).map((x) => x.color);
          flora = [];
          for (let k = 0; k < 16; k++) flora.push({
            x: 6 + Math.random() * 82,
            y: topPad + Math.random() * (H - topPad - 10),
            s: 1.1 + Math.random() * 1.9,
            c: cols[k % Math.max(1, cols.length)] || '#2DD4BF',
            ph: Math.random() * TAU,
          });
        }
      }

      function drawBarrier() {
        const top = topPad - 8, bot = H - 2;
        /* 组织（与主画布固有层同色系） */
        const g = ctx.createLinearGradient(150, 0, 208, 0);
        g.addColorStop(0, 'rgba(122,64,85,0.9)');
        g.addColorStop(1, 'rgba(42,22,32,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(150, top, 58, bot - top);
        /* 黏液发光带 */
        const mg = ctx.createLinearGradient(130, 0, 152, 0);
        mg.addColorStop(0, 'rgba(127,231,212,0.03)');
        mg.addColorStop(1, 'rgba(127,231,212,0.3)');
        ctx.fillStyle = mg;
        ctx.fillRect(130, top, 22, bot - top);
        ctx.strokeStyle = 'rgba(160,255,238,0.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(152, top);
        ctx.lineTo(152, bot);
        ctx.stroke();
        /* 上皮细胞一列（胶囊 + 核，轻微蠕动） */
        for (let y = top + 6; y < bot - 12; y += 15) {
          const wob = Math.sin(t * 0.8 + y * 0.35) * 0.8;
          ctx.fillStyle = 'rgba(226,150,165,0.62)';
          ctx.beginPath();
          ctx.ellipse(161 + wob, y + 6, 4.8, 6.2, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(110,59,75,0.95)';
          ctx.beginPath();
          ctx.arc(161 + wob, y + 6, 1.9, 0, TAU);
          ctx.fill();
        }
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 10, W * 0.5, H * 0.4, Math.max(W, H) * 0.85);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* 分区标签（对应示意图的三个空间） */
        ctx.fillStyle = 'rgba(126,154,160,0.9)';
        ctx.font = MONO;
        ctx.textAlign = 'left';
        ctx.fillText('菌群 · 肠腔', 10, 18);
        ctx.textAlign = 'center';
        ctx.fillText('黏液层+上皮', 168, 18);
        ctx.textAlign = 'right';
        ctx.fillText('血液 → 靶器官', W - 12, 18);

        /* 肠腔菌群漂浮点 */
        ctx.save();
        ctx.globalAlpha = 0.3;
        flora.forEach((f) => {
          ctx.fillStyle = f.c;
          ctx.beginPath();
          ctx.arc(f.x + Math.sin(t * 0.6 + f.ph) * 3, f.y + Math.cos(t * 0.5 + f.ph) * 2.5, f.s, 0, TAU);
          ctx.fill();
        });
        ctx.restore();

        drawBarrier();

        rows.forEach((r, i) => {
          const dim = focus != null && focus !== i;
          const a = dim ? 0.16 : 1;

          /* 虚线路径（流动感） */
          ctx.save();
          ctx.globalAlpha = a * (r.m.dir === 'down' ? 0.45 : 0.7);
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = -(t * r.speed * 0.9);
          ctx.beginPath();
          ctx.moveTo(r.pathX0, r.y);
          ctx.lineTo(r.pathX1, r.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(r.pathX1 + 2, r.y - 3.5);
          ctx.lineTo(r.pathX1 + 7, r.y);
          ctx.lineTo(r.pathX1 + 2, r.y + 3.5);
          ctx.stroke();
          ctx.restore();

          /* 分子名 + 方向 */
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = r.color;
          ctx.font = SANS;
          ctx.textAlign = 'left';
          ctx.fillText(fitText(r.m.name, 100), 10, r.y - 8);
          ctx.fillStyle = 'rgba(126,154,160,0.95)';
          ctx.font = DIRF;
          ctx.fillText(r.sym + ' ' + r.dirT, 10, r.y + 11);
          ctx.restore();

          /* 发光粒子 */
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          r.ps.forEach((p) => {
            const px = r.pathX0 + (r.pathX1 - r.pathX0) * p.u;
            const py = r.y + Math.sin(t * 2 + p.ph) * 3;
            ctx.globalAlpha = a * r.alpha;
            ctx.shadowColor = r.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = r.color;
            ctx.beginPath();
            ctx.arc(px, py, 2.8, 0, TAU);
            ctx.fill();
          });
          /* 抵达靶器官的脉冲环 */
          r.pulses.forEach((p) => {
            ctx.globalAlpha = a * p.life * 0.55;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(r.pathX1 + 14, r.y, 5 + (1 - p.life) * 18, 0, TAU);
            ctx.stroke();
          });
          ctx.restore();

          /* 靶器官：器官点 + 文字（加暗底，避免被组织纹理和粒子压住） */
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = r.color;
          const dx = r.pathX1 + 14;
          ctx.beginPath();
          ctx.arc(dx, r.y, 4, 0, TAU);
          ctx.fill();
          ctx.font = ORGAN;
          const ln = r.organLines.length || 1;
          const lh = 15;
          const boxH = ln * lh + 10;
          const tx = W - 12 - r.organW;
          ctx.globalAlpha = a * 0.82;
          ctx.fillStyle = 'rgba(5,10,13,0.94)';
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(tx - 7, r.y - boxH / 2, r.organW + 14, boxH, 7);
            ctx.fill();
          } else {
            ctx.fillRect(tx - 7, r.y - boxH / 2, r.organW + 14, boxH);
          }
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(226,237,240,0.98)';
          ctx.textAlign = 'right';
          r.organLines.forEach((line, k) => {
            ctx.fillText(line, W - 12, r.y + (ln === 1 ? 4 : -lh / 2 + 5 + k * lh));
          });
          ctx.restore();
        });
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (cv.offsetParent === null) { running = false; return; } /* 弹窗被关闭/隐藏 */
        if (Math.abs((cv.clientWidth || 0) - W) > 2) resize();
        rows.forEach((r) => {
          const span = Math.max(40, r.pathX1 - r.pathX0);
          r.ps.forEach((p) => {
            p.u += (r.speed * dt) / span;
            if (p.u >= 1) { p.u -= 1; r.pulses.push({ life: 1 }); }
          });
          r.pulses = r.pulses.filter((p) => p.life > 0);
          r.pulses.forEach((p) => { p.life -= dt * 1.3; });
        });
        draw();
        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (running) return;
        running = true;
        last = performance.now();
        resize();
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }

      cv.addEventListener('click', (e) => {
        const rect = cv.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const idx = rows.findIndex((r) => Math.abs(y - r.y) < rowH / 2);
        focus = focus === idx || idx < 0 ? null : idx;
      });

      return { start, stop };
    }


    /* ---------- 机制链路动态图解 ---------- */
    /* 节点由结构化数据（档案的偏移变量 + 关键分子）生成，而不是从长句里截取 */
    const molNode = (mols) => '分子：' + mols.slice(0, 2).map((m) =>
      m.name.split(/[ （(]/)[0] + (MOL_DIR[m.dir] || MOL_DIR.flat).s).join(' · ');

    function bioNodes(bio) {
      return BIO_LABEL.filter(([k]) => bio && bio[k])
        .slice(0, 3)
        .map(([k, l]) => l + (bio[k] > 0 ? ' ↑' : ' ↓'));
    }

    const shortOrgan = (organ) => String(organ || '').split(/[·、,，/]/)[0].trim();

    const hasFeedback = (text) => /正反馈|反馈环|恶性循环|循环|进一步/.test(String(text || ''));

    function chainDiagram(cv, steps, tail, feedback) {
      const ctx = cv.getContext('2d');
      const TAU = Math.PI * 2;
      const NODE_F = '12px -apple-system, PingFang SC, sans-serif';
      const nodeH = 34, rowGap = 30, gapX = 30;
      let W = 560, H = 120;
      let nodes = [], segs = [], ps = [], t = 0, last = 0, raf = 0, running = false;

      function rr(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      }

      function layout() {
        ctx.font = NODE_F;
        const labels = steps.slice();
        if (tail) labels.push(tail);
        const boxes = labels.map((txt, i) => {
          let s = String(txt);
          const cap = 168;
          if (ctx.measureText(s).width > cap) {
            while (s.length > 1 && ctx.measureText(s + '…').width > cap) s = s.slice(0, -1);
            s += '…';
          }
          return { txt: s, w: Math.min(cap, Math.ceil(ctx.measureText(s).width) + 22), last: !tail && i === labels.length - 1, tailNode: !!tail && i === labels.length - 1 };
        });

        const maxRow = W - 24;
        let x = 14, y = feedback ? 26 : 14, rowStart = true, dir = 1;
        const placed = [];
        let rowsY = [];
        boxes.forEach((b, i) => {
          if (!rowStart && x + b.w > maxRow) {
            x = 14 + (dir > 0 ? 22 : 0);
            y += nodeH + rowGap;
            rowStart = true;
            dir = -dir;
          }
          b.x = x;
          b.y = y;
          placed.push(b);
          rowsY.push(y);
          x += b.w + gapX;
          rowStart = false;
        });
        nodes = placed;

        /* 连线：同一行用直线箭头，换行处用折返曲线 */
        segs = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i], b = nodes[i + 1];
          if (Math.abs(a.y - b.y) < 2) {
            segs.push({ x1: a.x + a.w, y1: a.y + nodeH / 2, x2: b.x, y2: b.y + nodeH / 2 });
          } else {
            segs.push({
              x1: a.x + a.w, y1: a.y + nodeH / 2,
              cx1: a.x + a.w + 26, cy1: a.y + nodeH / 2,
              cx2: b.x - 26, cy2: b.y + nodeH / 2,
              x2: b.x, y2: b.y + nodeH / 2,
            });
          }
        }
        const maxY = Math.max.apply(null, rowsY) + nodeH;
        H = maxY + (feedback ? 34 : 16);
        ps = [];
        segs.forEach((sg, i) => ps.push({ i: i, u: i / Math.max(1, segs.length) }));
      }

      function resize() {
        const w = Math.max(320, cv.clientWidth || 560);
        const dpr = window.devicePixelRatio || 1;
        W = w;
        cv.width = Math.round(W * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layout();
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cv.style.height = H + 'px';
      }

      function pt(sg, u) {
        if (sg.cx1 == null) {
          return { x: sg.x1 + (sg.x2 - sg.x1) * u, y: sg.y1 + (sg.y2 - sg.y1) * u };
        }
        const mu = 1 - u;
        const x = mu * mu * mu * sg.x1 + 3 * mu * mu * u * sg.cx1 + 3 * mu * u * u * sg.cx2 + u * u * u * sg.x2;
        const y = mu * mu * mu * sg.y1 + 3 * mu * mu * u * sg.cy1 + 3 * mu * u * u * sg.cy2 + u * u * u * sg.y2;
        return { x: x, y: y };
      }

      function arrow(x1, y1, x2, y2, alpha) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(125,200,200,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const s = 5;
        ctx.fillStyle = 'rgba(125,200,200,0.75)';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(ang - 0.5) * s, y2 - Math.sin(ang - 0.5) * s);
        ctx.lineTo(x2 - Math.cos(ang + 0.5) * s, y2 - Math.sin(ang + 0.5) * s);
        ctx.closePath();
        ctx.fill();
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 8, W * 0.5, H * 0.4, Math.max(W, H) * 0.9);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* 回环虚线（正反馈） */
        if (feedback && nodes.length > 1) {
          const a = nodes[nodes.length - 1], b = nodes[0];
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = 'rgba(255,107,74,0.7)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(a.x + a.w / 2, a.y + nodeH);
          ctx.bezierCurveTo(a.x + a.w / 2, H - 4, b.x + b.w / 2, H - 4, b.x + b.w / 2, b.y + nodeH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,107,74,0.9)';
          ctx.font = '10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('正反馈回环', (a.x + b.x) / 2, H - 6);
          ctx.restore();
        }

        /* 连线 + 流动光点 */
        segs.forEach((sg) => arrow(sg.x1, sg.y1, sg.x2, sg.y2, 1));

        /* 节点 */
        nodes.forEach((n, i) => {
          const strong = n.tailNode || (n.last && i === nodes.length - 1);
          const col = strong ? '#2DD4BF' : '#7DD3FC';
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = strong ? 'rgba(45,212,191,0.16)' : 'rgba(125,211,252,0.1)';
          rr(n.x, n.y, n.w, nodeH, 9);
          ctx.fill();
          ctx.strokeStyle = strong ? 'rgba(45,212,191,0.75)' : 'rgba(125,211,252,0.5)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = strong ? '#DFFBF4' : '#DCE9EC';
          ctx.font = NODE_F;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.txt, n.x + n.w / 2, n.y + nodeH / 2 + 0.5);
          ctx.textBaseline = 'alphabetic';
        });
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (cv.offsetParent === null) { running = false; return; }
        if (Math.abs((cv.clientWidth || 0) - W) > 2) resize();
        draw();
        /* 光点画在最上层 */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ps.forEach((p) => {
          p.u += dt * 0.5;
          if (p.u >= 1) {
            p.u -= 1;
            p.i = (p.i + 1) % Math.max(1, segs.length);
          }
          const sg = segs[p.i];
          if (!sg) return;
          const q = pt(sg, p.u);
          ctx.shadowColor = '#2DD4BF';
          ctx.shadowBlur = 10;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#8FF5E4';
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.8, 0, TAU);
          ctx.fill();
        });
        ctx.restore();
        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (running) return;
        running = true;
        last = performance.now();
        resize();
        draw();
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }
      return { start, stop };
    }

    /* 把弹窗里的链路图解挂起来 */
    function mountChainDiagrams(root, stepsIn, tail, feedback) {
      const steps = (stepsIn || []).filter(Boolean);
      if (!steps.length) return;
      root.querySelectorAll('canvas[data-chaincanvas]').forEach((cv) => {
        const inst = chainDiagram(cv, steps, tail, !!feedback);
        molAnims.push(inst);
        const card = cv.closest('[data-fold]');
        if (!card || card.classList.contains('open')) inst.start();
        if (card) card.addEventListener('click', () => {
          setTimeout(() => {
            if (card.classList.contains('open')) inst.start();
            else inst.stop();
          }, 0);
        });
      });
    }

    /* ---------- 精神类状态 × 肠道菌群 对比动图 ---------- */
    /* 一行一个观察维度，一列一个状态；条长表示相对健康对照的变化方向与幅度 */
    const PSY_ROWS = [
      { t: '屏障完整度', bio: 'barrier', bad: 'down' },
      { t: '丁酸产出', bio: 'butyrate', bad: 'down' },
      { t: '炎症基线', bio: 'inflammation', bad: 'up' },
      { t: '艰难拟梭菌', keys: ['cdiff'], bad: 'up' },
      { t: '拟杆菌 / 普雷沃菌', keys: ['bacteroides', 'prevotella'], bad: 'down' },
    ];

    function psyValue(item, row) {
      if (row.bio) return (item.bio || {})[row.bio] || 0;
      const sp = item.species || {};
      let sum = 0, n = 0;
      row.keys.forEach((k) => { sum += sp[k] || 0; n += 1; });
      return n ? sum / n : 0;
    }

    function psyCompare(cv, cols, onPick, onFocus) {
      /* 静态分组柱状图：横向一列一个状态（含健康对照），纵向一行一个观察维度。
         柱子从本行的零线向上（增多/升高）或向下（减少/下降）生长；
         绿＝通常有利的方向，红＝通常不利的方向。每行按该行的最大变化归一化。 */
      const ctx = cv.getContext('2d');
      const GOOD = '#34D399', BAD = '#FF6B4A', MUTE = '#7E9AA0';
      const F_TITLE = '600 10.5px -apple-system, PingFang SC, sans-serif';
      const F_LABEL = '10.5px -apple-system, PingFang SC, sans-serif';
      const F_NOTE = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const F_DIR = '9.5px -apple-system, PingFang SC, sans-serif';
      const LABEL_W = 78, HEAD_H = 38, ROW_H = 60, PAD_R = 12, TOP = 6;
      const MAXH = 11, ARROW = 4;          /* 柱体最大高度 + 末端箭头高 */
      let W = 660, H = 0, slot = 60, bw = 16, hover = -1;
      let DPR = Math.min(2, window.devicePixelRatio || 1);
      let ro = null, roW = 0;

      const data = cols.map((c) => ({
        col: c,
        vals: PSY_ROWS.map((r) => psyValue(c.item, r)),
      }));
      const N = data.length;
      const RN = PSY_ROWS.length;

      /* 每行独立归一化：行内绝对值的最大者占满 MAXH */
      const maxAbs = PSY_ROWS.map((r, ri) => {
        let m = 0.0001;
        data.forEach((d) => { m = Math.max(m, Math.abs(d.vals[ri])); });
        return m;
      });

      /* 中文按字折行，最多两行 */
      function wrap(text, maxW, font) {
        ctx.font = font;
        const out = [];
        let cur = '';
        const str = String(text);
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
          else cur += ch;
          if (out.length >= 2) { cur = ''; break; }
        }
        if (cur && out.length < 2) out.push(cur);
        return out;
      }

      function draw() {
        const plotW = W - LABEL_W - PAD_R;
        if (!(plotW > 20) || !N) return;
        slot = plotW / N;
        bw = Math.max(6, Math.min(26, slot * 0.52));
        H = TOP + HEAD_H + RN * ROW_H + 32;

        if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) {
          cv.width = Math.round(W * DPR);
          cv.height = Math.round(H * DPR);
          cv.style.height = H + 'px';
        }
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const bg = ctx.createRadialGradient(W * 0.5, H * 0.3, 20, W * 0.5, H * 0.5, Math.max(W, H));
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'alphabetic';

        /* ---- 顶部：一列一个状态名（颜色点 + 最多两行） ---- */
        data.forEach((d, i) => {
          const cx = LABEL_W + slot * (i + 0.5);
          const on = hover < 0 || hover === i;
          if (hover === i) {
            ctx.fillStyle = 'rgba(45,212,191,0.07)';
            ctx.fillRect(LABEL_W + slot * i, TOP - 2, slot, H - TOP - 4);
          }
          ctx.globalAlpha = on ? 1 : 0.35;
          ctx.beginPath();
          ctx.arc(cx, TOP + 5, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = d.col.color;
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.font = F_TITLE;
          ctx.fillStyle = d.col.color;
          wrap(d.col.short, slot - 4, F_TITLE).forEach((ln, k) => {
            ctx.fillText(ln, cx, TOP + 20 + k * 12);
          });
        });
        ctx.globalAlpha = 1;

        /* ---- 逐行（维度）绘制 ---- */
        PSY_ROWS.forEach((r, ri) => {
          const rowTop = TOP + HEAD_H + ri * ROW_H;
          const zeroY = rowTop + ROW_H / 2;
          if (ri % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.022)';
            ctx.fillRect(0, rowTop, W, ROW_H);
          }
          /* 左侧维度名 */
          ctx.textAlign = 'left';
          ctx.font = F_LABEL;
          ctx.fillStyle = MUTE;
          const ll = wrap(r.t, LABEL_W - 16, F_LABEL);
          const y0 = zeroY - (ll.length - 1) * 6 + 3;
          ll.forEach((ln, k) => ctx.fillText(ln, 10, y0 + k * 12));

          /* 零线 */
          ctx.strokeStyle = 'rgba(126,154,160,0.34)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(LABEL_W, zeroY + 0.5);
          ctx.lineTo(W - PAD_R, zeroY + 0.5);
          ctx.stroke();
          ctx.setLineDash([]);

          /* 该行的柱子 */
          data.forEach((d, i) => {
            const v = d.vals[ri];
            const cx = LABEL_W + slot * (i + 0.5);
            const on = hover < 0 || hover === i;
            ctx.globalAlpha = on ? (i === 0 ? 0.6 : 1) : 0.3;
            if (Math.abs(v) < 1e-6) {
              ctx.fillStyle = MUTE;
              ctx.fillRect(cx - bw * 0.28, zeroY - 1, bw * 0.56, 2);   /* 对照＝零基准 */
              return;
            }
            const h = Math.max(3.5, Math.abs(v) / maxAbs[ri] * MAXH);
            const bad = (v > 0) === (r.bad === 'up');
            ctx.fillStyle = bad ? BAD : GOOD;
            const up = v > 0;
            const top = up ? zeroY - h : zeroY;
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(cx - bw / 2, top, bw, h, 2);
              ctx.fill();
            } else {
              ctx.fillRect(cx - bw / 2, top, bw, h);
            }
            /* 末端箭头：再强化一次方向感 */
            const tipY = up ? zeroY - h - ARROW : zeroY + h + ARROW;
            ctx.beginPath();
            ctx.moveTo(cx - bw * 0.62, up ? zeroY - h + 1 : zeroY + h - 1);
            ctx.lineTo(cx + bw * 0.62, up ? zeroY - h + 1 : zeroY + h - 1);
            ctx.lineTo(cx, tipY);
            ctx.closePath();
            ctx.fill();
            /* 直接写出方向 */
            ctx.font = F_DIR;
            ctx.textAlign = 'center';
            ctx.fillText(up ? '上升' : '下降', cx, up ? tipY - 2 : tipY + 9);
          });
        });
        ctx.globalAlpha = 1;

        /* ---- 底部图例：按顺序累加宽度排版，绝不重叠 ---- */
        const footY = TOP + HEAD_H + RN * ROW_H + 14;
        ctx.font = F_NOTE;
        ctx.textAlign = 'left';
        let lx = 10;
        [['柱端已标 上升 / 下降', MUTE], ['绿 = 有利方向', GOOD], ['红 = 不利方向', BAD]].forEach((it) => {
          ctx.fillStyle = it[1];
          ctx.fillText(it[0], lx, footY + 8);
          lx += ctx.measureText(it[0]).width + 18;
        });
        const tipTxt = '点任意一列看它的资料卡';
        if (lx + ctx.measureText(tipTxt).width + 14 < W - PAD_R) {
          ctx.textAlign = 'right';
          ctx.fillStyle = 'rgba(126,154,160,0.7)';
          ctx.fillText(tipTxt, W - PAD_R, footY + 8);
        }
      }

      function colAt(clientX) {
        const rect = cv.getBoundingClientRect();
        const x = clientX - rect.left;
        if (x < LABEL_W || !N) return -1;
        const i = Math.floor((x - LABEL_W) / slot);
        return i >= 0 && i < N ? i : -1;
      }

      cv.addEventListener('click', (e) => {
        const i = colAt(e.clientX);
        if (i > 0 && data[i].col.id && onPick) onPick(data[i].col.id);
      });
      cv.addEventListener('mousemove', (e) => {
        const i = colAt(e.clientX);
        cv.style.cursor = i > 0 && data[i].col.id ? 'pointer' : 'default';
        if (i !== hover) {
          hover = i;
          draw();
          if (onFocus) onFocus(i < 0 ? data[0].col.heading : data[i].col.heading);
        }
      });
      cv.addEventListener('mouseleave', () => {
        if (hover !== -1) {
          hover = -1;
          draw();
          if (onFocus) onFocus(data[0].col.heading);
        }
      });

      function start() {
        W = Math.max(360, Math.floor(cv.clientWidth || 660));
        roW = W;
        hover = -1;
        draw();
        if (window.ResizeObserver) {
          ro = new ResizeObserver(() => {
            const w = Math.max(360, Math.floor(cv.clientWidth || 660));
            if (Math.abs(w - roW) < 2) return;
            roW = w;
            W = w;
            draw();
          });
          ro.observe(cv);
        }
        if (onFocus && data[0]) onFocus(data[0].col.heading);
      }
      function stop() {
        if (ro) { ro.disconnect(); ro = null; }
      }
      return { start, stop };
    }

    /* 把弹窗里的分子画布挂起来：卡片展开时运行，收起/关闭时暂停 */
    function mountMolDiagrams(root, mols) {
      if (!mols || !mols.length) return;
      root.querySelectorAll('canvas[data-molcanvas]').forEach((cv) => {
        const inst = molDiagram(cv, mols);
        molAnims.push(inst);
        const card = cv.closest('[data-fold]');
        if (!card || card.classList.contains('open')) inst.start();
        if (card) card.addEventListener('click', () => {
          setTimeout(() => {
            if (card.classList.contains('open')) inst.start();
            else inst.stop();
          }, 0);
        });
      });
    }

    /* ---------- 可翻转的小卡片（关键小分子 / 机制 / 研究背景） ---------- */
    /* 一句话摘要：取正文首句，作为卡片正面的"结论" */
    function brief(html, n) {
      const s = String(html == null ? '' : html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const m = s.match(/^[^。！？；]{6,}?[。！？；]/);
      let t = m ? m[0] : s;
      const max = n || 34;
      return t.length > max ? t.slice(0, max) + '…' : t;
    }

    /* 润色：把整段长文拆成"一句结论 + 若干短句要点"，保留原文里的 <b> 强调 */
    function polish(html) {
      const keep = [];
      let t = String(html == null ? '' : html).replace(/<b>([\s\S]*?)<\/b>/g, (m, p1) => {
        keep.push(p1);
        return '\u0001' + (keep.length - 1) + '\u0001';
      });
      t = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      const sents = t.match(/[^。！？；]+[。！？；]?/g) || [t];
      const lines = [];
      sents.forEach((x) => {
        const s = x.trim();
        if (!s) return;
        /* 过短的碎片并回上一句，避免出现只有两三个字的"要点" */
        if (lines.length && s.length < 14) lines[lines.length - 1] += s;
        else lines.push(s);
      });
      /* 过长的句子在逗号处再断一次，避免一行挤太多字 */
      const refined = [];
      lines.forEach((s) => {
        if (s.length > 46 && s.indexOf('，') > 0) {
          const mid = s.indexOf('，', Math.floor(s.length / 3));
          if (mid > 0 && mid < s.length - 8) {
            refined.push(s.slice(0, mid + 1));
            refined.push(s.slice(mid + 1));
            return;
          }
        }
        refined.push(s);
      });
      const put = (s) => s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<b>' + keep[+i] + '</b>');
      return refined.map((s, i) => (i === 0
        ? `<p class="plLead">${put(s)}</p>`
        : `<div class="plLine"><i></i><span>${put(s)}</span></div>`)).join('');
    }

    /* 一张可展开提示卡片：o = { tag, t, sub?, body, open? } */
    function foldCard(o) {
      return `<div class="foldCard${o.open ? ' open' : ''}" data-fold>
        <button class="foldHead" type="button" aria-expanded="${o.open ? 'true' : 'false'}">
          <span class="foldTag">${o.tag}</span>
          <b>${o.t}</b>
          ${o.sub ? `<span class="foldSub">${o.sub}</span>` : ''}
          <i class="foldArrow">\u203a</i>
        </button>
        <div class="foldPanel"><div class="foldBody">${o.body}</div></div>
      </div>`;
    }

    const foldDeck = (cards) => `<div class="foldDeck">${cards.filter(Boolean).map(foldCard).join('')}</div>`;

    function foldBar(n) {
      return `<div class="foldBar">
        <button class="miniBtn" id="foldAll" type="button">全部展开</button>
        <span class="tiny">${n} 个模块 · 默认只显示一句提示，点标题展开完整解释</span>
      </div>`;
    }

    function initFold(root) {
      const cards = Array.prototype.slice.call(root.querySelectorAll('[data-fold]'));
      const setOpen = (c, open) => {
        const panel = c.querySelector('.foldPanel');
        const head = c.querySelector('.foldHead');
        c.classList.toggle('open', open);
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          panel.style.height = panel.scrollHeight + 'px';
          clearTimeout(c._foldT);
          c._foldT = setTimeout(() => {
            if (c.classList.contains('open')) panel.style.height = 'auto';
          }, 300);
        } else {
          panel.style.height = panel.scrollHeight + 'px';
          requestAnimationFrame(() => { panel.style.height = '0px'; });
        }
      };
      cards.forEach((c) => {
        const panel = c.querySelector('.foldPanel');
        panel.style.height = c.classList.contains('open') ? 'auto' : '0px';
        c.querySelector('.foldHead').addEventListener('click', () => setOpen(c, !c.classList.contains('open')));
      });
      const all = root.querySelector('#foldAll');
      if (all) all.addEventListener('click', () => {
        const open = !all.classList.contains('on');
        all.classList.toggle('on', open);
        all.textContent = open ? '全部收起' : '全部展开';
        cards.forEach((c) => setOpen(c, open));
      });
    }

    /* 某条状态涉及哪些肠-器官轴 */
    function axisLinks(id) {
      const rel = GUT.AXES.filter((a) => (a.rel || []).indexOf(id) >= 0);
      if (!rel.length) return '';
      return `<h4 class="repH">相关的肠-器官轴</h4><div class="pfLine">` +
        rel.map((a) =>
          `<button class="pfTag link" data-axgo="${a.id}" style="color:${a.color};border-color:${a.color}55;background:${a.color}12">${a.title} · ${a.organ}</button>`
        ).join('') + '</div>';
    }

    /* 档案里所有条目的合并影响（直接读模型里已叠加并做过软饱和的结果） */
    function profileAgg() {
      const envD = {}, bio = {}, sp = {};
      GUT.ENV.forEach((e) => { if (sim.profEnv[e.key]) envD[e.key] = sim.profEnv[e.key]; });
      BIO_LABEL.forEach(([k]) => { if (sim.profBio[k]) bio[k] = sim.profBio[k]; });
      S.forEach((s, i) => { if (sim.profSp[i]) sp[s.id] = sim.profSp[i]; });
      return { envD, bio, sp };
    }

    const BIO_LABEL = [
      ['inflammation', '炎症'], ['butyrate', '丁酸'], ['barrier', '屏障'],
      ['mucus', '黏液层'], ['gas', '产气'], ['h2s', 'H₂S'],
    ];

    function profileSummaryHTML() {
      const a = profileAgg();
      const envAll = GUT.ENV.filter((e) => a.envD[e.key]).map((e) => {
        const v = a.envD[e.key];
        const good = e.key === 'fiber' || e.key === 'fermented' ? v > 0 : v < 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${e.label} ${signed(v)}</span>`;
      });
      const envTags = envAll.slice(0, 3).join('');
      const bioAll = BIO_LABEL.filter(([k]) => a.bio[k]).map(([k, l]) => {
        const v = a.bio[k] * 100;
        const good = k === 'inflammation' || k === 'gas' || k === 'h2s' ? v < 0 : v > 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${l} ${signed(v)}</span>`;
      });
      const bioTags = bioAll.slice(0, 3).join('');
      const spTags = Object.keys(a.sp)
        .filter((k) => Math.abs(a.sp[k]) > 0.08)
        .sort((x, y) => Math.abs(a.sp[y]) - Math.abs(a.sp[x]))
        .slice(0, 3)
        .map((k) => {
          const v = a.sp[k] * 100;
          const idx = IX[k];
          const sp = idx != null ? S[idx] : null;
          const good = sp && (sp.role === 'core' || sp.role === 'beneficial') ? v > 0 : v < 0;
          return `<span class="pfTag ${good ? 'down' : 'up'}">${sp ? sp.name : k} ${signed(v, '%')}</span>`;
        }).join('');
      const moreN = envAll.length + bioAll.length - 6;
      const moreTag = moreN > 0 ? `<span class="pfTag">还有 ${moreN} 项</span>` : '';
      return (envTags ? `<div class="pfLine">${envTags}</div>` : '') +
        (bioTags ? `<div class="pfLine">${bioTags}</div>` : '') +
        (spTags ? `<div class="pfLine">${spTags}${moreTag}</div>` : '') +
        '<p class="tiny">上面是档案对「环境旋钮 / 生态指标 / 物种竞争力」的净偏移。点「查看影响报告」读完整解释与调整建议。</p>';
    }

    function syncProfileChips() {
      Object.keys(pfChipEls).forEach((id) =>
        pfChipEls[id].classList.toggle('on', sim.profile.indexOf(id) >= 0)
      );
      const n = sim.profile.length;
      const t = $('pfCount');
      if (t) t.textContent = n ? n + ' 项生效' : '未填写';
      const sum = $('pfSummary');
      if (sum) {
        sum.innerHTML = n
          ? profileSummaryHTML()
          : '<p class="tiny">还没有填写。勾选或输入你的状态，生态会立刻把这些因素算进去。</p>';
      }
    }

    function toggleProfile(id) {
      const p = PFI[id];
      if (!p) return;
      const has = sim.profile.indexOf(id) >= 0;
      const next = has ? sim.profile.filter((x) => x !== id) : sim.profile.concat([id]);
      sim.setProfile(next);
      syncProfileChips();
      U.syncEnv();
      U.toast(has ? '已移除：' + p.label : '已加入档案：' + p.label + ' · 生态将重新调整');
    }

    function openProfileCard(id) {
      const p = PFI[id];
      if (!p) return;
      const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF', label: '' };
      const on = sim.profile.indexOf(id) >= 0;
      const b = p.bio || {};
      const bioCell = (k, label, goodUp) => {
        const v = (b[k] || 0) * 100;
        const c = Math.abs(v) < 0.5 ? '#93aeb4' : (goodUp ? v > 0 : v < 0) ? '#34D399' : '#FF6B4A';
        return `<div><span>${label}</span><b style="color:${c}">${v > 0 ? '+' : ''}${v.toFixed(0)}%</b></div>`;
      };
      openModal(`
        <span class="mTag" style="color:${g.color};border-color:${g.color}66;background:${g.color}12">${p.tag || g.label}</span>
        <h3 class="mTitle">${p.label}</h3>
        <p class="mSub">${on ? '已在你的档案中生效' : '尚未加入档案'} · 这是群体层面的统计规律，不是对你的诊断</p>
        <p class="mLead">${p.lead}</p>
        <div class="mGrid">
          ${bioCell('inflammation', '炎症基线偏移', false)}
          ${bioCell('butyrate', '丁酸产出偏移', true)}
          ${bioCell('barrier', '肠屏障偏移', true)}
          ${bioCell('mucus', '黏液层偏移', true)}
        </div>
        ${foldBar(7)}
        ${foldDeck([
          { tag: '菌群', t: '肠道菌群会发生什么变化', sub: brief(p.micro), body: polish(p.micro), open: true },
          { tag: '分子', t: '关键小分子 · 它们去影响哪个器官', sub: molBrief(p.molecules), body: `<canvas class="molDiagram" data-molcanvas></canvas><div class="molWrap">${molRows(p.molecules)}</div>` },
          { tag: '机制', t: '机制 · 它改写了什么', sub: brief(p.mech), body: `<canvas class="chainDiagram" data-chaincanvas></canvas>${polish(p.mech)}` },
          { tag: '背景', t: '研究背景 / 冷知识', sub: brief(p.fact), body: polish(p.fact) },
          { tag: '饮食', t: '饮食调整建议', sub: `${p.diet.length} 条可执行建议`, body: `<ul class="repCause">${p.diet.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>` },
          { tag: '作息', t: '作息 / 生活方式建议', sub: `${p.routine.length} 条可执行建议`, body: `<ul class="repCause">${p.routine.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>` },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(p.watch), body: polish(p.watch) },
        ])}
        ${axisLinks(id)}
        <button class="dBtn" id="pfToggle">${on ? '从我的档案中移除' : '加入我的档案'}</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      mountMolDiagrams($('modalBody'), p.molecules);
      mountChainDiagrams(
        $('modalBody'),
        [p.label].concat(bioNodes(p.bio), ['菌群改写', molNode(p.molecules)]),
        shortOrgan(p.molecules.length ? p.molecules[0].organ : '') ? '影响' + shortOrgan(p.molecules[0].organ) : '',
        hasFeedback(p.mech)
      );
      $('pfToggle').addEventListener('click', () => { toggleProfile(id); closeModal(); });
      const pfBody = $('modalBody');
      pfBody.querySelectorAll('[data-axgo]').forEach((b) =>
        b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.axgo]))
      );
    }
    U.openProfileCard = openProfileCard;

    function openProfileReport(unknown) {
      if (!sim.profile.length) { U.toast('档案还是空的：先勾选或输入你的状态'); return; }
      const a = profileAgg();
      const items = sim.profile.map((id) => PFI[id]).filter(Boolean);
      const sgn = (v) => (v > 0.005 ? '↑ 上升' : v < -0.005 ? '↓ 下降' : '→ 基本不变');

      const envTags = GUT.ENV.filter((e) => a.envD[e.key]).map((e) => {
        const v = a.envD[e.key];
        const good = e.key === 'fiber' || e.key === 'fermented' ? v > 0 : v < 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${e.label} ${signed(v)}</span>`;
      }).join('');
      const bioTags = BIO_LABEL.filter(([k]) => a.bio[k]).map(([k, l]) => {
        const v = a.bio[k] * 100;
        const good = k === 'inflammation' || k === 'gas' || k === 'h2s' ? v < 0 : v > 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${l}${v > 0 ? ' ↑' : ' ↓'} ${Math.abs(v).toFixed(0)}</span>`;
      }).join('');
      const spTags = Object.keys(a.sp)
        .filter((k) => Math.abs(a.sp[k]) > 0.05)
        .sort((x, y) => Math.abs(a.sp[y]) - Math.abs(a.sp[x]))
        .slice(0, 6)
        .map((k) => {
          const v = a.sp[k] * 100;
          const idx = IX[k];
          const sp = idx != null ? S[idx] : null;
          const good = sp && (sp.role === 'core' || sp.role === 'beneficial') ? v > 0 : v < 0;
          return `<span class="pfTag ${good ? 'down' : 'up'}">${sp ? sp.name : k} ${signed(v, '%')}</span>`;
        }).join('');

      const molMap = {};
      items.forEach((p) => p.molecules.forEach((m) => {
        const o = molMap[m.name] || (molMap[m.name] = { name: m.name, score: 0, organs: [], desc: '', dir: 'flat' });
        o.score += m.dir === 'up' ? 1 : m.dir === 'down' ? -1 : 0;
        m.organ.split('·').map((x) => x.trim()).filter(Boolean).forEach((og) => {
          if (o.organs.indexOf(og) < 0) o.organs.push(og);
        });
        if (!o.desc) o.desc = m.desc;
      }));
      const mols = Object.keys(molMap).map((k) => molMap[k])
        .sort((x, y) => Math.abs(y.score) - Math.abs(x.score))
        .map((m) => ({
          name: m.name,
          dir: m.score > 0 ? 'up' : m.score < 0 ? 'down' : 'flat',
          organ: m.organs.join(' · '),
          desc: m.desc + (Math.abs(m.score) > 1 ? ' <em>（多个状态共同指向同一个分子）</em>' : ''),
        }));

      const diet = uniq(items.reduce((acc, p) => acc.concat(p.diet), [])).slice(0, 8);
      const routine = uniq(items.reduce((acc, p) => acc.concat(p.routine), [])).slice(0, 6);

      const chips = items.map((p) => {
        const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
        return `<button class="libCard" data-pf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · 查看资料卡</span></button>`;
      }).join('');

      openModal(`
        <span class="mTag" style="color:#A78BFA;border-color:#A78BFA66;background:#A78BFA12">档案 · 影响报告</span>
        <h3 class="mTitle">我的状态档案 · 综合影响报告</h3>
        <p class="mSub">共 ${items.length} 项状态生效 · 下面是它们叠加后对生态的净影响</p>
        <p class="mLead">当前档案把生态推向：炎症 ${sgn(a.bio.inflammation)}、丁酸 ${sgn(a.bio.butyrate)}、肠屏障 ${sgn(a.bio.barrier)}、产气 ${sgn(a.bio.gas)}。${(a.bio.butyrate < -0.02 ? '核心问题通常是<b>产丁酸菌受压</b>：丁酸一下降，屏障与炎症会同时恶化。' : '')}</p>
        ${unknown && unknown.length ? `<p class="tiny">没认出来：<b>${unknown.join('、')}</b>——换个说法试试（如"压力大""熬夜""经期"）。</p>` : ''}
        <h4 class="repH">① 状态清单</h4>
        <div class="libGrid">${chips}</div>
        <h4 class="repH">② 环境旋钮的偏移</h4>
        <div class="pfLine">${envTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">③ 生态指标的净变化</h4>
        <div class="pfLine">${bioTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">④ 物种竞争力的偏移</h4>
        <div class="pfLine">${spTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">⑤ 关键小分子 → 靶器官</h4>
        <div class="molWrap">${molRows(mols)}</div>
        <h4 class="repH">⑥ 饮食调整建议</h4>
        <ul class="repCause">${diet.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <h4 class="repH">⑦ 作息 / 生活方式建议</h4>
        <ul class="repCause">${routine.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      $('modalBody').querySelectorAll('[data-pf]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.pf))
      );
    }
    U.openProfileReport = openProfileReport;

    /* 自由输入：把一句话拆成词条，匹配档案项 */
    function parseProfileText(text) {
      const tokens = text.split(/[,，、\s+＋和跟配与；;。.！!？?]+/).map((s) => s.trim()).filter(Boolean);
      const hit = [], unknown = [];
      tokens.forEach((t) => {
        /* 关键词越长越具体，优先命中：例如"想恋爱"胜过"恋爱" */
        let best = null, bestLen = 0;
        PF.forEach((p) => {
          if (!p.keywords) return;
          p.keywords.forEach((k) => {
            if (t.indexOf(k) >= 0 && k.length > bestLen) { best = p; bestLen = k.length; }
          });
        });
        const byKw = best;
        const byLabel = PF.find((p) => p.label === t || (t.length >= 2 && p.label.indexOf(t) >= 0));
        const found = byKw || byLabel;
        if (found) { if (hit.indexOf(found) < 0) hit.push(found); }
        else unknown.push(t);
      });
      return { hit, unknown };
    }

    function submitProfileText() {
      const el = $('pfInput');
      const text = el.value.trim();
      if (!text) { U.toast('写下你的状态，例如：糖尿病 压力大 熬夜 经期'); return; }
      const r = parseProfileText(text);
      if (!r.hit.length) { U.toast('没识别出状态，试试：糖尿病 / 抑郁 / 压力大 / 熬夜 / 经期 / 便秘'); return; }
      const next = sim.profile.slice();
      let added = 0;
      r.hit.forEach((p) => { if (next.indexOf(p.id) < 0) { next.push(p.id); added++; } });
      sim.setProfile(next);
      syncProfileChips();
      U.syncEnv();
      el.value = '';
      if (!added) { U.toast('这些状态已经在档案里了'); return; }
      U.toast('已加入档案：' + r.hit.map((p) => p.label).join('、'));
      openProfileReport(r.unknown);
    }

    function buildProfile() {
      const box = $('profileBody');
      if (!box) return;
      box.innerHTML = '';
      GUT.PROFILE_GROUPS.forEach((g) => {
        const items = PF.filter((p) => p.group === g.id);
        if (!items.length) return;
        const sec = document.createElement('div');
        sec.className = 'pfGroup';
        sec.innerHTML = `<div class="pfGroupHead" style="color:${g.color}"><i style="background:${g.color}"></i>${g.label}</div>`;
        const wrap = document.createElement('div');
        wrap.className = 'pfChips';
        items.forEach((p) => {
          const b = document.createElement('button');
          b.className = 'pfChip' + (p.tone === 'good' ? ' good' : '');
          b.innerHTML = `<span>${p.label}</span><i class="pfInfo" title="查看资料卡">?</i>`;
          b.title = p.lead;
          b.addEventListener('click', () => toggleProfile(p.id));
          b.querySelector('.pfInfo').addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileCard(p.id);
          });
          wrap.appendChild(b);
          pfChipEls[p.id] = b;
        });
        sec.appendChild(wrap);
        box.appendChild(sec);
      });
      syncProfileChips();
      U.syncEnv();

      const inp = $('pfInput');
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitProfileText(); });
      const add = $('pfAdd');
      if (add) add.addEventListener('click', submitProfileText);
      const rep = $('pfReport');
      if (rep) rep.addEventListener('click', () => openProfileReport());
      const fold = $('pfFold');
      if (fold) fold.addEventListener('click', () => {
        const body = $('profileBody');
        const willHide = !body.hidden;
        body.hidden = willHide;
        fold.textContent = willHide ? '展开' : '收起';
      });
      const clr = $('pfClear');
      if (clr) clr.addEventListener('click', () => {
        if (!sim.profile.length) { U.toast('档案已经是空的'); return; }
        sim.setProfile([]);
        syncProfileChips();
        U.syncEnv();
        U.toast('已清空状态档案');
      });
    }

    /* ============ 生态指标条 ============ */
    const METRICS = [
      { key: 'diversity', label: '物种多样性', get: () => sim.diversity },
      { key: 'butyrate', label: '丁酸 (butyrate)', get: () => clamp(sim.butyrate, 0, 1) },
      { key: 'scfa', label: '短链脂肪酸总量', get: () => clamp(sim.scfa, 0, 1) },
      { key: 'mucus', label: '黏液层厚度', get: () => sim.mucus },
      { key: 'barrier', label: '肠屏障完整度', get: () => sim.barrier },
      { key: 'resistance', label: '定植抵抗', get: () => clamp(sim.resistance / 1.4, 0, 1) },
      { key: 'h2s', label: '硫化氢 H₂S', get: () => clamp(sim.h2s, 0, 1), invert: true },
      { key: 'gas', label: '产气 / 腹胀', get: () => clamp(sim.gas, 0, 1), invert: true },
      { key: 'inflammation', label: '炎症水平', get: () => sim.inflammation, invert: true },
    ];
    const metricEls = [];
    function buildMetrics() {
      const box = $('metrics');
      box.innerHTML = '';
      METRICS.forEach((m) => {
        const el = document.createElement('div');
        el.className = 'metric';
        el.innerHTML =
          `<div class="mHead"><span class="mLink" data-m="${m.key}" title="点击查看这个指标的解释">${m.label}</span><b>—</b></div>` +
          `<div class="mBar"><i class="mFill"></i></div>`;
        box.appendChild(el);
        metricEls.push(el);
      });
      box.querySelectorAll('.mLink').forEach((s) =>
        s.addEventListener('click', () => openMetric(s.dataset.m))
      );
    }

    /* HUD 上的 pH / 传输时间 / 总菌量 / 肠型 也可点开解释 */
    const HUD_METRICS = [
      ['hudPH', 'ph'], ['hudTransit', 'transit'], ['hudTotal', 'total'], ['hudEntero', 'enterotype'],
    ];
    /* 点击时间轴上的事件标记 → 回顾该事件至今的累计变化 */
    function buildTimelineLinks() {
      $('tlTrack').addEventListener('click', (e) => {
        const m = e.target.closest('.tlMark');
        if (!m) return;
        const ev = sim.events[+m.dataset.i];
        if (!ev || !ev.snap) return;
        openChangeReport({ id: ev.id, label: ev.label, tone: ev.tone, day: ev.day, before: ev.snap, after: sim.snapshot() });
      });
    }

    function buildHudLinks() {
      HUD_METRICS.forEach(([id, key]) => {
        const el = $(id);
        el.classList.add('mLink');
        el.title = '点击查看解释';
        el.addEventListener('click', () => openMetric(key));
      });
    }

    /* ============ 堆叠条 + 图例 ============ */
    const stackBars = [];
    function buildStack() {
      const box = $('stack');
      box.innerHTML = '';
      S.forEach((sp) => {
        const i = document.createElement('i');
        i.style.background = sp.color;
        i.style.width = '0%';
        i.title = sp.name;
        box.appendChild(i);
        stackBars.push(i);
      });
      const lg = $('stackLegend');
      lg.innerHTML = '';
      S.forEach((sp, idx) => {
        const em = document.createElement('em');
        em.innerHTML = `<i style="background:${sp.color}"></i>${sp.name}`;
        em.addEventListener('click', () => select(idx, true));
        lg.appendChild(em);
      });
    }

    /* ============ 物种列表 ============ */
    const spRows = [];
    function buildSpecies() {
      const box = $('species');
      box.innerHTML = '';
      S.forEach((sp, idx) => {
        const row = document.createElement('div');
        row.className = 'spRow';
        row.innerHTML =
          `<i style="background:${sp.color}"></i>` +
          `<div class="spName"><b>${sp.name}</b><div class="spBar"><i style="background:${sp.color}"></i></div></div>` +
          `<div class="spPct">—</div>`;
        row.addEventListener('click', () => select(idx, true));
        row.addEventListener('mouseenter', () => (R.hover = idx));
        row.addEventListener('mouseleave', () => (R.hover = null));
        box.appendChild(row);
        spRows.push(row);
      });
    }

    /* ============ 选中 ============ */
    function select(idx, openCard) {
      if (idx != null && idx < 0) {
        U.selected = null;
        R.highlight = null;
        spRows.forEach((r) => r.classList.remove('on'));
        const dd0 = $('detail');
        if (dd0) dd0.innerHTML = '<p class="tiny">在画布中点选一种菌，这里会显示它的实时数据。</p>';
        return;
      }
      if (U.selected === idx && openCard) { openSpecies(idx); return; }
      U.selected = idx;
      R.highlight = idx == null ? null : idx;
      spRows.forEach((r, i) => r.classList.toggle('on', i === idx));
      if (openCard) openSpecies(idx);
    }
    U.select = select;

    /* ============ 历史（趋势） ============ */
    function pushHistory() {
      if (sim.day - U.lastHistDay < 0.5) return;
      U.lastHistDay = sim.day;
      U.history.push({
        day: sim.day, n: sim.n.slice(),
        health: GUT.healthOf(sim), div: sim.diversity,
        but: clamp(sim.butyrate, 0, 1), bar: clamp(sim.barrier, 0, 1), infl: clamp(sim.inflammation, 0, 1),
      });
      if (U.history.length > 120) U.history.shift();
    }

    /* ============ 弹窗 ============ */
    const modalRoot = $('modalRoot');

    /* ---------- 文案里提到的菌种 → 可点击跳转到菌种图鉴 ---------- */
    const SP_ALIAS = {
      bacteroides: ['脆弱拟杆菌', '拟杆菌'],
      prevotella: ['普雷沃菌', '普氏菌'],
      faecalibacterium: ['普拉梭菌', '普氏栖粪杆菌', '柔嫩梭菌'],
      roseburia: ['罗氏菌'],
      bifidobacterium: ['双歧杆菌'],
      lactobacillus: ['乳酸杆菌', '乳杆菌'],
      akkermansia: ['嗜黏蛋白阿克曼菌', '阿克曼菌'],
      enterobacteriaceae: ['肠杆菌科', '大肠杆菌', '肠杆菌'],
      cdiff: ['艰难拟梭菌', '艰难梭菌'],
      desulfovibrio: ['硫酸盐还原菌', '脱硫弧菌'],
    };
    const SP_TERMS = (function () {
      const out = [];
      Object.keys(SP_ALIAS).forEach((id) => {
        SP_ALIAS[id].forEach((w) => out.push({ id: id, w: w }));
      });
      out.sort((a, b) => b.w.length - a.w.length);
      return out;
    })();

    /* 只替换纯文本节点，不动标签与已有按钮；每个菌种在同一段里只链一次 */
    function linkifySpecies(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const el = n.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (el.closest('button, a, canvas, .spLink, .libCard, script')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const text = node.nodeValue;
        if (!SP_TERMS.some((t) => text.indexOf(t.w) >= 0)) return;
        const seen = {};
        const frag = document.createDocumentFragment();
        let buf = '';
        let changed = false;
        const flush = () => {
          if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
        };
        let i = 0;
        while (i < text.length) {
          let hitW = null, hitId = null;
          for (let k = 0; k < SP_TERMS.length; k++) {
            const t = SP_TERMS[k];
            if (seen[t.id]) continue;
            if (text.substr(i, t.w.length) !== t.w) continue;
            /* "拟杆菌门"是门名不是菌种本身，跳过 */
            if (text.charAt(i + t.w.length) === '门') continue;
            hitW = t.w;
            hitId = t.id;
            break;
          }
          if (hitW) {
            seen[hitId] = true;
            const idx = GUT.SPECIES_INDEX[hitId];
            flush();
            const el = document.createElement('span');
            el.className = 'spLink';
            el.setAttribute('data-gosp', hitId);
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            const sp = idx != null ? S[idx] : null;
            el.title = `「${sp ? sp.name : hitW}」${sp ? '—— ' + String(sp.sci.headline || '').replace(/<[^>]+>/g, '') : ''}\n点击打开它的完整图鉴`;
            el.textContent = hitW;
            frag.appendChild(el);
            changed = true;
            i += hitW.length;
          } else {
            buf += text.charAt(i);
            i += 1;
          }
        }
        flush();
        if (changed) node.parentNode.replaceChild(frag, node);
      });
    }

    $('modalBody').addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('.spLink[data-gosp]');
      if (el) openSpecies(GUT.SPECIES_INDEX[el.getAttribute('data-gosp')]);
    });
    $('modalBody').addEventListener('keydown', (e) => {
      const el = e.target.closest && e.target.closest('.spLink[data-gosp]');
      if (el && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openSpecies(GUT.SPECIES_INDEX[el.getAttribute('data-gosp')]);
      }
    });

    function openModal(html) {
      molAnims.forEach((a) => a.stop());
      molAnims = [];
      $('modalBody').innerHTML = html;
      modalRoot.hidden = false;
      linkifySpecies($('modalBody'));
      initFold($('modalBody'));
    }
    function closeModal() {
      modalRoot.hidden = true;
      molAnims.forEach((a) => a.stop());
      molAnims = [];
      const mc = document.querySelector('.modalCard');
      if (mc) mc.classList.remove('hlWide');   /* 玩法说明用的加宽卡，别带到别的弹窗上 */
    }
    $('modalClose').addEventListener('click', closeModal);
    $('modalMask').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    /* ---------- 物种卡通形象（简版科普卡）：拟杆菌 / 普雷沃菌 ---------- */
    /* 按手绘参考图逐笔还原：
       拟杆菌 = 紫胖梨形 + 头顶三根卷毛 + 八字眉眯眼张嘴笑 + 双手抱着彩色糖链 + Strong✨
       普雷沃菌 = 粉色长胶囊 + 周身纤毛(实时摆动) + 圆点眼 + 惊讶小 o 嘴 + 细腿小脚 */
    const SP_CARTOON = {
      bacteroides: {
        line: '我是肠道里的<b>「多糖拆解工厂」</b>——数量最多的核心居民，携带<b>上百种糖苷水解酶</b>，把膳食纤维和糖链切成可发酵的小分子。',
      },
      prevotella: {
        line: '我是<b>牙周炎致病菌之一</b>，但在肠道中却是<b>降解果胶的一把好手</b>。素食主义者离不开我！',
      },
      faecalibacterium: {
        line: '我是最重要的<b>丁酸生产者</b>——把纤维发酵产物加工为<b>丁酸</b>，给肠壁细胞供能，可以<b>减少肠道发炎</b>。看，我周围冒的就是丁酸泡泡～',
      },
      roseburia: {
        line: '我是带鞭毛的<b>「丁酸游骑兵」</b>——靠鞭毛<b>游向黏液层递送丁酸</b>，给肠壁细胞喂饱能量，在维持肠道健康方面起到重要作用。',
      },
      bifidobacterium: {
        line: '我可以<b>帮助消化</b>，还能<b>帮助肠道维持酸性环境</b>、减少有害菌繁殖——我是健康母乳喂养的婴儿肠道中的<b>优势菌种</b>！',
      },
      lactobacillus: {
        line: '我们是<b>利用糖类生产乳酸</b>的细菌统称——把糖发酵成乳酸，帮肠道保持酸性、<b>促进消化吸收</b>～',
      },
      akkermansia: {
        line: '我通过<b>刺激黏液生成</b>来为肠道提供<b>屏障保护</b>，还能<b>辅助减脂、改善代谢紊乱</b>哦～',
      },
      enterobacteriaceae: {
        line: '大多数时候我<b>无害</b>，但特定种类会引起<b>腹泻或感染</b>——别被这张笑脸骗了。',
        img: 'data:image/png;base64,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',
      },
      cdiff: {
        line: '<b>产毒菌株</b>，还可能会引起<b>严重的肠道炎症</b>。',
        img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHYAAADyCAYAAACYhjHfAABjnklEQVR42u39d5Rd15neCf/efcLNt3JCAYUMEIk5U2IQqUxJLbUKcrfd3bY7uJf9+Rt7ptszHn+zAPTM8ng8tsfZPXbbVrfd3WpAqZUTRUrMBCOInKsKleOtm885e+/vj3OrUAAJECQBEKRwtO5CoSBW3Xves9/4vM8jfICuHTt2qMaXateuXRqwS/9dFCjlgEAURDkgOXhkZGPfxmWjBCQnRieaOld2TgDDoqQK5/+ExUvt2LEDgJ07d1oRsdfavZD3uzEtVvbs3qMOHDhgd+3aZc7eerDarh8/PX77T3/w07CtvSMTlOu/dPD1w+lKsWLbmts6C6VCUpRsSiaTI1qblDG6ZeXKVWNRFA02tTfNjU2MTd1x5x2lEyeOHVizYfmrt95/5ylgWDli7NnfxO7du53+/n5zLRn4fWtYa63auXOn2rVrV7Tkeyu+8ZVvpFZ2r/zIvlf2fXZmeva+hE3lZ0Zm6ezsYuj0INOTMyQSSeZm5/D9BJ7rUqlU8TyPYqlIW2sb+VweLSBKaGlpQhwwEs31Le87nmpN1gNbOzwxM/1vfv1v/Uq5qbNpWkRmF+7njh075Fo4xe87w+7evdvZvn27WXCSyVSSgy8e+dz06elf/fGPfvLg/Ox8vjXfmpybnGV2usDo8IRO+gnRWttkMoGxBiOQSPii6waxopKppE34CeaL84K1Ngy1xSqrtcEYTTKRQHnKSSVSOA7gaKxvg+UbVtjl63rPrN209l9vuWPjf2vvaJ+NwuiaOMXyfoqfu3btsoBVSjFwZPjBvU+/eNOxI0c+lSD5sdp4wMDpQerVOo5yjbKODYJQdSzvkBpV2tvbaW5pJteUpam5mVQqhQ3BdT201jTl81SqVYwxlEtlCnNFrLFMTk4yMnyG+ULBJtMpWxiZpSmRs9o1TkVX6VnZTbY1h5/yTm3Yunrgvofv/v91rux8VkTMkvdtrhv2TVzu9u3bZc+ePdpxFEPHxz71+Pef+Nz+lw/89oqOlXLm9BADJ4esso6JdKgy2Syr166Wrp4empqaWbmxj2RTknQqjXIUruuhRBDAWsHa2OXqSKMchbUWIU6ytNboMGK+ME+5WCQIAgaOnuLwvsMUCnN2rlCgVq3Y5uZmm85kHFGWdEsqWr6y98WPf/6j319/x9p/ISKlxueQq3l6r3XDyoLLPTNw5rOvPX3wf/r5T5+6LyiFzsjpUfq6VkVzk3OqUq2oZeu7WbVuDbfdeSvdvd2EaBzPxViD1WCMQazCGIsCBIW2BlT8G0QEiwULxhqUir8nVnAcB99xsMZiRVOulqnMlxk4fpqDrx1k8NQAs1NzJutkrZf0nGIwz4ab17Hh1vUHbrxjyz/fdse2LzeMqmxsYfsLadilcfTxHz/5oaGDZ37p+IETv1MerubODJ6xeI51PCUbN90gvT09dC/r5IabNpJraqIehdR1iBHBYBEsylpEBKyc/cSWc79+w92wS7wGWGtRCFYsSimUo/CUS70eMDY6yvGjxzn88mFOHTlp0cZ6jjJdfd3umi2rg003bfrqQ/0f/h0RKQPYHVbJLjG/UIZdiEnKUVTGK//bN//sOzt+8vXHHVu1aK11XYdOS3cbd3/4Hm6783ZaW5sRMdR1Da0NFoVVYK1q2NEA5nLXWPHpJj7VnuehlEN5tsSx14/w8vMvM3TqNJVqRau062zcusG2dOQP967s/ZPP/83P/HsRmd/dv9vZvme7/sAb1lqrtst22cMePTY89tHvfOV7/8AW5JHyaIW9T78Uea7jdK7rkc233ciNt95I57IuQh0R6QCsReTsRxIrjfuvsHIFDPvG9461Fsf1SHlJwmKdfS+9yuNPPMHQ2LAlQjpzbUjScteDtx/p/xtf+Lup9tSP+/v7nd27d1+RzPmaMGx/f7+zZ88eLQ68+JPXdj7146f+0ZGXjrqV6ZrVQUSqKSl3338Hm2+/me6Vy9FiCHQIAoLEbrIRjQVB2di4YsGKxVyFnMVai5Y4ZLtWkfZSFApF9r9+gJ8/9iTTp6aMkcA2dWadDbeunf/wx+/7zbseufOrRtsrkjm/54Z9fMfj7kO7HopGj41uee7x537/xL7B33j9mQMoUVqLcdZsWs1Dn36QFetXYFBEcYmJlTheio0/xMIHEcviiVVWYbHYq5SMGomfLsEiBjzx8LwEI4NjPPatn/Dqyy8iymonIc66bau5+8F7//7Hv/TwfxSRyuXOmt9rwyrAHD58/L4f/LcffOP4Syc6ypNlEwSB5Dvzcs8jH+LOD91JOpuhVo8QZTFisCKxYQFlFz6E5qyJZdHIVzWBty6Ijt+LGKwVMELCTxIGIT/85vd57vFnIDK2qbnJLl/Zq7Kd6R/9nX/8u78iIjOXM+7KexRPRURwPdcO7hv85f/yh3/yh4MHR9rLE9VIxLhrN6/m/o8/wIabN1EL64hxUNrDqhCj9KJRFz+EFazo8z6OLPn3q2Ra6wEaKzqO7SIoq9BGgwtpSfHyky/x/a9/l6AaIkiU78y5N9+/7Vu//nt/9UsiUlt42N93hj1rVMd+9Y++9n+f2T/ye6cPDDEyMm78dFptvmkTj37uUzR3tFEKK+BYEIOy8du95sYol3KTxaJtiMIh5SaZODPJT37wGM899RxJP2E7e9pZf/O6o/d89K7/cOv9N/2ruEJ7d/WuXF1nJVisstbav/jDPf/X4VcO//6p/QNaB0alsll59Jc/y613346xlroOwGn4WmtRjcLz/WjY2LiAsWAg4SZQ4vDYY4/x2Dcfo1as2LbuNnngUx+ieXnT//jJL330/zHGvCvjytVOlB7+Px6OnvrR83/3e1/+3r+eHJmKlCinrb1d7n/kITbfuolyVMdYheMIxmqULMRRi3kfTxmNFVQji9cmbl92drby6jOv8kf/5o+IKqFOZlKSbk+q2x++Zfvf+r3f2hPUg3eVvFy1btJDux6KvvLlPV/8+h9/9Z8OHx/Vum4ci5KPfPKjbLp1E+WwHGe8Lmg0SmSxB2R4P1/S+CyCEYtyFZGNGBweZev9W/gH/+z3aF7R5tSqdSkMF82rP3n9v37vj3707621iR3sUNbat/1EO1er+bB161Zjrb3tT//Vn/33U/sHmh3HJdOSVX/tt3+DvvWrqJs6juM0EiOLw9lS5oOBCVhSdlmLIDhKMV2apntFFx/+0L0cO3RMpsdnkJryp4an7qjXaonf+cvf/tGWzVucPXv22GvKsAv1mbU28af/9iv/rTJe27p2+Vqdyqec/r+2nZ7VvdRNgCiFmNhdIRbHxu5EWRrlzfvbtHEH7KxhHRSOKHxJUJwtk0lnuOfDd3PmzJAMnh601WLVzBen7t21Y8fEo1/8zN7d/budPQcv3bjulTbqzp07xVrr/d//6F/+yetPvvpAxm/STirlfP6vfY6uVT3UgjriqDixkHiMpuxZF7zghMS+v8+rLPWmS0KMoyElHoXZIsl0ki/9+q8wMzkrowMjjJwcU8/9+IUvWmv/TERKcVvm0u7EFY2xe/bsUbt27TI/+MZjf3Py9PT2sBCaZDLpfOTRR1ixfjXlerUxKrON+Zw9Z7ZiL4gle3/G2aUv2/i8cb1rUK6iUqnhJVP88l/5Ius2rnVclTCVYnjHj//iJ//OT/hGEHup8VZdySnN9u3btbV2zd4nXvwnkycndMJNyk233cStd92EjiKUqMU+6y/qZQSMEoyA47rUw4DVG9byyKc/QXNrh4yemch/5Y+/+sW/+KOv/y1rrWzfvl29Z654SVxt/ep/+vqfVMfKTSmVNOtu2SD3f/wBqlEZUV6jsqUxK/3FNexC9mDEIkoxXyuzdvMGbr37Dnn8pz+1k5Nzydeeee0/bNywfmLPnj3fsNaqBejNVT2xO3fudFzPtV/9z1///Z988yf3nTp8Uq9Zt1o9+OlHIOkiAkqpGKEgwi/2JVjk3GRCCdWoxq0fvp3uFb3ii2+GDg/JqYOn/o21tlNElmKor45hGyOo6Offefa+J3/w/P+sqq7u7elRN917M10beqjpAFd8ftHNuSRdjkeMnG3EIJbIhnh5l0997hO0tbSqqBya11/Y1/un/+Er/1zU4mmVq+KKl7jgjf/qf/63Xy6OVVCBlttuuUnWbFvLTK2A6zhYDVZdt+k5zVa7UOs2gF4izAfzLFvdzac/82m+vftrMjY4Zty89ysn9w98d/Xmvq80IDb2ip/YPdv3KMD+7FtPfm769Ow6qdVNd1+H6lq/EjeTip/IuJ6JPY5dmJ/+Its0HnJYiY262GUTIUGCYhCw+b6b2XzbNilPFW19PHIOPHf0d6213s5dO6+8K7bWyvY927W1Nv/Ci8//+uHDR2xV12X9tg3cfMct1IIAJQoltjGMvn5dxDvHSaWNy6LAsXzoYx8hkUmpYweP2mcff/qe5x576sFd7DK7+3c7V9Swe/bsUQD7X9p//9jgxJbevl46Vy9TG2+5kciByOpGRLhu0jcc2PM8lmoU8EoEBdSjkJZlXWy7+3apVcp2enDUP/zK8e3WWjmw54C90oYFYPDY4FoJlK1FVXvnA3fTsqydqg4QRy0UN1dz9vD+MOwSAy9tY5hGTxmgqkMe+Pgj3LB1s7hWmZGTo3/jyR+9dOcudlpr35ixXE7DWmtt+vTrZz49OzonhfIcLZ3NuAkXrcPFp+/69ebGfbOvbWNk6RvBGkuyKcdDn/q4zM7N25P7TzkTAyOfALE7d+68Mie2UVOZynSldWxo/ENTYzPccdftsnHTeoJqBc+RGHW95A1fv97E/Z63/qBV/P1EBJ4VqkFA36YNPPTJT6iWTAsvv/zyb1lrO3bt2vWGVuNlMeyWg1vEWiuvPLv/AYnEW967zDzwkYdEEBxxUVZwrPxiZ78Xx59fBAXRQD1ajYghUpo7779XsrkmM3JidPl//8Ov/A5gz281qsuUDRuAgRND/5+RM0Nub1+3benoxGgVTzWsijG/VlAmfl2/znqvBpjxHEsrC66O24x112CUxiHE6ArNPU1svfMWMbPYVx9/7XettR179uwxS7tR6nItTpUngpvGBs9sdUXZdRs3KnyXyOjFx/F66/ByYaeEwNS5+Z5bZOWaVXZycGr5f/2nf/LP/IRvL/egXR588EFJRYl/fOKVo3cG1dA88plPKiefwFoTZ3rqulEvJyBQo/HTPlElZP+L+6mUKtv+8D/9u+9/6de/NNzf3+8cPHjQvuuW4q5duwBM+z9qayvPl1i5bi3JXAZLnKrL9VT4isRkLYbeVb2SSWdMfTpwnvvhC//aWvsxESlZa9/dbW9kYrZatWtamlp6upYvtxtu2SYq6eEYG7cPr1+X/XJwiEJNV18XHSs61ez0nN73/IG7/8v/819+ZSGRct9tb9haa3781R/+g+GBodvXrN2it951h1MNyyS0JrLC9TzpStS9DkSCk7K0LGth8MhpqcxV7dxw4e9Ya/9EROruu5zkaIvNDRwcfOSlVw/Y1Ztvk8gY0OZ9Dhe99lE2xhqUJFjZt5oD3n50FMnk+FR+IZlV77Y3fPKZk/dPnJleuX7jZtvdu0yJMSgrHzC80rUWYw3iCIKQS+fBCq7nUioVFZB4V+VOozcsr732+ubBwSG3paXJdnd3ok20MFC83vC/gpkxZmFSAM2tLdKUb6ars7ttZGByzbs1rHE8x46NjT+azzXT3d0jvu+hTcj1kpWrtDZiyOYyaKuZmJoknUzbsBK+8wZFY5pgD7984t7Jidk7jFW2r2+VIJZ4h+h6hL3ixCELiAtlqdQqOI7L+OiUHRs8qeEdQmO2b98uAIdfO/pXizPlVCaV1T3dPY7WUTyeuB5cr/R6ReNEGhxXCHUoNjQWg1+ZC7Pv+MQ2RnSp08dP3jA2PG5XrOiTRDKJNeYDB/O+VhsUQsxdlcqkaGlrRTnKuMpPzBTm7kfegWEXRnRAa2F45k7PiPSsWC6u42GtLK5naHX1uB9+8frFjeNjwVEeNooXTKdnppiZnZ1o5FS87REdID/4yo/vKkzPJ1KplOle1iMG01gVvG7Mq0WoJxIP4K2FMAxpa21l67attyLvIMYe2HzAIthyofS5RCLlLd+6Rre2tRDqCKPM4phYGv7iupmvEA+hxK44Jg+LaQFFhMmJiU2Oo97eibXWyq5du4w1tq04XfzI7Mwc+dYW5ad8IhtdVeqdX+wYezZBdT2XpuZmrLUUCvPMzs3U7dt1xXv27FEWK6/95OUHJwfGllergelbu1pwLFaZxX6EnN3KuW6FK3x5rodSMWur73u4rqtEvU182YHtB6wgdvjk8GeO7jtMNpe3LR3tBDo4C7VbCsq6fnivWFosIg2aPwdBqFSqNDe30NXTrXWo345hrexil7XWpkeGx2/IZZrYeMNGaW5rJjJhvHNyHsLu+oG9stBGYy2u55FvzuIlHDlx4iQvPPdSq7U2rS69zIlj9tRIsc/g3FYLNKs3rBJxo8VOkzQWjGyDRMNeP7JXzKgWg1UKI5bQ1EgkHEl4SdqbOluBvLr01cj4z8np6Za52QIobDqdvo7uf49dssXS0dGBUg6lUomZ6dk0kHobht2Jtdbb9/zLf29seMxtaW83HV3tYoy+foPfQ8s6SjE7N0utXkM5DvUguPQhwEKZAyQrc6UPDQ+N0tzWLtl8FhMG1xGI7y3PM0YbHMeRIAhIJP12oE29naH66KnRW0rThRarxfSu7FOe515Pfd/jSylFJpMhXgUQjDbTwOwlGfbAgQNWRDi679DnD79+KNXe2m5XrFpFpKPrI7r3+DLGLCSpNt+UR0SqQE1dIsTUooR6ObozqXL0rVhBc0uGSCxG3Ot39xpYDKlV67aluZUtm7YcFpHhS06eTKTVyeODxgRCW2sL+eYMkTWIONfv8Xtm1LgLpLWhpaWVoB7y/HPPJy8JV7yAlpgcnrxpcGDwjsmpCZLppHJcB+x1N3wt6NflczkiHamx8VESaf/uIOCmtz6xO+P21cnDJ7O1Yi3hJXzauzsFZ0GA6Lpx39tzKxRLJXQUSSqVIp3OOFE1dN7SsNt3bRdrLcdfP/kJarBixUrdtawbI3H9qq6XOu+paUUE3/cxxljP9/E8bybd5F08K7bWyh72GGttU61Q+XSpUKFcqUo6lyE0+uzc9fr1nirECZDOZGy1UqVYKM4DJXWJJz5dLwer52YLtLa2SCqTWly6upqF+NKt+LdaGv5FsWs8rvMxWmOtpVQpFYGyeos2Ymy5Ik26gnV9l2VrenASDsqAI84V7xMvqFC5roujXBawAVbiCtoqiyEWg3AaC8PKftAdsMLiIBis1czNzGMCaxMupDOuBoy6FHbU73/9hw8NnR5pchxXt3d1inIUsZb1lTeq48Ryn1NTUxQKBRTgKecsGZi2KFGLW+Fv2A7/QHMwWpQSgjBEGyOZTJot27b0AcsubthdGGutDA4M3V6YL3DzrTfT27uMMAoaFO/mim9vR1GE7/tYaxkaOM0rL73I8NAQNtAkXA9PXMQKWkCLNAQhlrzsBztx0lrHUFRtrCDUqvV9ypUT6qKNf3YZwPG9xL3WGGq1mmRzGRaU5+1VmLkqpTDG0NHRwYb1G0j6Sc4MnmHvc3s5dug4hKCMg6M8aAj92oZGj4j6QA4ohJg1VohP6/z8PIlEIm4k6UhMdLEGReN+eL4b+XiV1rY2mluacBtiu+eIyV2FK9IRiVSSzdu2sHb9Oubm53lx70u8/NIrHDl4lPJcEdcqfOXhKhdrwJjG7tIHdapjDTrSDSoIi9aaWhBYx3MuvEa5c0ecOM2cLt9wYN+BvqHhQVupVySZSmCsXfRy9mpyL1iNAdo7O3nwIw+xbv0GDh8+xo9+8CO+//Vvsf/FVxg5PURYD/F8H6sUfAD5L4yNscRKxaKMvu/HCihY6tWaj70IrrgBDOf5nz+z0cFr9zzPrF2/TmliWIZahKTLVeZesGgdkcqkue2O2+jq7ubIwUMcfuU1fjIwSFNbK7feeSd+Ksmy5ctpasnFIcMsPIz23MflDRh3ueYLqcXoYoV6tc7M5AxBvU57ZzNtbW2nrLUXNuz2PdstwNjoxKenxmes7yVsS0cHxhEkAseAURYj5ylUXPHCLf4jsrF+bN+6XnpXdLF53XpeeGEvg0NDvPjMXiYnJrj5pltYt2k9ncs7yWYziBsDq7XVMWbIxk+/Qhbv1vuh4SIKtNYkHBddj6iVKjhWMMbQ2pLPwVtsAlhr5Z/9/r/uqVXqglhcz2HxHiz6YXlPOY/q9TqOclixbhXtvV0MD49w+sRpXM9l70t7OXL8CG0d7XS0t3PLrbeQa8qRTCXwXB8jcZyyjWWXmEzLvFFO5RqcwUojsQyjkDAK8RNJgihkcHjk2AUN2+CXMEDeVc6yKIhYtWGlNLe3oLXGNMpjiZ/19zSBUEoRGY0WcNIJ1mxcx6o1q7j19lt5+aWXObz/EMMnBjn0yn6Ovn6YVDrFnXffxfLly2nrbCOZTGLEENmQ+JPZaz6TFiR+IK1FKQdEmXpYd1Z0Lx/97f/lN//F7/zD33pzwzY6ThbIl8uV1WhLz/IeyTflqekAJc6SECTveXYoKoa7GhNhoggRRUt7Cw898iB33n4HA8cHOHXyJAcOHGBqcIpkMsmrL71Cc2sLq1avYv3G9eRasngJl1CHMSrh/ZBzKWF2dpZKrSoJ37dewk8dfeF0HzBzUVf83GPPbZoan2zKpDK2tb0tbt9p0whHDZH7a+AGiCWWIV18L4bAhAiQbc1x4503svGmjdz1wD2cPnmKI0eOcujAIcyJ4xw+fIhTp0/R1tFCW0c7a9evIZvLUZfYwNfq6VUS81MaLIlEQoJKoOv1sLkwPXMr8Kp7MYntSrX2gCueUkRRS1uLKyrOgmVx+fbaySCVPV9lK9awCSTAGI2bcmnrbaOtp43VG9ey7dYbmRgaZX52jrHRUV555WVWrFjO0MlBbr3zdjrXdL3HYk/2zWYesYdq8E9orahUKzi+Z001ULWwVuxa3rPvgjH24K6D1lqr/vzff7Xdd1KYVlecdAJQOEbFSPQ3lA7XCp6g8eEbGV7sqhXaGDQGLDR3NNHa1YK9cRPzc/OcPnGKM4MjTIxN8uqr+wgjw/r5TazbuCa+Q8o0WFzjmdZbeylZ7MwtjDYXq6rGzg0I2pq4O4Zq/GwWaQpFFG6j67aoUYSgHAXa4IrgJ5PMT5aolwKb8hLKc9V437aeV9/UsAvEXEC2NFf6xPCZUZb3rZLO3mVEkUZZFZcK11idZ8/Llhf7qef3iwW01ehIg7Lk2vPc1HYLN992K4cPHOHll1/h2PETvPLyPj7zy49y8503Epm4eneQS/RPS3aEkcXWqzEWQWEa71EcD188xCgcJzaisZYoDKnX6wTlKolEgmq1itYarTVjY2Nk0mmiWp1SpcLQ8SGUVni+R09vTxJoBqYuFmOlXg1tGARUK1U811lsY73f26/SOHUWITIGsRYRxQ3bNrN8ZR+vvfgaB15+jcOv7yfflGHtxtWLi8aXBrE3Sw5KHL4cz8PzFAqFMRYdGcrFCuXSPBIZBgYHSCaSzM3NceTwEZRSzI5NkEqmMEbjeT7lcompqSna2zuo1KqMjY+RdNIkJUWxXKQSVjJA61sZNqhXaibhJ8nkMyQSyQbNm/rgYIkldnkNQUwCG5JuznD3h+8i7yd4/sUXOHroMD3LuknnUqDeSiO+YXUb8zQLCt/1wQozE3NMTUwyOjxKrVKjUiozPHQGGxoqpTKFQmExhLiui+s4VCsVrDGkUikEoVark2/KE1Y0lfkqLblWJBRc6xJJSKEyPw0MvKkrXih1Th84vWng1EBrvV6369evE9d1qId6MSP+wMzD7EJkiwNhqOv4nsfmm7dQiWq8sHcv2VyOe+6/F+VLrKxxAZdlrTR4rsD3XEwEM1Nz7HtxH0deOcDY2Dg60kRBhCD4roc4DuVqhWQySSKRwE8kcBo5QbapjWQqhTaaoB7QkU7R1t6OroVkpqap1soUZ+aJtLbty9u45babfgCE/f39zhsMu2VL3CM+8tqxW1YtX90cFk7pzs4Ohw/gRl1MYW8XpccWwHmRDUnkU2y5eRvjU1OUK1UWqqmLhiGJDSsijI+NMTo8wU9+8ARzkwXSOkEulUcbg5v3yWQy5PNNWEehMSQSPq7r4XluDBwAxHexjfe0UHqFUYSf9ygV68yMjZF0Per1im1uyuOl/EkRMTt27HDf6Ir3NNY6Dh2pToxP2kq1QmSiBgXN1cU5XZW55nmcDrahBlmJaqSb89x97708/dRTPPHEE3zkow+iHMG8CXikcfAx1jJw6gTTk1P4KsXDH3mEWjFkYmgCP+FjGwB75bpxhq0ac+3Gg6O1Ri8kgCbuMJlGDmCwOOIS1COm5uZw/QRRLQQRJqanQJG8sCZAf5wZ33fX3e0KJZlcluWrVqBtiIgG0R+YGGvExB0rOSu6sDBoiOE/mta2JrKZFLVKGR2Gi6WLOn97XwFosJrWllbuuP1O7rj1LtBCqVgh0dxC5Ppox0E7DnVjCIwmiDRRZNHaEmnbwDMpTAPUZY1gJQ4BDgon0gyeOElHZwcb1q6LKxRXSbY5Z1vyTdMXNOz27duNKLEvPv/Co4XZORxXoa3+wBJf2ot8zxpLIplg9drVrOjrI5FILjYILpQNK6VoaW7Fd5IcOniEvc/vpVypEkThOfLkC9q5F+tsWXu2dFsA5w8ODFCulOjs7MRai+e5NojqTiaXqm29afN3Yoz/znPBbAtU8NbYzvHRiXXF+SI9PT2STCfRv2ALztZaxFVoBNdPMDg4RGm+3EBmXqQ5rw2e8jm8/yjf/db3aG1tx/W8eB78TtSgG2mAqxwmJ6cYGhoi15TH8z2qlTJhUEMpIdecc/PteXuhEysA1Yni+rAervVdnzXr1qh0LoW+hvumV6KHJWKp1iogilQ6y+DAGQ7tP4zV9qIE0Z5yqZbqPP/si6STeVwnSRDod3TvRDVcsCiiIOD0qVMopejs6sIYw9zcDNYYm0olWdbb/SIJRgFh53kM4wsaad/5yx+UdV3bMIgozBfQC8nTL4h4g7UWZaEwE/eRZ6dnSPspTh0+TmGmELf13mS4ZQHPTbDvldc5c2qYfLYFrUGU844hMLF+vWHszAhWazqX9ZDN56mFdaq1KmKtbcpnqFarwyJSjL28nGvYBThM97Leez3xxRXXdHZ1ojx1TU86LnfMdZTgWGjJN1Erlzl68DCTI+PocsBLz++lXq+fvRd2iet2FOVKlSOHjpJwk/jKJ+mncRzvHZfYSjkUCvPMzc2hULS1taFch0qlQhSFiFgx1pDJZPZaa2XHjh1vdMV7GrXO9PDE7dVKnSCKTKQjHLk28LmyFC8sTiODXPg31ShfGn82qIne0uWeJ+25yENmhbmZWTzXI5lI4Ijitdf2MTY6ionMm94PV1xGhkcZn5gilcrg+QlqDbIPeTPYjT0npY5LpiX/H9cVoqDG8MBpSsUimXyW5qZmjI6IogCMQmtDU1uWG2/b9KKI2IU+hHqzGnbo6FCtUqwRKk06k8S36tqoXm0MSjNW0CYuugwW3UATxJhiuwjZuTDt39mpi+KspPhCE0IbS2QsqUyawvwcvct7ePCjD9HT18vYyDjTo5N4ykMaCZHYWGNIIsX46BSFYolkLoMWGrq5IGaJRqyxjWlRg9JHA1ahGjhosZYoqDFfmGFs4CTFqSkcBX1rVoLjogTqlQI2tBiUaF9HvWt6zQVFCxubdV4ylVyFhVVrVklP7zKCMLwm3LDBIMrgYEm6iqznknE9sr6H4wtWabRERCoidELqTogRc+4eEHYRVG4AjTRejb9bMCKEYUQ2m8daw/jkJMtWrOCBjz0MrkKpuHGwAG21FjzHZXpimv379uM5LrlsDiWC73vx8ETFCzXxIZVGIwSUA74Hjhh0vcrM+ChDJ09w9MABjuw/wPjIKFhLW0cHmXyWyJgYCqQNWGtc1xHlyky2OzuwwBdyTq+4Ma6zQG5menbDfHEeP59RftKPAV7XAFZExMEaiy8eY6dHOHLkCGGtyoqVy+la2Usmm40xTFi0MXHjIdJxM0HieGWtLGrtGVGxkY3BdRyUile+wiCiHtSphiU62rsYHRlHi2HLbTcxMTeJn0hhBIxpwFexOI7L5Ng4MxNTNOeaUMRG1Uaf24dUcV9aNR60sF5lYnqKer1OeX6e4tw8yWQS11E0pdJUohLiunR0daKNxYqgjaFcKiMKXE/R3NIyCAxBgy/kzYYAxWLRmZqcatXa0NbeTiKZaCD55D1uJwraKJJuilOHT7L36ec5cugw5eI8Rgwr16xk1erVrFi5glxTE/mmPK7rkW/KIMoQBZpSpYLvJ9DG4IhCN5xyMpGgMFOgVqmidUQykSIMA1zXpVKqUCmVCY3Gy6RYvX4dodGIcqGBcFRKobXm2NHjBLWAzqYM83PzCC6JVIp6FOJ4bmPwExEEdSqlIvVanYnxEeq1Kgnfx1UOvu/guapBzuXQ1tJCNt9EJpsl0hEKB8KIerlGFEXWTTmEOvyaiET9/f3Onj17zhV7aHA56eHDw/ebyGaNsaa5pVUlkklCW33PXbG1hoSfZHjgDN/8+jeYGp5ABxHpfB7HdxkZGUcpl1defpV8NgeAoxx6V/RQi2pEgWZqeoZsJkc6naVeDzDWUg/qpBJJRoeHCWt1kokkTU15Vq1fzaaNG9BhSE/XMvK5PIGOaO/qwhUIdQyaM1rjeC7F2QKnj58ik0jF2E0Lvu+CGDzPJaiHzM3NUi7OU5qfo1IugTEosaSSCZqamqjXA5qbW3Acj/HJCebmJ0l6CZxEgnyDyMW1QqVSJwpiyE8mn2P1utV1gM2bNy8aadGwHQc6BMB1/JXd3T3e1HBR53I5lONgo2sFjRgxMnKCcnkaravcdOvN3PWhe0nkUhSrJXLZDDqMcAxMjI3xve9+lzPPnmLNmg309vaSdNJUKnVqxQAdaayxFKbmODExScJLoLBEJqQ4WWB45AwDx07wqU99klUr+mhtbSUwhlQ2g9J2scaUxvrT/Pw8zbkmvJxPpRLE3BwW5ubmqNRqEMYPpy8Ouh6gazWUgOt7oA1zswX8RIK2zk7S2Rz5jnbOnD7FzPgkY5OTJFqaaevqwIsU1fkiYRjiuo6gbLV7ZefBxmTOvsGwT/AEAMcPH6UwW8QYSyqdxF6FPdhLBYdjIZ1Kc9PNN/L6K/u49e5buPH2bRQqRfpSfQRhRKQjPMehZ1UvL77yIlNjB6nP16jl6+TzzeTzHqE2oOIFrp6ePsZGhhkbPkNQq+I4jeIpEgZOnuaVV1/lk194FOWCIm7UKEfFk5lGueIYxejACMePH2fd6o34yRQ6hFJxnpGhE2htWLdhK8lEkmq5QmFuFslakgmPcqlEva7JNefpW7WKdCZPhCGTz7GybxXl+TLlep1ypUy7bkObiPlyAau1VcpVqXw6uP/R+18C6O/vN28wLGAaT2Df/FwRCzQ1ZVBKILLvuW2VEsLQsuGGrbQ1tbNu/QZWrF7JXKVIpVZjemaGdD6Hl0oSGks6meTTn/kM08MzjA6PUpgvkcpm6erpoamlDashwOClM6xct5bO7g6GhwYol0rUSiWUifBcl5niHBEaNBgiXBysstCYwigEHRiGTg7iNOaoBmjv6mR6coy56SkQS7kyRzbbTb4py8aNNzAzO8n42AhGhO7e5azoW4XyfHSjkNWRwXM80tk8blqTy8YJmbaaQEe4TpwStvd0HAPC80+fuwSZKAi89sq+mSAMyOVzZHLZBsZJ3vP+hLXx3FK5QmdvDytW9hHqiEgsXtKnVCwyODCA6/ukUil8hBV9ffzO3/5dvv+N73Ho0GGiKEQHAdNj4zTlm6kacHwfB0j6LiiHUrmCNZoorOFnEnzkkYdJpVPUoxoo1VhEU43baHAdj+LsDNMzMzTlW6jXIlraWnA9F8f1sOJgbcjA0HGisI7nJpmfKzI3N4vnuqxY2Uf3sl5kYbiOxAkSFjfl07dqBdUgorm5FRBq1YD5uXmswaRaktK9onuviBT6+/udBgjxHMPKHvZoa6z6g7/zB5/zXBdRrji+gxV9TRj2bJv97CB8AYPkOIqenh5a29uYnZ1jZnYGXQ8YGRrG1CO23XYjs/MzDJ8ZjqchKOamJqlH8elKeD6pTJJKuUxQr6FNhJ92+NTnHmXV2tWERNhGmSILSz5iwBqUcpmcmGJ6YhqJPNIZhZ+IS65cUxN+Ik2pPIspzXPq9EmMVriuz7LuXnqWdeMkXBCJ56+Nab0CIh0SeRGr169mcmoe3eh21Sv1xnDdOm7Okc4VHU8C7N682y6tWs5pUCSSvvG9hJ1faF+15NFac+30/heg4AtowbiVY40hCkNccejq6GDTho1s3ryZtRvW0dTRgpNxeODjD/HQxz9Ce08byYxPENXwJMKzEWG9yOzUGPVaCccRWtqa2f7XfoX7H36IEE1kDUo58Z6MXWhdxk5XiWViLG4zWqNoyrfgeT7GWpKpFFu33Ui+qZVsKkdLSxvL+/rYvGUby1f14SUSiFJYJXGzwxEiAqpRiUTW5ba7bmbrLZuIbBg3RIylWCjgimOttVI1laGPfvH2xxpEa/YNrnihOTF9embrP/lf/+kaYwzKFdFWN7gmrg3Lqka7cGmvRJmF5Cqu/UykFxer0tks625oQjBMTUzT1N7CzbffQq1c48zgGeanZzDGUgvrOJ5HJpejpa2VzVu30NSSo1QvoRWLe7Vy7vOFEgiCOuNjE1RKVbo7u0mnMgtjcepRRDrXxI033katMk823wy4aGuo1uoEUR3HcWI2HMfBoMk2p1i5eiUrVy0nm/OpVgx+0qFWjNDaMj0zgQlDk0glnebu3FHHbZpYmOi8wbB79uwRgKGBoZUJz28JgsC0tjSrbC7TKOYb9HrvcQYlS7ghrZzbwF+6IyYI1hosinpURymomzpnxs6Q8JJUilVyLVnal7VTrddoamkmmcnQ0dWNm/Co12qUgwriqkZVsISZYXEYETcmaqUKY2PxGLSpqQU/kUTbuDEsIkTa4PspdGgYHZkm0oZaUIsbPxLhuy4tzc109/TQu6KHtp4WMk0+oa5SDUo4XopUOkG1WKder6OURZTFT/ps3LJR60jLm/UYzuk8zc4Xo2Klaq3WlIvzKInxNpGRa0Le7HyaH7s4dLIx3ugN5FYhvusxNjzC1OQUyQaqPiLkxOBJsrkc+aY8Ta4ik8sQBFUiHcRmc+Kfqc4byQjxDq0Wg6t8ChPzFCbn8PwE2dYckVi0BYWDmBhgH4ohsC5uKkPKdfCCCjoKyKbz9PZ1cMOW9SxbvgyURduAIKqCWJRyUcrB9V2MjahUiwRBFetoyCiWLev9liixu/t3O9v3bNcXNGxra2uQTWelqanFdnctXUpS7wMcsb0gnVBbWxv5fBPVSg3P99HaEIYR2sTEHL7rkU6llnzeiy2xnFUDc3CYGJugOF8m39KOl0w2YH6N2C+GRNJBm5C0L6ia4DiGruZO2jtaWL1qFbnmLI7vEAa12MvI2U0Law2OUiSTCYwx1Op1olAT6lC6WrJmy00bD2FjAOLCZO58VwzAiYPHbivOlahUKvT19aFU7NLe12KEFhzXjWNoNoc2Jt7vPWdBKoZ9Xpr6kF0Eo2mtKc4XcRyXfL4ZpXyiSMelizX4ScWdd99CJp+gGpWJoohUOkEqlcRx43ZkFNUJqgbHi4lCzs4PbWNm4JDP5DCRYWJkHB1ancnlnPaetu+u3Lj85xYrsl30m7riPXv2WICpiekPTYxMoCNjS5VKXIdF9Q8E3yDWEuoQEUUU90jPAdGeE6fkralkBcEE8ZKaiEMylWm0KwyOA0EY0NvXR+eyFkJdw3UzjZgbxcpi2oJIPFHyYx/BktO+EGuMtpTny9jQxA+fxbZ3tHLbndteE5Fox44dLruILhpjo1pUR0PCT5JKZRbTBGUt5n1Kc7oIUmgYb2kqJEv+zV5wKfONaH9LTPNXq1Y5fOgICT9FOpuLlZgFoigimfZZt2Etoa4TmgATqbPbAso7B9u89LdLA+BsrMVzU4yNTHFmYJhKoUitXEYpo+aKUzqU4EQDzmQvskUUlzwDJweUYxXbNm+lp2cZURRd8uLg+xFD/E5GzKYRfx3XZWJigrHRMRzHxfUSDTB9RBBW6Vu5gmw+E2fIamH1wy7Wv2df8dafbeTbVmJ2OVccokjx2qsHMREE9TqOMtbaulq2ssvcff8dP1+Ufb2YYUXEOtYNsuk8TtIlQi8OpO0HZq1jafx6q9fF6HXBRTExMsZ8oUAqlcZ3fSJjMFhS6QQrVvWibRQvWwMxy6NZYsKGP7RyHt5KITi4TpLD+49QmC3EkCBtMJGxyVSK1va2vU2dTaOALAzW31jz0wCJW9uUTCRvmJubY6YyJ9nW7GI8sfJBwiDGgBjkLCjmja+LrLCIg8JDaobJM2NYA4lUCkc5WDzqWrNsRRf51hR1UwFlMSKLqxsWZ8lLoaxCGcGxNsZCRYaEk2bg+AinDg2QSiSYnZ1kfHTYuuKJk05UVm9e+b+JSHnHjh0XzGoVDTHCOvWeMApvrAcBURTIdZ2kCw/8lQj1WpXxsXEcxyWVSsWPjI3wXGHFyuUNt9twt3I+41vj4UJjVIBREaZBo5D0s4wMjvHai6/jGhelFVEQosPQKg/pXbds/FO/9qnXLFZ27tx5QSu5O9kZNyfGZuvFQrGulHKrlcpZUPR1yv831Mau4zBdKDI9OUMmkyOZSmMapNCtbc20tOQJgho4DXgisiTqnefyxWCtwXWSKPE5cfQ0r79yCBsoPCdBFNaYGpvAoHE8oW99bxWYibGMF/ali1nxyOBImyBuMpmgpbUVz3UbC0jXLXvOiTUG13cYG5kgiiy5XAuO64FShPUaPT09pFIp5itlXNdZsnh6NnYv4MestShxcD2fmckCxw8eZHhgHNcm4qVohFq1QqVcJApqtmNFJ/mW/AsAO3bsUA2StQvu1isAM28e9Z1EAkvkOq6YRuH+i7LW8bZoerRhcnyScrlGGGocJ9b4S/hJTp8eYG6uSCKRxiysQdrYhceISAGjcFSShJ+lMm/Yt/cYTz62l9Mnx/DcNOIotBgQw2xhmiiqk0r6ZDIp29XZsbfR8L8oG8biiZ2dnFVRGFIql8jn8/ie16CruX5il17xVoTlxIkTi9hjL+nHoz3xKJVqPPfcC9x+9400tWaJtF4cyos4KPEwGgpzJU6ePM3o4ATl+QDfS5L03JhVRgK0CUEZKrUSorBijNPS2ly596N3/+wNDCYXM2xgINLg+R4tbW24CZ8gqi6uJtjr9m3s53hMT88xP1PAVy7Ki7tH6AgrGs91mJsp8eTjL7Cir5fe3h78ZBKIyULGxyeZnS0wN1ugWqvhi0faT8ZQG6uxOk62YnKRIsWZWWwYWZXxJdmU2IvP0UaZc2mGnSmU8BNJUuk0hflCA155VtflukNunFjXY2J8iqgekvQTZLNZtNUxxljFEimemySqG44fGuTkkQFcPwHGJYxCtDYoJTiuQ9rPxGsixjZ2EhoJmgFxFWGtRlitQ6RJt6Rt39ZVfyki4VL88AUN+8QT8Rejg8PMzc7hui7pdBrHcQijkOue+DxVEVFUiiXKpTLgkUimMbrh0ow6u4YpDspX8XpHBEKEqxS+48RplLUQmYvwf1lKxSIGjRat/JTL6tUrnwHYvXu3fasQqc5+YZU1hnK5RG9vL6LU9XP6JqWOCTWDpwep1eq0trXheF5jh0cWmdhAYYxgjQLrIjg4Nl7NFGMRbVDGnsP/eL7OkMRMJSglJplJku9ofrX37s1HL5W8Uv3sZ7sia22yu6v7U9VqhUhrNTIyAtez4Tc1rA5DxkdGcR0XP5nC8fy4fFELyEW7ZFokF/w5i68LcDDPzxeYnpzERNqmm9NsuumGx5tFZmN2oLeeyKjF1qKO2sIgJJPJ0NOz7PpZfZNupFKKWrVGpVTBGIvnejieGy96IfEQQHSjKXFuz/lSu9LSGOXVanWq5QqJpM/GrTewYm3fMUB27959ScFxMXkqFIqR57ixGsR7tr1+7aZpFovjOszNFpgcmyCVTpNMp9HGNNqJdkmXyZ5TSlgurN51/tkTEXQUMTszQ1M2Z63UHCehJu/8yG3fA+xStP+lnFgb1cBoCBu1rDVXdrVD2QXMkmBxAAdlncYWul3UqIuXkhcWD9/971zQwHPspSElFm5+TKjjMDU2Rb0aIU6CVDa3SLipHTC4mEZz/yxMdeEuqjd9xbuyYEVhiCluXQy6XKReKJpIati0PgEMvx2DLJxY32hcx3EQF7LZ7FU5N2IXnuQFnFE81F/6FNvGTZbLcKKNvL2fsIgIEol3bK3h5PET6Ejjeh6u5y1uwVt5N411Wfx9Yg1hUCeXSTNfKcnmmzeZdTes/QFgduzYIRdrI77xxAasisJ6q9EaHWnxPG+xhr1y15KmuGhimugIJGYgW6AbeGOUevuxUc4zrm68LnF620BMSAxn0RbX9UimUojTwCldxj604ygmJsYZnxy3TtJVU8Vp27tx3Z9dqkHPubvTQ3Nr0n4qXSlXdDKVlObm5ivuis9BAVpwEBKeh9IKU7d4biKm0VmihyPvVqrenuVMfCularHnSv04oijNzjE5Po7rOuTyudiNNk7rO5c2PeusRSmUKygFiLZ1HeD4zuHNm9dOALJz1077tlxxWA/9XCarksmkDoKAuUKBLmdZY8tOriBLVnxXEm6CoFThwOHDHD90lLnZefKdrdx9/z10dHdgTbS4VPFOGeVjGgKJkZfGoqMIlIrnoOc9MnLOIlj8hes6lGbnmR6bIJVI4nt+TIq5KDZxaV7grR7B5uYmXp0ep1av0t7TE916161fEZHCDnYo4dJPrQKo1qqrRkdG0FFEW2sb+Vweo/UVM6q1cdaojcVVLlOjk3ztT7/OY3/5GE/++EmqxTJBLWBw8AyipMEMat9xNosSyuUyQwMDnDl5mrmxSVQQ80M6rhs3HqxZVNk838IL5GXDZ4YI6nU81yWdy5wlCbkMQjXGaJLJBNVandnZWeu6IsqXKNmS/IHFCjve3s9zATGh3hpFMSNDEAUo10GUIFG8pmAvC0JRzslKIolIugnGTo/yza9+i7GhUbKJFI9+5rPc++B9JPJppouzmEjjNChyFieZ9vxNgIvrhcVkkh6VSoUXn3kO0YambJ6mjm7aOztYs24NqUwacYRaWIsFFkQt7uw4ojChZujkGYJqSEtTBtfxGgMSeYMLl7evBIsVhaOEU0cPYsMQ7Xh09/ZU1q/Z7Ati7U4ru3bteluGtUHNduRyTRircTwHEgptopgeywpa3imc7SwKFyuL5Y0RjasUg4dO8sR3fsb46XFaujr5pV/+NBtu2IjGEIQB+WwmpnYVi5aYMUXZs4WPsbJISXuhGCeNGtPzPNavW09XazvHjxzl+WefY+LpfTTlW9h241b61q0k156nZ9XyGMwXBBgbYh0bizBEQlgFaxwSqSwJL0E9irtEC0TW7yjOSiwBGVoXrKY6N4WKtM1lu9TKjWueWX1T7zNnKdDfxom11qYP/vxkU61ei2VMtF7kIrqssM+F4t1afNdjdnyKb+7+BjNjc3QsW8Ynf+nTbLhhPcZEWHHwEwms4xPqkHpUQ4k0av74Ey6cWrmETFOp+NQqR9HW1UlzWysr163l9ZcO8fPHn2T/kQM8/cIz5PI5brrtFjZsvoFlq5fhJnxqUQ3f9xk8PcShk0fw0olG4hSLGpnLcHNEwBFLrVYjkUqhjbXNHXnSufRMUA9l586dIrveXlbsjp0a26YUt5dKRRzHccIownW9y4KcELuAcGw80SZeWbB1yzM/eYbibAkrlrvvv5uN2zYS1CqMj4wxNjpFPayDK6zfuJ6Wjla0iQitbpQsSz2IXdJ8v0BfdmFtyxoibRBH6FixjPvbe1h3w0aeevznzE3PUZ4t8dSPnuS5nz3Lhls38vAnHqappQUfn5NHTjA/V6Al34Gb8GJyaGPetYplHFoMnqMYPTPMqeOncBOuuBlllvUt+5qI2N27d7/t7owrnifWWtLpNOlsBtf3Yt1vpTDSkDGRd/bGpXFCTcNHGWPJJlIc2H+I/Xv3EdVCVm9czY2334Qm4sXn9/LE93+Msg7VIMBLeMyPTZPJZ7jrnrtJZZOEJkKbKKYtWCrrddGyxZ7NghpUsfUwIOFlWLVqNYWts8xPzDE5MoFrFW6keP3pl5k6Pcpd993Dh+69D1sKySifdDJFOpdt8Dc7l6ENKoAmDMrMTE6icK1KWNXe0zSw5e51T8O5pCGXbNiu5W2Hhg+MHpmZntkyMzNjOnIJFQs3XQZ6+CXadwaD6yjECodfP4iux7PeO++9k1xLhgMHDvGzH/+MmbFZEskEQRiQSCR48ennqVYrDBw+ya333cWaTetJJhPUdf2N3YcLvIVzWknGIDbmgNLViO9/94c8/9QzmLom6foN1rMqjjhMnZni8e/+lDPHh6lXquQyeVzXPbtls8DXad9NUwJcV1Gv19FhSFCPzLp1K9WaG1Y+I8jM+dwSbyd5Ul7SP6UctcVx483qWr2OcpyYYfNdJfELZ8kiYnCUS2FujpEzI2htaOtuY9W6VYREHDpwiKnhSZqbWrnx7ltY3beS4aEzHDtylPlCkQP7DjA5M82KA33c+9CH6VrRExN+vJ0WoYm7scYYHIFnn3qW1198HVOPmdoSySSpbIZkIoENLcVKmUKxxNNPv0g2k8J1HVqbmvF8j9CcFRV+V3dIYs6J8nyBaqWM7yelUqtJJpt6CcH29/cvstK+LcOWZoMVOtK3WxPnq67rkG7sY3IOe+i7j7laGxKJJAphfnaOVRv7yDbnmZuZ5dSRY9gwom9FH49+7rMkM0m26pu4efR2nnn8aZ5/+jmGTg4yP1Ng4MQAn9/+Bfo2rCJSEZGNcMRpCBLFOnFL4+5CuWaX8BlWazUO7z9CpVhj5ep1NLc0k0yn4v5vIy7Xa3VKxRIT4xMMDQ3Q1dVJZ1cPpoFPc7CINYvu3sq5m05ykSnO2YdNsBIyPTmCikKrQ1Rbd1v53s/e+x2A/t3976gkcbMtfikyOmY0E0UqmcB13fjmsFTV2b6jxuEiltbGLGZRpFGOQzqdJLKGMApxVTwqVK5idHSYM0ND9K5bQTWq0tTTzGe/9DnuvOdOvvO1b3Ly6EmCMOBrf7aHT33+M6zcuJJUc5p6UG8k3WZx4iL23E6ubTQalKMoFIs0Nbdyy209JDMpkJgBNWzARAWNJHxaUx20treTSKdwlYNyPIxd+sjbN2cFv2Rh41i1ul6roKwxbiKh2jpanm9qyR9pcEuYd+orrTE6chwnHh57XmMPxV5GlfgGQNpY/KRHU1sTFV0jMppSqUi+Kc9d99yFeIqpuRmef/Z5ynMlPMdFhxEBAb3revjV3/yr3PXA3bR2tTM2Mc7X/mIP39nzbU7sO4ayEhNoGdNQdoxXP8/tDMXvx3XibpOb8PEbD1gUmcaClIvCRcQDHOraEllh1dr19K5cddHyJgyCuJnydgKYQLlYJKhGRFhWrFshW2/a8p16NeCdZMNLDTuptR2P3Vhc5cTDdnvOzXjnFaws0lLF8E246/67uPuBe7jzvrvIN+WplCt86P4Pc9cDd1PTdcZHxxg6NYCjFa5ysWIohWVSrRl++a/188ijH6dv9Sqq5Qr79r7Cd/b8Ja8+/wqedcgmMg2SSvum9biIEIYh7e1trL1hLTVdI9AB1pVY1b7B+G0a5LMiDkYcQm0bOEJ502VpEaE8X2ByfAxHLMqaJauS9qJD4kq5hA60SWcyqntt9/77Hr3rG4C8k2z4nOSpVC6pKIpoaWmJn7wwxEulsEa/q3NrGtV3rAwd66IGJqJvbR893V3YBRFAgUAHfPoLn2VyaoZTR07xw+98HwFuuGkTNROhPJfIaMJIc/Mdt7N8eR/P/vxpDu/fT2GuwA//8vscPXCUG2+6kU3bNuMnE4Q6WpTlfoN7FNhyyyY6uzs5fuwkE6NTWDS+8mNzWJbotcefw2BjJ6TjpseCToK1NkZ11urMTM+QSaXI5fMN4usLH18linq9zNTkBI51KZSKMloYFZKMLTkV71QRWuajIBy3xjJfmLflcmmJsO7lag/HJ8ECRlnqJkCSLpJwFsuRQIeolMsXvvTL5JvyjJwZ5ttf/RYHXzxALtGMDRViBKVcSrUK+c52PvFLn+ETX/gsLR3tFCeKnDk6xDf/4hv82R//OaODYyTcJI5yGzf/XLiPtZaQCm29ee758K3c+6HbSaVd6kEZE9ZRxKNER6RB6X622eG6Lm5jeLCAUVrYZi/MzjA1PrG4NHl22fm8IUhDfqVSKVGan8fUjW1ubSHVlB5sGPWSQGsXuhwE/sZf+e1fO3Xg5LqZyWnb3derbrnrNpSrWBBxs/JOh2ZnWZEW9dwbXfKlMVyImbpDHdCcb2Z5Zy8DJ08TVTXTkzN0dHfS1tYRU9EiiOMS6AgrsKyvh62btpC0Sc4MnQErTE9Pc+TIUUrzJbq7ukhlUhgbT1DO6UaJxhIh1tLc1MSK3l5SyQSRDgnDEGMjwrBOGIVxq9MaTBRRmJtlvjBPGAToKFqUBh0bHKRUmieTzdDS0rrY3DmfBG+pcPHs3CTVwjyOsbQsa+HjX/zEP16xtuel3f271Z6De96xYV0Rwfd9FTUozrWOFrGtl48ib8kIzL5JaiELYvJCLaqzZut67v/YR/jRt3/I4NAAP/zu9+j/q9tJ5VNYZTGExCTcmnolINWU5pG/8gm6Nvby/FPPMHJqmPmhWZ4Z/BknXjrEHQ/dzdbbbyaRyxCZEKsDRFtwnVgbQKCmqzgZh3XbVrLihh7mK/HocL5QxJNYA3Z8ZJR9L71OWK4zOTHdEGhwWNG3nI62FmqVAo5jyeQy4DrxuWjcRyNnl8jFmjgG65DSTAFHYyNdUR3Lm/UtD9/8wrspc84y1mnTks3nu9PpDMYaicdV8p7smksD2FUzAffcfx9bbtqCRjM2OsazTz+D56pzpBlEDEpAm5CaLnPjrVv4rd/9LR751Mfw0z6BCRkeHObpH/6MH331Oxx/+SDVmRKuk8RJphqsLYKxGqMMgQ2omgrGNeTbmuju7WbT5htoymXZ//JLHN2/n4nhQSqlAgpNGNRRYjA6oliap1qtYqwlk8s1SEjOx0iwWF8LEAUB1UqZaq1s8y05epZ17UvA4OWAa7rKUbOPf+35Uc/ztnmuZ+fnCzF7deI9kmRRQmQskY34pe1fIIpCnnvuWV579TX8pOIjH3uIehQt6rRaFW+CK2upBRVc5XHfR+5j9YbVPPvMcxw7cJRCoczLz77Ma8+/zKqNa1m+fjU9a/pYvrwDz3HiTpNqPFhKqNfqBOUKY1MzHNh3gCMHDjM3Pcttt9zCpo9vIAoinnj8KSyGWlDF2IiR0WlqYUjfqjVksjmMtkvINN/I0es6DlNzcxQL87hKbLIpQ7Yp+z0RKfXzztqI54/tCIPA1mq1RcXhhYTAvidChXFCEuqQZCLBxz79cUIiRkfH2fvcCzTlstx6153UTRi3KhskY4a4waHRRKZKz6oePrvyc4yemWTfS/t4+annsJU6oyeGOPDqATKtTfT1Lae5uYnunh5wFOIoqkHA9Pg4VKpUajVefO1Vbti6mV/7m3+djVs2c+rQYb77tW9Qr1cJtdDTs4x0LsvgmSFa2jpi7mHlxTROS5sYS9vajX3Z+cI8Yg1atCLrBOtvWv9da63s2bOHPdv3vKu76CIQhhGVaoVardZYKJIls0K5ykSY8e2wKo57zZ0tPPpLn+U//+f/yukDQ/zgWz/E9ZPcfPstVKOgMWWRRfjKgrBvNaqCCJ19XTzU+wg33rKVwcMneOWZvaSyGeYLRV5+9mVaWtuwvEYQBmhtSKZTJFwHz0ZogY8+9DAPfeJj4Dn85Kc/5fHvfx9V1zhubLyOzm78ZJJcSxvtHe0xbbxpUKPa86HwDT5iJURBQKVcRsAk0knV2dt5aNOdm14SEWsvwwTGXTCb58ZbAPV6nVqtRiqXbJB2XV3W0wVgmMVgHUvVBmTbWvjir/4q3/7yn3L6xCm+/+0fksk3sXrjWqpBpaFGrc5pqCw+kGENV4SeVZ30ru5l8x03YSohB/cd4PV9+ygUYrodVY1r1eZ8jpa2NtZt3simG24gl8vx6ssv88QTTzBfmCPhuIjrIZLkho0byLW0o41l/YZNJBIuBhUzkS8ZF8riLYyNLUpRKlcolUqIsaa1vUU1dbV9WykV9PfvftduOHbFBvLNuUU9mnQ6HTNkG/Pe8E+IXRR5W2jd16May1Z089d/+zf58n/6LwwMDfDH//GP6f/V7dx4x81UgxqhjvAcWfyvpHETXRsL/EYmxIgm05rHaVHc03k/dz98H6VyEV0PCYI6vuOS9H2y+TzWS3Dw9QP86Z/9GbNjUxAZOjItiKewrkNv72oy2WYCbbGOwnfTGBst2SaWs0jo8/aMrbHMTk+jrCUIQ9qXtduHP/5Qwf6e5W9v7pA9l+E2ugjUgwrFchmsNHZjG1ASrj4rkCVmAF06JFeiCYIime48v/l3f4f/9odfZvj0MC898QKTY5Pc/uF4CK9NiEU3ZM7iFoNuYIJFwDFgg5DANJ4dD1LNWQRIuC4JxyOoBxzav59nH3uSY8dO4ohLKpkjUoZErg0cS9eyLhKJNHUdgfIWtxnO5WO0CxrQ5zALWIl75tVKBQexylNuXVfr7b3NPwZ4kAcvi066CyzKZkoD7uE4zqIO3LXAB2QbuOBavUwyl+LX//Zv8mdf/u+89OIrnBw4xeDJkzzy2YfpWtYdD/O9WOoM5aCjEBPFIhfiqrPuXhTK8XAdDxtp5qYKHDt8lNdefo2TR4/iRCEpL0m1FmCx9PT2xPIuTU1oqwh1TOZ1aWPNhRMcd7KioEapOE8QBDaZSUhTS/65TEvmMPC2sU0XbVBEWjc6LZa52TmKxSLNbXnQhmvpEkeomRpuPsnnf+NLTMxMMXlymCMvHaBUmOWmW26ke3kPoxPjoBTtHd20draSz2cQHERZtDaxoqUxlEszjA6NUK8GnDh6nJeefwnHOqSTaYK6oR4Z8vl2VqxaTXtHFwYh0sQ/SxoCiIscHfYSoozFFZfpmVlq1QpKrO1a3mnXbFp7UETql0JB8DZirI1ZYhI+1lpcz0WuUeIugwVHqOoameYsv/E3f4M//rd/xOzIJJOnp/j56M+xypLKZigUyyAO6WyK7p5OenqWoSONsTA7M0sYhkyMjTA7PY2jXFJ+mpybxkaGsBLS3N5Ld08PbR0dOJ5PPYyFf2PRQLtkESsGv7+VUq2xFqcBXCvOz6HEEEZ1lWvPyG0fuvl7DWzTInf0ZYmxURQRhRFKNRrajca3tm+943J1K9w49rtAUC/Tu7KH3/4ffpev/ulujuw7CvUqfsIlNMTwHvGolspMjY1z6LVDpFJpEokEQT2kVquDRGTTWaq1OtWghjaQyqTo615O9/LVeIkEUaQJdBiDunXU6FY5SzYEuCS0nzSWusKoTrVUQsSabDat8q25091rup98p6C1i8ZYrTXGGFynQSzSwOGKcM3E2YVGuoohPLgKqvUyzb1t/PX/4W/x+iuvMTszRRjUKMzOkfSTnDx+iqgeUimVsECo6zGo2wUtIZlsjmw+z9reZfT29ZJraaZcq1KrBwSVkDCsolxFwnFwlEMMRlBEkaVcKSMInuvHs+uLGbcxXXIch6BSQUcRDsqmUkm6u7u/LyIFdqDeKVrizQ1rIeH7pFJJbCqkubn5LKvJNUemeHZT3FowKl7JUI7DbR+6FazBRDoGvWtNPQgxkaZUmMcYS70eCzkUSyUSiQRNLW34CZ98c1McigS0MdSDAB2GsWQ3FqUWDKvAOARBxOzsHEeOHKMwU8GVNBiHuPw0F3jbgjgRU9Mj6KBGMuGRbk/TvaprLyCP87h6iIcu74lNp5Pkm3LMj8/guR6xUpZg9bUWas0SVET8WtArqFTK5xB34Cj8TCz5mW9pesOMWZSgbZxEaR1RCYLFTpurBDflLmFBbOj9YFDWkkk4ZFo66VjWygtPv8rkSAFfZRvLZhd2xaGuMz8/S71atsaJnM6W9uK9n7r7GcA+uPNBza7LvH0sKm6EI4I2MQnVAjTGvk9oRpRSKKXOHaZrjdYR9SAgDEOCMCRofF2r1QnqdaIoWkQzLPz3C00Eow2mkUWf3a21RDokqFdxfeG2O28mlfHRtnbBoVjcprWE9YB6tYooZZSnyOayTwLH3+1Q/YKG9T2XtvZ2XMfh5MmTBEHQWDbi/c7fs4j+t6qxFKbOLnLJeQ/CRXaSz61IFeDEiVAq47J+4yoiW71wjG2gEYvzsaq0WGM7l3XazTdv2ici+lKZYN62YSvlih0fH19sb2pj4IPF5HOOkpZtuOJ3um9rFp8bi7YR7Z0t+Al1we2JOFpoioV5komUtda6Pcu7Ze0Nq38M0H+g314Rw7oJb3Bubpa52Vkc14khJB8kAsXGyVvcp5V389HUWWLpRrabzWfI5NINikJ5kxVdIQzqVMpl6tWaTfoJ8vn8oY23bXwBeIPg4GUzbFAPyko5pNJp5mbnqNfqXFNVzjXnAdRZCj4Ta7C3tLU2Kgl5g+6tiFCulimXSjgiNpFK2kTC+66IlK5EfF00rNE8lc/n0DaGalZLpXhXVuL1R8deY0fvDeIN5i0HRm/2eqdmFUxcvhgHQaGtpqk109CztY0hRvwSaxEFc/MFdNWiIyt+qys9W3qesVi5EvF10bCdnR2+tWAaOqzJRPKc9YjrB/diMlxxeZVOp2OqeHtuezFmWgupl8u4KGuNUdrR4w9/6uFXBLEHDhywV8ywpVLJLtR5nW3tJFwPo811PYBLOb0qLmfS6RSup7CLqpgLFD+WsF6jMjcHElnlC2tuWHuGJIMAF1PieNeGzWQyNp1OYyLN/OwcpVIJR50Fs11nF794aNBak8lkyGTSDexyA97TGP1UK8UY0WBC297Tyqq1q74H2N0xWuLKGTbSkVur1cBY6tVaAzmnFlcUrjOhXgJBtePS0dGKMdEipW08JNCkUz5RVLNeUil8wmVrur8tIvZC8mWXzbCtrW2zWCIByWezpHwfq6+b8+2e3Wwu21iaN0iDNlApoVqr0LOsG1EibZ3N47c8cMvAlR+XAD0bW3/uJ70zruuqnp5e47jxAtS5ouTXr4tp5RkiMlmfmB5KLWK12lqbSTgeI0MTJnKNbVrW8pxSagJw3kqw4bIwVSZSrvUSPvUoIpHOxIZV0lAuvm7Yt9LKs0Qksg6JhItYITQBqYwPNuLoa8eolREnn5TO9d0vW2vZ3b/7yp9YgOmZKaIo5MSJE5w6eRLP9RrqEnDdrpegFWAsiWSSRMIHYhHf1pYWpiYmKczMmISL6mhrGvz8lx79fxu7OeaqGHbdDRvimWSkCer1eBx23aBvK4FyXZdMJtMoFSGXzTI+NobrgOda8rnUST/pzyzIul4Vw6YyKZvN5ejq6iKKonhsJ9dP69sxrBIhkUhgTEQy4ZHLZJidnCSVSlov69HS0fzDoBbIjgd2uFcjeRKgPj0zdUjriHK5FNO6L2FDUdeNe8mTH9d30FaTSiV5/fV9zM/OEYQ1ae1riz7+hU/tFxG75e9sueJ31F3CIxXOzc1hjWFqegZr7HV3/Lb5yiy+7yNInK8cP4rR2iQTnnLzydMrt678OZcZtHbBE7vjgR2OUso4vpxobWvGdz2Ty+fjInvpFvr16xJOicJJOESeJgjq1AsVCCLTs3oZm2654UdA8Up2m859Lw+C/Zllw6b1Y9NHJ5mZnJVsJhNjxSWeVlzvKF46xaCf8rGOplIqUS9VQXA6etvttrs3fb2xSXdVbqjasiX29+l0ckqUWG20HDlyhGqlinLUdU/M22EJj/Acl4TjMzo0TBSFVvmOBDaQjp5lk1xVoG7jmpqe9cbHxonCcJExjCXiCNevSzCsNSSTCcJqnXq5itbapnJJMk3Zvc3NmRNXUzFq0bBtbS1BKpVcpLqJoojrUpRvr0khCjxHUStVKMzM4iplu/uW0bNq+R+JSHF3/251NeIrgOrvj4FUyVSy7PtJq5SSMIoIggC5rhz7tmnyrbGIgfbmdnK5rKqGtWoi6x+zWKH/aiZyjauju+tMKpWIXNf1FWKLxaK097SB5jr+6ZIaFA3QWj1kYnScoFo1ro9q726b+fgvP/ycINb2W3P1YuzO+IvsisT4stW9UVOuFcd46CBEK91gDHXfoFZx/XqTmayrmJ6dYXpqmqgSYHTddPd1fQsId+zYcdXc8DmGbU42+1bhzM3PUyoW8X1/kaZORF233CXEWIxw4thxyqWSVa6oVD4VLt/Y809FJOKqr6/tXPy6dmZkqBxEdRIJjzNDZ1BWnQVnXT+wb7liUi5WOHzgEAnfJVIBLT2txbvuusu+N3RZ8Wq8cjxnwHXcJ3pXdGOtNbaxtyJIgzTjehJ10cmO43JmYITJkXE8B+NnPdu9uvuJbEd2YAc71JUcql+w3NnBDkxk2Lh5o2SbMpRLJXSoMZFesiN7/bpQMrxAa3vs8Amq8xVcB0k2JyXVnvm20YYt/Vvk6rvic95jMDw8PkyhUKA4Nx8TOmPfI/Xn9w/YSSlFsVTkxMkB0smU9ZRSXcvaJn/1d/sfA7iSoLWLGvZg/0EBMMrZJwpam5plYnycSqWKUs5lYkL9YFlzgaFAG0PKTzF8aoThE0P4yjPLVi6zm27a9Lhy1DAgV9sNLzmxceXctWxZqampmcL0DJOj48zOz8erhtcteZ5R45VMDYi4KOtx8uAp3KpGm4iCLkp7b+tT1ljZsWOH854kT/F8MP7LmvXrJpOZJBZLGEVE9aBBQmmvbwVcAHKqRKhXqwyePo24Yq2yzvJVvcfue+S+x5ag3XhPY2winzCu6xrHcaUyX2Z4aCQmuLLXIajnr4XFsSsWYDxzepDpiUmsWJNtznDTrdumSXAMkD/4gz947wy7fft2A9DenX2mUi0d8l1PHHGNKy7WWJzr/Yk31XwX4k3Efa+8QmF6BnGgY1k72Zbsj0Qk3L17t3qv8pPzTVZftmJZram5maAeMTk+hdH6+lm9gIFd5TA/V+Do4SOkkykjrjgdyzv33/2Ju//5u5VXudyGlWw+m5ifL6JQjAyPUq8HDf3V67bk3OErnusyODDA9MQUUT2wmWzarlm7+oiIzF8NiOklbQLsYIdyPddoGz3mJQXXUba9rRNrBW3N9ZbiWf2jWFZcaayOOPr6EYgUkbGkWhMSqup3rLXyblSuLu+J3YHSkWbb1i0nWztaCKOIkTOjzM/O4/jO5ZEd/WB0+7E2pqkvzZc5fvgErvKMn0qobbdvOf3ZX/vsj0TEvpdu+HxXbADybdlXK2GtkkonVcrzrIPEenHXj2x8kxRoETw3wdGDxygVSihrTXdPu7S0Nn1dREauFhLxkgy7sFm9+d4bD7R0tNXCKJTyXIGx4REc5Vy36CJgLU6Lo8Bw9OBRRGOr9YoTSq12w7YbvgnIe9FCfKvkCUD5uVRJW8381CwjA4NEUXQd/rQE7e+5HmODoxw9cAyrxazZsIaOFR1Pbr5785MA70UL8YKGbcQFRyk1mcimf5LJZImqVT03OYM4zvWseIFzwoInLvtfeZ3SXBlXuaRyabnlnluP6kjTT7+6Nnhi32S22NzWMo+y1lUuYyNjlIsVlHN9GGARRCzFuTkOvXYQF8fWwkCVosrwrR+65d8B7N6x215zht29O35T6zf0fKdjRbMYz3HHRqcYOj6E63kYYt6nhdcHugd8lkF3kXsRY/EzPocOH2ZycArXiMl3JOXej935447ejkM7duxQl4vT/0rEWO795IdPOr6a8JM+URjZynx58ROfwy4qH1wgqbzJN5UIUS3kyP4jmCCis6dTuvq6ojU3rP6RMUa2bNlyzdwRdR4gK97YUXJq2Yplh5pa8jiiTFQP0WEUK7Wdt3ryQTWuOV8G18YN/6mhCY7tO0oylbLKF7V83bLJLbdv+v61ULte9MTu2LFDrEG6V/T8NCKyqUSSk0eOUi+VYwEBbT7wg55z+K0WNOqsxXcdhk8OIUHMaDxXm7OJ5vR/BQpXG176tg27ZcuWmIs54Z9QSVc8z+XYwaOMDo/gex7qF2wyu7BF6oqiVChyaP9BfMe1oak7uc6s3Hjntj0iYncugXtek4Zd4Pa7567bDjiemiuXKsp1lJ2emISFZegPuGnteSHGaovv+QwMDDB4+hRRVLepfDLacvOWP99y84b9gMgfiLmmDbvQgerc0Hlww7b1E01tOarFmj1x9DQ6MIsi9L9YA1gL2nL80DHq5cAGQajwTPWTX3jk/xSRaMeOHXKt3RL1Joh229/f7wBRtif7hJvzRLRrJ4enmZ+rIK6LVQvUrTaedHzg3K8gVrBiMVbjex5Dp4bY+/O9JCVtvUTSLl+/fLRrTddJQK4U0eVlL3c2b95sRcQ0tWe/XA5KY27SVaPDI3bw9ADKypsSLn/Q2obS6DKBQqF4ce9eyuUSkUR4aUduuePmPxIl5f7+/msqabqoYRu9TvXJz37y2VWrVz3rpVyJ6oF57eVXiOoRToMncEFv/AN7GUi6CSZHpzh04DCZTMbUTFVlu9KnPvPXP/1fsLB7925zbfJhXODasWMHgPrwjfcWCiNFSoUSo2dGmZ8t0NTZhLX6A21U0zixLh6HXj/M9OQ0CVzb1Jnn9gdv/6mITDdo369Jw16wYb1z50527dplNt2z7d8aN6oopVRQqdlDBw7iKLdR38kHeL3S4roeM5MzvLT3JbLprBWl1I13bK1/6Xf6/9+4tL128wt1kbVAC9Czqv2lFX0rXm7O5qVYmLcHDxykXq0joj7QfDLGWjzHZe8LLzIxPkFQC01XZ7e0tbd/3fXdvTt27JBr9bRe1LCA3b17txPWQ7n7kTu/k2z2UXVt54dnmJuaxvUV1oS8n5GpYmNiunioYRfHchhIJhKMnBnhuZ89iaOtNYTSs6679tnPf+Ff6FDLtdaQeDuG5cCBA1ZE7JrbVv1lpjM35/qemp+cs0/99GeUS6X3/ShPlqiC2CW6PEqEKNQ8/qMnqM5WsDVt2rva1eY7N/1lcrnz4o4dO+RameK8I8Pu2rXL7NixQ3V0dBzedvvNX852NIvruubkwWMMHTmN6yaJcN73hCBL563agpdIcuDVA7z89Ev4kjSpREaWr+od/OiXPvL7xhiuxbr1bRl2IYkC+NSXPvHnbSvbKQVlFczXObX/BLVSiON479v1D3v+spUBz01QLdZ57mfP4ogHRkxTW7O6/b7b/p2IDF0LQLXLYtiF8WS6zXvtvo996Mne9aukUqvoF59+jpeeeg5HnEUJz/fbHq1dutRtwFcuphrx+Pd/QmmqTDab0bnurLvujrVPPdD/4T/c3b/budIE0lfNsCJiGxlg/WP99//tznXLSpGDKGvtkz/+KeNDw7ieF4vxvs/irV2gT7fgaPC14rmfPsnenz2PaxxT1WWHNlv50Ofv/X0RmT+wOc453g+f7ZIC5M9+9jO7u3+3s3X71vHf+73/NZwZm/x4ZXbe2Ag1PTfD2k3rSKVSaKPPFd+9YAtDrhnwt7EWrCHjJRg4eopnn3iG+nzVVso1u+6WtdFnfuMz/+Otd239prVWPfTQQ+b98tBecuaz+8BuAPVbv/trLw6cGvjw8aOnVzt1Txeniko5ilWrVqL8mE9QlAKtcGzcc41nuNIQXlVcXalLaYgMCueOYCwGQYkil0yz78VX+M7XvsPc+DzlUkW3r2l1b753y7/8+Bc/8o/7+3c727dvNe8vit1L5zGyu3fvViJSt9b+vbnxwjMvP/ZqKiOePfjSQbHGcN9H78PPJImsQZxYKnvhZtqLpC1XZex2zm+NFZwdUXjW49nHnuXZx59kcnwCsUp3ru5wl2/s/o9f/N3P//4DX3nA3bNnu+Z9x538Nq7t27frRlb46uG9x35lbqbw30/vH0g5s6786Ns/VpVKjUe/+Ciu7xDoEOUsqKpLrMrYiMENypKr2IhYYliJ0fy+72Eqhm9/9Ru8+NReHCOIiHaaxbn54a0v/9r/91f/twa/sHm/xNV35IoXrj0H99jd/budB/7e/Yf+6b/4v3IzkzP3j5waFc/z7PjohBQK8/T09JBrzqG1PttTfkOElavOxRTLiwoJP8ns9Cxf/eO/4JVnXsTDQ5QYmzbOhz91z4/++t//9UdFZMZaK+9Ho74jwwJ89dBXbX9/v/P3/8Hf+7kNOHHq9Ml7S8Vy1nN8O3ByUEZGRmlvb6e1pRVXHNBLjLmYXMlV3bdxEJJeCte6nDh4jG/u/iajJ4ZI+r6NxJjm5c3Olrtv+Mvf/Ye/8xsiMmt3WCUPiX2/A/Le1XX01aO3fPlf/vlT44en0o51tXaMIynhvgfu4bbbb6WlrRWjLIEJMRJLc17pW2ZjZi2MBc9LkHB8hk8O8ePv/ZCBY6cIKnU8o3ShNu+suXkdH/rUff++/zd/6e/UqjXezyf1XZ3YJe5NAPeLv/LFkf995z8+VKmWPjc9PePXq/VItKsGTp7k2OEjzM3O0dTSQlNrC0YpImMQ24DWYBFpZM+yEIPVWRcuwsL/4u+pxVNv48ZuA60ftxrExqSeDg5JN4nn+YycGeOJHzzOD/7y+4yeGiUpvtW1SCcyvrt625rSI7/80X/yuV//5O/XqnV5v5/Uy3pid/fvdrbv2a7Hx6e+8OOvP/5vnvnW88vmhks2m01QrhQkmUmRac6zZvN67n7wQ3Qv70GZAKwlMlFDmrMx3rYKK/ESmJyPzJfY4DoWzAZrsUqwIjhK4iwXF6UhrIQcO3yU1/ftY3J8koGjp0l7WZtKJmytXlFdy7u54Y51Tz7c/+D/snz98mcW5qvv95N62TsF/f39zp49e7S1tvcH/+1n//Llp1/54snXj+OJEwk45XJZQhPR1dtDV28PfRtWsmHjOrL5POlcGqXiwkhLhFWaWFo87mYttiwRxHFRSsUnUykwgo4iqEbMzxU4M3iG08dOMTU+wamTp5DAkEskTaVWs5HCybY3sWrzmtMPfezB/3D7J278dyJSXngw4YMHer88cW2HVbJLjCg4+uLg/zR9au5/f+Fne1PP/PxJHGNNOpFRUaiJrMHLuiTTKTp7ulixso9sLktndw/51gy1qEwumyOZSmEa3SwlikCHVCpVioUiJjJUSlWmJ2cIKnXKUwUGBweZmZpulKnaYsRaE4rnO6p7ZQ+p1vTcDbdt/aP+v/X5/1NEZhqLaM727R8so16R1HTHjh1q165dMQihbrcdefnMP9z/yuuPnth/PHfq6CkzMzlnXcdVKSUiIpSqFbq6uxHlUK/XMWJJpHxy2bhcam5ppqWlheEzZ8jkMoyMjlAuVdBBRFgLUcrBd30ThYZQR/ieZ2tBxWlqbsZoTdPyZlbfuGpg9Zq+f/+JLz38547rDBlt2L17t9Pf328+KK73qjVtGwY2jQRr4+lXx/7JxJnJz7368gGOHj7K/MiELhaKSDxPsI541vM9onpI0k9irSUMArLZLADz80WUp0hn0lQrFXQUiuO6NooCSSZTqm4NOJDJp2ntbiGby7yweu2ag+u2bfjBHY9s/amITJ7tV3xwYulVN2wja17A3FprrTN1uvClsMbfnp0r3qYrOnniyAmOHzvG1Ngkuq7xHIfJkTF0rY5yHJSoeLCwyNZi8RM+yhVaO1qo1EooB/yUP5hozupVa1YWu3u7v73l5k3f7d3U+6KIhEsTvP7dH9wT+p6MWRoGXmyij52Y2Wat+0kT8UAUhZuLc/MzczOFURNpd+D0SSZGRgiCAIulXCqTTCex2mIIbXtHm9/b23OipbXtB5Vqxe/saqvf9rE7nwBqgBGR+mJCR7/T39/PL5JBeQ/o1cXutm+om4eHh/ustblFUmdX4foOjnf2pTx1zt/fqvSy1qpGCPiFvf7/jXzHMG69uGEAAAAASUVORK5CYII=',
      },
      desulfovibrio: {
        line: '利用<b>硫酸盐</b>产生<b>H₂S</b>——过量 H₂S 是<b>强效毒素</b>。',
        img: 'data:image/png;base64,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',
      },
    };
    /* 贴图（base64 内联）预加载：有图就不用代码手绘 */
    const SP_IMG = {};
    Object.keys(SP_CARTOON).forEach((k) => {
      const u = SP_CARTOON[k].img;
      if (!u) return;
      const imgo = new Image();
      imgo.src = u;
      SP_IMG[k] = imgo;
    });

    function drawSpCartoon(c, id, t) {
      const bobY = Math.sin(t * 2.1) * 3;
      /* 贴图优先：用参考图原稿，只保留整体浮动；局部动效（如纤毛）不适用 */
      if (SP_CARTOON[id] && SP_CARTOON[id].img) {
        const imgo = SP_IMG[id];
        if (imgo && imgo.complete && imgo.naturalWidth) {
          c.save();
          c.translate(115, 122 + bobY);
          const hh = 242;
          const ww = hh * imgo.naturalWidth / imgo.naturalHeight;
          c.drawImage(imgo, -ww / 2, -hh / 2, ww, hh);
          c.restore();
          return;
        }
      }
      c.save();
      if (id === 'bacteroides') {
        const BODY = '#B57CB8', EDGE = '#DDBBDF', DARK = '#6E4E72', MOUTH = '#8A4E92';
        c.translate(115, 122 + bobY);
        c.lineCap = 'round';
        /* 腿（画在身体后面）：细长直腿 + 向外的小脚 */
        c.strokeStyle = BODY; c.lineWidth = 4;
        [[15, 1], [-15, -1]].forEach(([lx, dir]) => {
          c.beginPath(); c.moveTo(lx, 66); c.lineTo(lx + dir * 3, 94); c.stroke();
          c.beginPath(); c.moveTo(lx + dir * 3, 94); c.lineTo(lx + dir * 14, 94); c.stroke();
        });
        /* 梨形身体：上窄下宽 */
        c.beginPath();
        c.moveTo(0, -66);
        c.bezierCurveTo(30, -64, 41, -30, 44, 6);
        c.bezierCurveTo(47, 50, 30, 76, 0, 76);
        c.bezierCurveTo(-30, 76, -47, 50, -44, 6);
        c.bezierCurveTo(-41, -30, -30, -64, 0, -66);
        c.fillStyle = BODY; c.fill();
        c.strokeStyle = EDGE; c.lineWidth = 3; c.stroke();
        /* 粗圆手臂，环抱向中间 */
        c.strokeStyle = BODY; c.lineWidth = 11;
        c.beginPath(); c.moveTo(-40, 16); c.quadraticCurveTo(-50, 34, -27, 46); c.stroke();
        c.beginPath(); c.moveTo(40, 16); c.quadraticCurveTo(50, 34, 27, 46); c.stroke();
        /* 怀里的彩色糖链小块（微微转动） */
        const CANDY = ['#F2A8B8', '#BFD8B0', '#EAD9B4', '#E8B4A0'];
        [[-25, 46, 0.5], [-13, 55, 1.2], [23, 44, -0.6], [12, 55, 0.2], [0, 60, 0.9]].forEach((k, i) => {
          c.save();
          c.translate(k[0], k[1]);
          c.rotate(k[2] + Math.sin(t * 1.4 + i) * 0.07);
          c.fillStyle = CANDY[i % 4];
          c.beginPath(); c.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); c.fill();
          c.restore();
        });
        /* 头顶三根卷毛 */
        c.strokeStyle = DARK; c.lineWidth = 2.5;
        [-16, -2, 12].forEach((hx, i) => {
          c.beginPath();
          c.arc(hx, -73 + Math.sin(t * 2 + i) * 1.2, 6, Math.PI * 1.12, Math.PI * 1.96);
          c.stroke();
        });
        /* 八字眉 + 圆点眼 + 张嘴大笑（含小舌头） */
        c.strokeStyle = DARK; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(-9, -34); c.lineTo(-20, -29); c.stroke();
        c.beginPath(); c.moveTo(9, -34); c.lineTo(20, -29); c.stroke();
        c.fillStyle = '#2B2B33';
        c.beginPath(); c.arc(-12, -21, 3.6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(12, -21, 3.6, 0, Math.PI * 2); c.fill();
        c.beginPath();
        c.moveTo(-15, 4);
        c.quadraticCurveTo(0, 13, 15, 4);
        c.quadraticCurveTo(0, 33, -15, 4);
        c.closePath();
        c.fillStyle = MOUTH; c.fill();
        c.beginPath(); c.ellipse(0, 19, 8, 5, 0, 0, Math.PI * 2); c.fillStyle = '#E8A0B0'; c.fill();
        /* 左侧 Strong ✨（星星上下浮动） */
        c.save();
        c.translate(-86, -36 + Math.sin(t * 2.6) * 3);
        c.rotate(-0.2);
        c.fillStyle = '#F5D93F';
        c.shadowColor = 'rgba(245,217,63,0.9)'; c.shadowBlur = 12;
        c.beginPath();
        c.moveTo(0, -11);
        c.quadraticCurveTo(0, 0, 11, 0);
        c.quadraticCurveTo(0, 0, 0, 11);
        c.quadraticCurveTo(0, 0, -11, 0);
        c.quadraticCurveTo(0, 0, 0, -11);
        c.closePath(); c.fill();
        c.shadowBlur = 0;
        c.restore();
        c.save();
        c.translate(-92, -8);
        c.rotate(-0.14);
        c.font = 'italic 700 15px -apple-system, PingFang SC, sans-serif';
        c.fillStyle = '#C2559A';
        c.fillText('Strong', 0, 0);
        c.restore();
      } else if (id === 'prevotella') {
        const BODY = '#F2A3B2', EDGE = '#B04A5A', DARK = '#7A3A48';
        c.translate(115, 122 + bobY);
        c.lineCap = 'round';
        /* 腿（画在身体后面）：细腿 + 外撇小脚 */
        c.strokeStyle = EDGE; c.lineWidth = 3;
        [[13, 1], [-13, -1]].forEach(([lx, dir]) => {
          c.beginPath(); c.moveTo(lx, 58); c.lineTo(lx + dir * 4, 88); c.stroke();
          c.beginPath(); c.moveTo(lx + dir * 4, 88); c.lineTo(lx + dir * 14, 88); c.stroke();
        });
        /* 周身纤毛（先画，根部被身体盖住）：顶部一撮 + 两侧各四根 + 底部两根，实时摆动 */
        c.strokeStyle = EDGE; c.lineWidth = 2.2;
        const hairs = [];
        for (let i = 0; i < 4; i++) hairs.push({ x: -18 + i * 12, y: -76, dx: (i - 1.5) * 5, dy: -18, k: i });
        for (let i = 0; i < 4; i++) {
          const yy = -36 + i * 26;
          hairs.push({ x: -27, y: yy, dx: -20, dy: 5 + (i % 2) * 7, k: i + 1 });
          hairs.push({ x: 27, y: yy, dx: 20, dy: 5 + ((i + 1) % 2) * 7, k: i + 2.4 });
        }
        hairs.push({ x: -14, y: 60, dx: -9, dy: 18, k: 2.2 });
        hairs.push({ x: 14, y: 60, dx: 9, dy: 18, k: 1.1 });
        hairs.forEach((h2) => {
          const sway = Math.sin(t * 2.6 + h2.k * 1.3) * 3;
          c.beginPath();
          c.moveTo(h2.x, h2.y);
          c.quadraticCurveTo(h2.x + h2.dx * 0.55 + sway * 0.4, h2.y + h2.dy * 0.55, h2.x + h2.dx + sway, h2.y + h2.dy);
          c.stroke();
        });
        /* 长胶囊身体 */
        const w = 28, h2c = 64;
        c.beginPath();
        c.moveTo(-w, -h2c + 10);
        c.arc(0, -h2c + 10, w, Math.PI, 0);
        c.lineTo(w, h2c - 10);
        c.arc(0, h2c - 10, w, 0, Math.PI);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = EDGE; c.stroke();
        /* 圆点眼 + 惊讶小 o 嘴 */
        c.fillStyle = '#2B2B33';
        c.beginPath(); c.arc(-10, -30, 3.2, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(10, -30, 3.2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = DARK; c.lineWidth = 2;
        c.beginPath(); c.arc(0, -12, 4.5, 0, Math.PI * 2); c.stroke();
      } else if (id === 'faecalibacterium') {
        /* 普拉梭菌：薄荷绿胖椭圆 + 弯钩纤毛 + 眯眼微笑 + 周围丁酸泡泡 */
        const BODY = '#7FD8BE', EDGE = '#3E9E93', DARK = '#2E4A47', BUB = '#5FC4AC';
        c.translate(115, 118 + bobY);
        /* 丁酸泡泡：从身体周围缓缓上飘、放大、淡出、循环 */
        c.lineWidth = 2;
        [[-56, -52, 5, 0], [-74, -14, 9, 0.21], [-62, 22, 6, 0.42], [-44, 52, 7, 0.63], [66, -38, 5, 0.32]].forEach((b, i) => {
          const ph = (t * 0.22 + b[3]) % 1;
          const by = b[1] - ph * 34;
          c.globalAlpha = 0.14 + 0.5 * Math.sin(ph * Math.PI);
          c.strokeStyle = BUB;
          c.beginPath();
          c.arc(b[0] + Math.sin(t * 1.2 + i * 2) * 3, by, b[2] + ph * 3.5, 0, Math.PI * 2);
          c.stroke();
        });
        c.globalAlpha = 1;
        /* 腿（画在身体后面）：深色细腿 + 外撇小脚 */
        c.strokeStyle = DARK; c.lineWidth = 3;
        [[14, 1], [-14, -1]].forEach(([lx, dir]) => {
          c.beginPath(); c.moveTo(lx, 70); c.lineTo(lx + dir * 4, 98); c.stroke();
          c.beginPath(); c.moveTo(lx + dir * 4, 98); c.lineTo(lx + dir * 15, 97); c.stroke();
        });
        /* 弯钩纤毛（先画，根部被身体盖住）：左 2 右 3，末端带小回钩，轻微摆动 */
        c.strokeStyle = EDGE; c.lineWidth = 2.4;
        const hook = (x0, y0, x1, y1, dir, k) => {
          const sw = Math.sin(t * 2.4 + k * 1.4) * 2.5;
          c.beginPath();
          c.moveTo(x0, y0);
          c.quadraticCurveTo(x0 + dir * 2, (y0 + y1) / 2, x1 + sw, y1);
          c.quadraticCurveTo(x1 + dir * 7 + sw, y1 + 2, x1 + dir * 4 + sw, y1 + 10);
          c.stroke();
        };
        hook(-34, -26, -50, -40, -1, 0);
        hook(-36, 16, -52, 8, -1, 1);
        hook(34, -34, 50, -46, 1, 2);
        hook(35, 2, 52, -6, 1, 3);
        hook(34, 36, 50, 46, 1, 4);
        /* 顶部两根小毛 */
        c.beginPath(); c.moveTo(-2, -84); c.quadraticCurveTo(1, -97, 8, -100); c.stroke();
        c.beginPath(); c.moveTo(12, -81); c.quadraticCurveTo(18, -92, 16, -98); c.stroke();
        /* 胖椭圆身体 */
        c.beginPath(); c.ellipse(0, 0, 44, 86, 0, 0, Math.PI * 2);
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 3; c.strokeStyle = EDGE; c.stroke();
        /* 眯眼（上拱小弧）+ 微笑嘴 */
        c.strokeStyle = DARK; c.lineWidth = 2.6;
        c.beginPath(); c.arc(-14, -36, 5, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
        c.beginPath(); c.arc(14, -36, 5, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
        c.beginPath(); c.arc(0, -20, 9, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      } else if (id === 'roseburia') {
        /* 罗氏菌：浅绿长胶囊 + 背后小背包 + 绿色肩带小手扣在胸前 + 顶部麻花鞭毛 */
        const BODY = '#A8E6A3', EDGE = '#3B9E4F', DARK = '#245C2E', PACK = '#4A9EB8', PACKD = '#357E93';
        c.translate(115, 116 + bobY);
        /* 背包（画在身体后面，左右各露出半只）+ 顶部包盖 */
        c.fillStyle = PACK;
        [[-1, -46], [1, 28]].forEach(([dir, px]) => {
          c.beginPath();
          c.roundRect ? c.roundRect(px, -30, 18, 62, 9) : c.rect(px, -30, 18, 62);
          c.fill();
          c.fillStyle = PACKD;
          c.beginPath(); c.ellipse(px + 9, -30, 9, 5.5, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = PACK;
        });
        /* 顶部鞭毛：两条正弦绞成麻花，实时扭动 */
        c.strokeStyle = EDGE; c.lineWidth = 2.6; c.lineCap = 'round';
        for (let f = 0; f < 2; f++) {
          c.beginPath();
          c.moveTo(f === 0 ? -6 : 6, -84);
          for (let k = 1; k <= 16; k++) {
            const kk = k / 16;
            const ly = -84 - kk * 32;
            const lx = (f === 0 ? -6 : 6) + Math.sin(kk * 6.8 + t * 3 + f * Math.PI) * 8;
            c.lineTo(lx, ly);
          }
          c.stroke();
        }
        /* 长胶囊身体 */
        const w = 34, h = 84;
        c.beginPath();
        c.moveTo(-w, -h + 12);
        c.arc(0, -h + 12, w, Math.PI, 0);
        c.lineTo(w, h - 12);
        c.arc(0, h - 12, w, 0, Math.PI);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 3; c.strokeStyle = EDGE; c.stroke();
        /* 绿色肩带：从两肩弧到胸前 */
        c.strokeStyle = EDGE; c.lineWidth = 4;
        c.beginPath(); c.moveTo(-30, -48); c.quadraticCurveTo(-24, 4, -8, 26); c.stroke();
        c.beginPath(); c.moveTo(30, -48); c.quadraticCurveTo(24, 4, 8, 26); c.stroke();
        /* 小手：两个深绿圆点扣在一起 */
        c.fillStyle = DARK;
        c.beginPath(); c.arc(-7, 30, 4.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(7, 30, 4.5, 0, Math.PI * 2); c.fill();
        /* 圆点眼 + 微笑 */
        c.fillStyle = '#2B2B33';
        c.beginPath(); c.ellipse(-10, -36, 2.6, 3.6, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(10, -36, 2.6, 3.6, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = DARK; c.lineWidth = 2.4;
        c.beginPath(); c.arc(0, -22, 8, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      } else if (id === 'bifidobacterium') {
        /* 双歧杆菌：橙色 Y 形（下干长 + 上分两叉、端头圆鼓）+ 圆点眼 + 小 o 嘴 */
        const BODY = '#F5B183', EDGE = '#C1773C';
        c.translate(115, 120 + bobY);
        c.rotate(Math.sin(t * 1.4) * 0.045);
        /* Y 形外轮廓（一笔闭合贝塞尔） */
        c.beginPath();
        c.moveTo(-6, -54);
        c.bezierCurveTo(-2, -66, 4, -86, 12, -100);
        c.bezierCurveTo(22, -112, 40, -114, 50, -102);
        c.bezierCurveTo(57, -92, 56, -78, 50, -70);
        c.bezierCurveTo(44, -60, 36, -48, 32, -38);
        c.bezierCurveTo(29, -28, 28, -12, 28, 6);
        c.bezierCurveTo(28, 28, 27, 48, 24, 62);
        c.bezierCurveTo(20, 82, 6, 94, -8, 90);
        c.bezierCurveTo(-22, 86, -29, 74, -29, 58);
        c.bezierCurveTo(-30, 36, -29, 10, -27, -10);
        c.bezierCurveTo(-26, -20, -25, -26, -23, -32);
        c.bezierCurveTo(-32, -38, -46, -38, -58, -36);
        c.bezierCurveTo(-70, -34, -80, -40, -82, -50);
        c.bezierCurveTo(-84, -60, -76, -68, -64, -66);
        c.bezierCurveTo(-48, -64, -32, -58, -18, -58);
        c.bezierCurveTo(-12, -58, -9, -57, -6, -54);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 3.5; c.strokeStyle = EDGE; c.stroke();
        /* 眉上两撇小点 */
        c.strokeStyle = EDGE; c.lineWidth = 2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-13, -25); c.lineTo(-10, -22); c.stroke();
        c.beginPath(); c.moveTo(13, -25); c.lineTo(10, -22); c.stroke();
        /* 圆点眼（竖点）+ 小 o 嘴 */
        c.fillStyle = '#2B2B33';
        c.beginPath(); c.ellipse(-7, -13, 2.2, 3.4, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(7, -13, 2.2, 3.4, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = 2.4;
        c.beginPath(); c.arc(0, 1, 4.5, 0, Math.PI * 2); c.stroke();
      } else if (id === 'lactobacillus') {
        /* 乳酸菌：橙粉细长胶囊 + 顶部小辫毛 + 竖点眼 + 外撇细腿小脚 */
        const BODY = '#F09A8A', EDGE = '#D14A3A', DARK = '#3A2B28';
        c.translate(115, 118 + bobY);
        /* 腿（身体后面）：橙红细腿 + 外撇小脚 */
        c.strokeStyle = EDGE; c.lineWidth = 2.6; c.lineCap = 'round';
        [[10, 1], [-10, -1]].forEach(([lx, dir]) => {
          c.beginPath(); c.moveTo(lx, 56); c.lineTo(lx + dir * 3, 88); c.stroke();
          c.beginPath(); c.moveTo(lx + dir * 3, 88); c.lineTo(lx + dir * 11, 90); c.stroke();
        });
        /* 顶部小辫毛（随时间摆动） */
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(2, -76);
        c.quadraticCurveTo(6 + Math.sin(t * 2.2) * 3, -90, 2 + Math.sin(t * 2.2 + 1) * 5, -100);
        c.stroke();
        /* 左下缘一小撮短毛 */
        c.beginPath(); c.moveTo(-26, 50); c.quadraticCurveTo(-33, 55, -30, 62); c.stroke();
        /* 细长胶囊身体 */
        const w = 26, h = 66;
        c.beginPath();
        c.moveTo(-w, -h + 10);
        c.arc(0, -h + 10, w, Math.PI, 0);
        c.lineTo(w, h - 10);
        c.arc(0, h - 10, w, 0, Math.PI);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 4; c.strokeStyle = EDGE; c.stroke();
        /* 两个竖短黑点眼（无嘴，同参考图） */
        c.fillStyle = DARK;
        c.beginPath(); c.ellipse(-6, -34, 1.8, 4.5, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(6, -34, 1.8, 4.5, 0, 0, Math.PI * 2); c.fill();
      } else if (id === 'akkermansia') {
        /* 阿克曼菌：青绿蛋形 + 周身火柴头纤毛(末端小圆球) + 竖点眼 + 短横嘴 */
        const BODY = '#4ECDC4', EDGE = '#1D6E74', DARK = '#2B2B33';
        c.translate(115, 118 + bobY);
        /* 纤毛（先画，根部被身体盖住）：线 + 末端小圆球，轻微摆动 */
        c.strokeStyle = EDGE; c.lineWidth = 2.6; c.lineCap = 'round';
        const HAIRS = [
          [-8, -62, -14, -94], [14, -60, 26, -90],
          [-40, -38, -66, -50], [-44, -16, -72, -24], [40, -34, 68, -44],
          [-46, 12, -76, 4], [44, 20, 74, 28],
          [-38, 42, -62, 58], [32, 48, 54, 72],
          [-12, 66, -16, 90], [12, 66, 16, 90],
        ];
        HAIRS.forEach(([x0, y0, x1, y1], i) => {
          const sw = Math.sin(t * 2.2 + i * 1.7) * 2.5;
          c.beginPath();
          c.moveTo(x0, y0);
          c.quadraticCurveTo((x0 + x1) / 2 + sw * 0.4, (y0 + y1) / 2 - 4, x1 + sw, y1);
          c.stroke();
          c.fillStyle = EDGE;
          c.beginPath(); c.arc(x1 + sw, y1, 3.2, 0, Math.PI * 2); c.fill();
        });
        /* 蛋形身体（上窄下宽） */
        c.beginPath();
        c.moveTo(0, -64);
        c.bezierCurveTo(24, -62, 42, -34, 46, 6);
        c.bezierCurveTo(50, 42, 30, 70, 0, 70);
        c.bezierCurveTo(-30, 70, -50, 42, -46, 6);
        c.bezierCurveTo(-42, -34, -24, -62, 0, -64);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 4; c.strokeStyle = EDGE; c.stroke();
        /* 竖点眼 + 短横嘴 */
        c.fillStyle = DARK;
        c.beginPath(); c.ellipse(-13, -22, 2.6, 4.2, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(13, -22, 2.6, 4.2, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = DARK; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(-8, -2); c.lineTo(8, -1); c.stroke();
      } else if (id === 'enterobacteriaceae') {
        /* 肠杆菌科：粉橙香肠身 + 顶部乱翘鞭毛撮 + 眯眼奸笑(倒八眉/小鼻钩/翘嘴角/下巴点) + 左侧排线阴影 */
        const BODY = '#F8B8A0', EDGE = '#7A2A20', DARK = '#5E1F16';
        c.translate(115, 114 + bobY);
        c.rotate(Math.sin(t * 1.3) * 0.03);
        /* 顶部乱翘鞭毛撮：4 根细线绞着向上乱翘，轻微飘动 */
        c.strokeStyle = DARK; c.lineWidth = 2.4; c.lineCap = 'round';
        [[-10, -74, -30, -98, -26, -118], [0, -76, -12, -100, -22, -114],
         [7, -76, 6, -102, 16, -116], [-3, -76, -24, -90, -40, -98]].forEach(([x0, y0, cx, cy, x1, y1], i) => {
          const sw = Math.sin(t * 2.6 + i * 1.9) * 2;
          c.beginPath();
          c.moveTo(x0, y0);
          c.quadraticCurveTo(cx + sw, cy, x1 + sw, y1);
          c.stroke();
        });
        /* 粉橙长胶囊身体 */
        const w = 42, h = 72;
        c.beginPath();
        c.moveTo(-w, -h + 12);
        c.arc(0, -h + 12, w, Math.PI, 0);
        c.lineTo(w, h - 12);
        c.arc(0, h - 12, w, 0, Math.PI);
        c.closePath();
        c.fillStyle = BODY; c.fill();
        c.lineWidth = 4; c.strokeStyle = EDGE; c.stroke();
        /* 左侧排线阴影：clip 到身体内画平行斜线 */
        c.save();
        c.clip();
        c.strokeStyle = 'rgba(122, 42, 32, 0.3)'; c.lineWidth = 1.6;
        for (let i = 0; i < 5; i++) {
          const off = -50 + i * 9;
          c.beginPath(); c.moveTo(off, 84); c.lineTo(off + 24, -86); c.stroke();
        }
        c.restore();
        /* 倒八斜眉（内低外高，奸相） */
        c.strokeStyle = DARK; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-8, -28); c.lineTo(-27, -35); c.stroke();
        c.beginPath(); c.moveTo(8, -28); c.lineTo(27, -35); c.stroke();
        /* 眯眼（下弯弧 ︶，外端上翘） */
        c.lineWidth = 3.4;
        c.beginPath(); c.arc(-16, -21, 9, Math.PI * 0.08, Math.PI * 0.92); c.stroke();
        c.beginPath(); c.arc(15, -21, 9, Math.PI * 0.08, Math.PI * 0.92); c.stroke();
        /* 眉间小鼻钩 */
        c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-2, -27); c.quadraticCurveTo(3, -18, -1, -11); c.stroke();
        /* 宽奸笑（右端上翘带小勾） */
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(-17, 3);
        c.quadraticCurveTo(0, 15, 19, 1);
        c.stroke();
        c.beginPath(); c.moveTo(19, 1); c.quadraticCurveTo(23, -1, 23, -6); c.stroke();
        /* 下巴小点 */
        c.fillStyle = DARK;
        c.beginPath(); c.arc(2, 27, 2.6, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    function spActor(cv, id) {
      const c = cv.getContext('2d');
      let raf = 0, run = false;
      function frame(now) {
        if (!run) return;
        if (!document.body.contains(cv)) { run = false; return; }
        c.clearRect(0, 0, cv.width, cv.height);
        drawSpCartoon(c, id, now / 1000);
        raf = requestAnimationFrame(frame);
      }
      return {
        start() { if (run) return; run = true; raf = requestAnimationFrame(frame); },
        stop() { run = false; cancelAnimationFrame(raf); },
      };
    }
    /* 有卡通形象的物种：先弹简版卡（形象 + 一句自我介绍 + 查看更多） */
    function openSpeciesQuick(idx) {
      const sp = S[idx];
      const sh = sim.n[idx] / Math.max(sim.total, 1e-9);
      const old = U.history.length > 4 ? U.history[Math.max(0, U.history.length - 5)] : null;
      const oldSh = old ? old.n[idx] / Math.max(old.n.reduce((a, b) => a + b, 0), 1e-9) : sh;
      const delta = sh - oldSh;
      const trend = delta > 0.004 ? `↑ 上升 ${(delta * 100).toFixed(1)}pp` : delta < -0.004 ? `↓ 下降 ${(-delta * 100).toFixed(1)}pp` : '→ 基本稳定';
      openModal(`
        <span class="mTag" style="color:${sp.color};border-color:${sp.color}66;background:${sp.color}12">${sp.name}</span>
        <div class="spToon">
          <canvas id="spToonCv" width="230" height="248"></canvas>
          <div class="spBubble">${SP_CARTOON[sp.id].line}</div>
        </div>
        <div class="mGrid">
          <div><span>当前相对丰度</span><b style="color:${sp.color}">${pct1(sh)}</b></div>
          <div><span>绝对量</span><b>${cfu(sim.n[idx])} CFU/g</b></div>
          <div><span>近 2 天趋势</span><b>${trend}</b></div>
          <div><span>最适 pH</span><b>${sp.phOpt.toFixed(1)}</b></div>
        </div>
        <div class="spToonFoot"><button class="btn btn-primary" id="spMore">查看更多</button></div>
      `);
      const cv = $('spToonCv');
      if (cv) { const inst = spActor(cv, sp.id); molAnims.push(inst); inst.start(); }
      const more = $('spMore');
      if (more) more.addEventListener('click', () => openSpeciesFull(idx));
    }
    function openSpecies(idx) {
      const sp = S[idx];
      if (SP_CARTOON[sp.id]) return openSpeciesQuick(idx);
      return openSpeciesFull(idx);
    }

    function openSpeciesFull(idx) {
      const sp = S[idx];
      const sh = sim.n[idx] / Math.max(sim.total, 1e-9);
      const old = U.history.length > 4 ? U.history[Math.max(0, U.history.length - 5)] : null;
      const oldSh = old ? old.n[idx] / Math.max(old.n.reduce((a, b) => a + b, 0), 1e-9) : sh;
      const delta = sh - oldSh;
      const trend = delta > 0.004 ? `↑ 上升 ${(delta * 100).toFixed(1)}pp` : delta < -0.004 ? `↓ 下降 ${(-delta * 100).toFixed(1)}pp` : '→ 基本稳定';
      openModal(`
        <span class="mTag" style="color:${sp.color};border-color:${sp.color}66;background:${sp.color}12">${sp.phylum}</span>
        <h3 class="mTitle">${sp.name}</h3>
        <p class="mSub">${sp.latin} · ${ROLE_TEXT[sp.role]}</p>
        <p class="mLead">${sp.sci.headline} —— ${sp.sci.role}</p>
        <div class="mGrid">
          <div><span>当前相对丰度</span><b style="color:${sp.color}">${pct1(sh)}</b></div>
          <div><span>绝对量</span><b>${cfu(sim.n[idx])} CFU/g</b></div>
          <div><span>近 2 天趋势</span><b>${trend}</b></div>
          <div><span>最适 pH</span><b>${sp.phOpt.toFixed(1)}</b></div>
        </div>
        ${foldBar(5)}
        ${foldDeck([
          { tag: '喜欢', t: '它靠什么长起来', body: polish(sp.sci.love) },
          { tag: '害怕', t: '什么会压住它', body: polish(sp.sci.fear) },
          { tag: '宿主', t: '与宿主的关系', body: polish(sp.sci.host) },
          { tag: '冷知识', t: '关于它的趣闻', body: polish(sp.sci.fact) },
          { tag: '行动', t: '怎么养 / 怎么防', body: polish(sp.sci.tip), open: true },
        ])}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openSpeciesFull = openSpeciesFull;
    U.openSpecies = openSpecies;

    function openTopic(t) {
      openModal(`
        <span class="mTag" style="color:${t.color};border-color:${t.color}66;background:${t.color}12">${t.tag}</span>
        <h3 class="mTitle">${t.title}</h3>
        ${foldBar(t.body.length)}
        ${foldDeck(t.body.map((p, i) => ({
          tag: '要点 ' + (i + 1),
          t: brief(p, 24),
          sub: brief(p, 40),
          body: polish(p),
          open: i === 0,
        })))}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }

    /* ---------- 肠-器官轴 ---------- */
    function openAxis(a) {
      if (!a) return;
      const rel = (a.rel || []).filter((id) => PFI[id]).map((id) => {
        const p = PFI[id];
        const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
        return `<button class="libCard" data-axrel="${id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>查看这条状态的资料卡</span></button>`;
      }).join('');
      openModal(`
        <span class="mTag" style="color:${a.color};border-color:${a.color}66;background:${a.color}12">${a.tag}</span>
        <h3 class="mTitle">${a.title}</h3>
        <p class="mSub">靶器官：${a.organ} · 诱因 → 菌群特征变化 → 小分子变化 → 器官影响 → 身体表现</p>
        <p class="mLead">${a.lead}</p>
        ${foldBar(8)}
        ${foldDeck([
          { tag: '① 诱因', t: '什么情况会扰动这条轴', sub: `${a.triggers.length} 个常见诱因`, body: `<ul class="repCause">${a.triggers.map((t) => `<li data-i="因">${t}</li>`).join('')}</ul>` },
          { tag: '② 菌群', t: '菌群的基本特征会怎么变', sub: brief(a.micro), body: polish(a.micro) },
          { tag: '③ 分子', t: '小分子分泌变化 · 作用于哪些器官', sub: molBrief(a.molecules), body: `<canvas class="molDiagram" data-molcanvas></canvas><div class="molWrap">${molRows(a.molecules)}</div>` },
          { tag: '④ 靶器官', t: `它是如何影响${a.organ}的`, sub: brief(a.effect), body: `<canvas class="chainDiagram" data-chaincanvas></canvas>${polish(a.effect)}` },
          { tag: '⑤ 表现', t: '人体会表现出什么不适', sub: `${a.symptoms.length} 种常见表现`, body: `<ul class="repCause">${a.symptoms.map((s) => `<li data-i="症">${s}</li>`).join('')}</ul>` },
          { tag: '⑥ 调整', t: '可以怎么调', sub: brief(a.advice), body: polish(a.advice) },
          { tag: '背景', t: '研究背景 / 冷知识', sub: brief(a.fact), body: polish(a.fact) },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(a.watch), body: polish(a.watch) },
        ])}
        ${rel ? `<h4 class="repH">相关的状态档案条目</h4><div class="libGrid">${rel}</div>` : ''}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const body = $('modalBody');
      body.querySelectorAll('[data-axrel]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.axrel))
      );
      mountMolDiagrams(body, a.molecules);
      mountChainDiagrams(
        body,
        ['肠道菌群变化'].concat(a.molecules.slice(0, 2).map((m) =>
          m.name.split(/[ （(]/)[0] + (MOL_DIR[m.dir] || MOL_DIR.flat).s)),
        '影响' + a.organ,
        hasFeedback(a.effect)
      );
    }
    U.openAxis = openAxis;

    /* ---------- 事件解释 ---------- */
    function openEvent(id) {
      const e = GUT.EVENTS.find((x) => x.id === id);
      const info = GUT.EVENT_INFO[id];
      if (!info) return;
      openModal(`
        <span class="mTag" style="color:${info.color};border-color:${info.color}66;background:${info.color}12">${info.tag}</span>
        <h3 class="mTitle">${e ? e.label : '用餐对生态的影响'}</h3>
        <p class="mSub">${e ? (e.dur ? `持续 ${e.dur} 天的干预` : '瞬时事件') + ' · 在左侧「临床干预事件」点击即可施加' : '把食物拆成营养维度后如何改变生态'}</p>
        ${e ? `<p class="mLead">${e.note}</p>` : ''}
        ${foldBar(4)}
        ${foldDeck([
          { tag: '机制', t: '它对生态做了什么', sub: brief(info.mech), body: polish(info.mech), open: true },
          { tag: '后果', t: '生态后果', sub: brief(info.effect), body: polish(info.effect) },
          { tag: '临床', t: '临床背景', sub: brief(info.clinic), body: polish(info.clinic) },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(info.watch), body: polish(info.watch) },
        ])}
        ${e ? `<button class="dBtn" id="evDo">立即施加这个事件</button>` : ''}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      if (e) $('evDo').addEventListener('click', () => {
        sim.fire(id);
        U.toast(e.note);
        closeModal();
      });
    }
    U.openEvent = openEvent;

    /* ---------- 指标解释 ---------- */
    const NOW = {
      diversity: () => (sim.diversity * 100).toFixed(0) + '%',
      butyrate: () => (clamp(sim.butyrate, 0, 1) * 100).toFixed(0) + '%',
      scfa: () => (clamp(sim.scfa, 0, 1) * 100).toFixed(0) + '%',
      mucus: () => (sim.mucus * 100).toFixed(0) + '%',
      barrier: () => (sim.barrier * 100).toFixed(0) + '%',
      resistance: () => (clamp(sim.resistance / 1.4, 0, 1) * 100).toFixed(0) + '%',
      h2s: () => (clamp(sim.h2s, 0, 1) * 100).toFixed(0) + '%',
      gas: () => (clamp(sim.gas, 0, 1) * 100).toFixed(0) + '%',
      inflammation: () => (sim.inflammation * 100).toFixed(0) + '%',
      ph: () => sim.pH.toFixed(2),
      transit: () => (72 - sim.env.motility * 0.58).toFixed(0) + ' h',
      total: () => cfu(sim.total) + ' CFU/g',
      enterotype: () => (sim.enterotype ? sim.enterotype.label : '—'),
    };
    function openMetric(key) {
      const m = GUT.METRIC_INFO[key];
      if (!m) return;
      const now = NOW[key] ? NOW[key]() : '—';
      openModal(`
        <span class="mTag" style="color:${m.color};border-color:${m.color}66;background:${m.color}12">生态指标</span>
        <h3 class="mTitle">${m.label}</h3>
        <p class="mSub">所有指标都是 0～100% 的相对刻度，用于展示趋势而非绝对值</p>
        <div class="mGrid">
          <div><span>当前值（实时）</span><b style="color:${m.color}">${now}</b></div>
          <div><span>参考区间</span><b>${m.range}</b></div>
        </div>
        ${foldBar(3)}
        ${foldDeck([
          { tag: '定义', t: '这个指标是什么', sub: brief(m.what), body: polish(m.what), open: true },
          { tag: '成因', t: '它为什么会变化', sub: brief(m.why), body: polish(m.why) },
          { tag: '行动', t: '怎么读 / 怎么改善', sub: brief(m.do), body: polish(m.do) },
        ])}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openMetric = openMetric;

    /* ---------- 施加后的「变化报告」 ---------- */
    const pp = (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + 'pp';

    function metricRows(a, b) {
      const rows = [
        { k: 'diversity', label: '物种多样性', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'butyrate', label: '丁酸水平', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'barrier', label: '肠屏障完整度', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'inflammation', label: '炎症水平', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
        { k: 'resistance', label: '定植抵抗', fmt: (v) => (clamp(v / 1.4, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'mucus', label: '黏液层厚度', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'scfa', label: 'SCFA 总量', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'gas', label: '产气 / 腹胀', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
        { k: 'h2s', label: '硫化氢 H₂S', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
      ];
      return rows.map((r) => {
        const d = clamp((b[r.k] - a[r.k]) * 100, -100, 100);
        const flat = Math.abs(d) < 1.5;
        const dir = flat ? '→' : d > 0 ? '↑' : '↓';
        const goodDir = r.good === 'down' ? d < 0 : d > 0;
        const tone = flat ? 'flat' : goodDir ? 'up' : 'down';
        return `<tr><td>${r.label}</td><td>${r.fmt(a[r.k])}</td><td>${r.fmt(b[r.k])}</td>
          <td class="repDelta ${tone}">${dir} ${flat ? '0' : Math.abs(d).toFixed(0)}pp</td></tr>`;
      }).join('');
    }

    function speciesRows(a, b) {
      return S.map((sp, i) => ({ i, d: (b.shares[i] - a.shares[i]) * 100 }))
        .filter((x) => Math.abs(x.d) > 0.25)
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
        .slice(0, 5)
        .map((x) => {
          const sp = S[x.i];
          return `<div class="repSp">
            <i style="background:${sp.color}"></i>
            <b>${sp.name}</b>
            <span>${(a.shares[x.i] * 100).toFixed(1)}% → ${(b.shares[x.i] * 100).toFixed(1)}%</span>
            <em class="repDelta ${x.d > 0 ? 'up' : 'down'}">${x.d > 0 ? '↑' : '↓'} ${Math.abs(x.d).toFixed(1)}pp</em>
          </div>`;
        })
        .join('');
    }

    /* 依据"实际变化方向"生成因果解释，而不是写死的文案 */
    function causes(a, b, id) {
      const D = (k) => (b[k] - a[k]) * 100;
      const sh = (k) => (b.shares[GUT.SPECIES_INDEX[k]] - a.shares[GUT.SPECIES_INDEX[k]]) * 100;
      const out = [];
      const dd = D('diversity'), dbut = D('butyrate'), dinf = D('inflammation'),
        dbar = D('barrier'), dres = D('resistance'), dmuc = D('mucus');

      if (dd < -3) {
        const why =
          id === 'abx' ? '抗生素按各物种的敏感度系数清除，严格厌氧菌率先消失，剩下的少数物种迅速垄断腾出的生态位'
            : id === 'highfat' ? '纤维骤减让纤维专家失去底物，群落从"多样的纤维发酵网络"退化为少数耐胆汁物种'
              : id === 'stress' ? '压力推高炎症与蠕动，敏感物种被冲刷、分布变得不均匀'
                : '扰动让群落分布变得不均匀：少数耐受者扩张，多数物种份额缩水';
        out.push(['↓', `多样性 ${pp(dd)}：${why}。`]);
      } else if (dd > 3) {
        out.push(['↑', `多样性 ${pp(dd)}：底物供给改善、清除压力解除，更多物种重新达到可维持的种群规模。`]);
      }

      if (dbut < -3) {
        out.push(['↓', `丁酸 ${pp(dbut)}：产丁酸菌（普拉梭菌、罗氏菌）减少，纤维发酵与"交叉喂养"链条中断，结肠上皮失去主要燃料。`]);
      } else if (dbut > 3) {
        out.push(['↑', `丁酸 ${pp(dbut)}：纤维底物充足，产丁酸菌恢复，乳酸/乙酸被交叉喂养转化为丁酸——它是主要的抗炎刹车。`]);
      }

      if (dbar < -3) {
        out.push(['↓', `肠屏障 ${pp(dbar)}：丁酸不足使上皮细胞能量匮乏，炎症又直接破坏紧密连接，于是屏障变"漏"。`]);
      } else if (dbar > 3) {
        out.push(['↑', `肠屏障 ${pp(dbar)}：黏液层增厚 + 丁酸回升，上皮细胞能量充足，紧密连接重新收紧。`]);
      }

      if (dinf > 3) {
        out.push(['↑', `炎症 ${pp(dinf)}：屏障受损让 LPS 等促炎物质更容易进入黏膜，炎症又进一步组织产氧、抑制厌氧菌——这是一个<b>正反馈</b>，丁酸是唯一的刹车。`]);
      } else if (dinf < -3) {
        out.push(['↓', `炎症 ${pp(dinf)}：丁酸回升抑制 NF-κB 通路、屏障修复，促炎信号随之回落。`]);
      }

      if (dres < -5) {
        out.push(['↓', `定植抵抗 ${pp(dres)}：有益菌减少留下空缺生态位，外来病原（芽孢）不再被竞争与代谢抑制压制。`]);
      } else if (dres > 5) {
        out.push(['↑', `定植抵抗 ${pp(dres)}：生态位被重新填满，占位竞争 + 细菌素 + 丁酸共同恢复了这道"生态免疫"。`]);
      }

      if (dmuc < -3) {
        out.push(['↓', `黏液层 ${pp(dmuc)}：纤维不足时部分菌转向啃食黏液糖链，加上炎症抑制杯状细胞分泌，黏液被"越吃越薄"。`]);
      } else if (dmuc > 3) {
        out.push(['↑', `黏液层 ${pp(dmuc)}：菌群重新以纤维为主食，不再消耗宿主黏液，杯状细胞分泌也随炎症下降而恢复。`]);
      }

      if (sh('cdiff') > 1) {
        out.push(['↑', `艰难拟梭菌 ${pp(sh('cdiff'))}：它并没有变强，而是<b>竞争者消失了</b>——芽孢在定植抵抗跌破阈值后萌发并释放毒素。`]);
      }
      if (sh('enterobacteriaceae') > 2) {
        out.push(['↑', `肠杆菌科 ${pp(sh('enterobacteriaceae'))}：兼性厌氧、耐氧耐胆汁，在炎症造成的组织产氧环境里反而占优。`]);
      }
      if (sh('akkermansia') > 2) {
        out.push(['↑', `阿克曼菌 ${pp(sh('akkermansia'))}：它主食黏液糖链，纤维不足时会扩张——既帮助维持屏障，也可能加速黏液消耗。`]);
      }
      if (sh('desulfovibrio') > 1.5) {
        out.push(['↑', `硫酸盐还原菌 ${pp(sh('desulfovibrio'))}：蛋白/脂肪与胆汁酸增加提供硫酸盐底物，产物 H₂S 会损伤上皮。`]);
      }
      if (sh('faecalibacterium') < -3 || sh('roseburia') < -2) {
        out.push(['↓', `产丁酸菌（普拉梭菌/罗氏菌）${pp(sh('faecalibacterium'))} / ${pp(sh('roseburia'))}：它们是最严格的厌氧菌，也最依赖纤维，因而最先倒下。`]);
      }

      if (!out.length) {
        out.push(['→', `生态基本维持原状（各项变化 &lt;3pp）。典型原因：定植抵抗仍在 ${(clamp(b.resistance / 1.4, 0, 1) * 100).toFixed(0)}%，外来菌无法立足；或扰动强度还不足以突破生态的缓冲能力。`]);
      }
      return out;
    }

    function verdict(a, b) {
      const D = (k) => (b[k] - a[k]) * 100;
      let worse = 0, better = 0;
      const chk = (d, wantUp) => {
        if (Math.abs(d) < 3) return;
        const good = wantUp ? d > 0 : d < 0;
        good ? better++ : worse++;
      };
      chk(D('diversity'), true); chk(D('butyrate'), true); chk(D('barrier'), true);
      chk(D('inflammation'), false); chk(D('resistance'), true);
      if (worse > better) return { t: '生态明显恶化', c: '#FF6B4A' };
      if (better > worse) return { t: '生态明显改善', c: '#34D399' };
      return { t: '生态基本维持原状', c: '#F5B944' };
    }

    function openChangeReport(rep) {
      const a = rep.before;
      const b = rep.after || sim.snapshot();
      const info = GUT.EVENT_INFO[rep.id] || {};
      const v = verdict(a, b);
      const span = (b.day - a.day);
      const cause = causes(a, b, rep.id)
        .map((c) => `<li data-i="${c[0]}">${c[1]}</li>`).join('');
      U.digesting = false;
      const better = (b.diversity - a.diversity) + (b.butyrate - a.butyrate) - (b.inflammation - a.inflammation) >= 0;
      openModal(`
        <div class="repTop">
          <canvas id="repPet" width="96" height="96"></canvas>
          <div class="repTopTxt">
            <span class="mTag" style="color:${v.c};border-color:${v.c}66;background:${v.c}12">变化报告</span>
            <h3 class="mTitle">${rep.label}</h3>
            <p class="mSub">施加于第 ${a.day.toFixed(1)} 天 · 观察了 ${span.toFixed(1)} 天 · 下方为<b>施加瞬间 → 当前</b>的实测变化</p>
            <p class="mLead"><b style="color:${v.c}">${v.t}</b>：多样性 ${pp((b.diversity - a.diversity) * 100)}、丁酸 ${pp((b.butyrate - a.butyrate) * 100)}、炎症 ${pp((b.inflammation - a.inflammation) * 100)}。</p>
          </div>
        </div>
        <h4 class="repH">指标变化量</h4>
        <table class="rep">
          <tr><th>指标</th><th>施前</th><th>现在</th><th>变化</th></tr>
          ${metricRows(a, b)}
          <tr><td>肠腔 pH</td><td>${a.ph.toFixed(2)}</td><td>${b.ph.toFixed(2)}</td>
            <td class="repDelta ${Math.abs(b.ph - a.ph) < 0.05 ? 'flat' : b.ph < a.ph ? 'up' : 'down'}">${Math.abs(b.ph - a.ph) < 0.05 ? '→' : b.ph < a.ph ? '↓' : '↑'} ${Math.abs(b.ph - a.ph).toFixed(2)}</td></tr>
          <tr><td>总菌量</td><td>${cfu(a.total)}</td><td>${cfu(b.total)}</td>
            <td class="repDelta ${b.total > a.total * 1.05 ? 'up' : b.total < a.total * 0.95 ? 'down' : 'flat'}">${(b.total / Math.max(a.total, 1e-9)).toFixed(2)}×</td></tr>
        </table>
        <h4 class="repH">菌群份额变化（最显著的 5 个）</h4>
        <div class="repSpWrap">${speciesRows(a, b) || '<p class="tiny">各物种份额变化都小于 0.25pp。</p>'}</div>
        <h4 class="repH">为什么会这样</h4>
        <ul class="repCause">${cause}</ul>
        ${info.mech ? foldBar(2) + foldDeck([
          { tag: '机制', t: '机制回顾', sub: brief(info.mech), body: polish(info.mech) },
          { tag: '观察', t: '接下来会怎样', sub: brief(info.watch || ''), body: polish(info.watch || '') },
        ]) : ''}
        <div class="repBtns">
          <button class="dBtn" id="repHistory">查看历史走势</button>
          <button class="dBtn" id="repMore">查看更专业的解释</button>
        </div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const more = $('repMore');
      if (more) more.addEventListener('click', () => openEvent(rep.id));
      const rh = $('repHistory');
      if (rh) rh.addEventListener('click', () => { closeModal(); showPane('history'); });
      const rp = $('repPet');
      if (rp) {
        const inst = petActor(rp, better ? 'happy' : 'worried');
        molAnims.push(inst);
        inst.start();
      }
    }
    U.openChangeReport = openChangeReport;
    U.isModalOpen = () => !modalRoot.hidden;

    /* ---------- 我的小人：2D 像素互动模式 ---------- */
    /* 独立画布放在弹窗里，不占用主界面的肠腔画面；自己的 rAF 锁 30fps，
       生命周期照 psyCompare 的方式交给 molAnims 统一托管 */
    const BUDDY_PAL = {
      line: '#182230', skin: '#FFD9B8', shade: '#E9B790', hair: '#4B3A52', hairHi: '#6E567A',
      cloth: '#4EC8C0', clothHi: '#83E3DD', pants: '#37506B', mouth: '#C4576B', blush: '#FF9FB0',
      white: '#FFFFFF', pupil: '#22303B', drop: '#7DD3FC',
    };
    const BUDDY_GW = 16, BUDDY_GH = 22;

    const BUDDY_MOOD = {
      good:  { label: '舒畅', color: '#34D399', note: '多样性、屏障与丁酸都在健康区间，它很放松。' },
      calm:  { label: '平稳', color: '#2DD4BF', note: '生态基本稳定，偶尔有点小波动。' },
      warn:  { label: '有点难受', color: '#F5B944', note: '已经轻度失调，通常把膳食纤维拉上去就能回升。' },
      bad:   { label: '很不舒服', color: '#FF8A5C', note: '炎症升高、屏障变薄，它撑得有点辛苦。' },
      bloat: { label: '胀得慌', color: '#A78BFA', note: '气体负荷过高，产气的那部分菌群占了上风。' },
    };
    const BUDDY_LINES = {
      good:  ['今天菌群在开派对，我整个人都轻盈', '丁酸供能充足，肠壁对我笑嘻嘻', '多样性在线，吃什么我都不慌'],
      calm:  ['一切如常，稳稳的', '生态还算太平，我慢慢消化着', '没什么波澜，这样也挺好'],
      warn:  ['肚子里有点闹腾……', '屏障有点薄，别再刺激我了', '蠕动不太对劲，我想坐一会儿'],
      bad:   ['炎症上来了，我快撑不住', '有害的那拨占了上风', '给我点可溶性纤维吧，求你了'],
      bloat: ['好多气……腰带要松一格', '碳酸和产气菌合伙折腾我', '肚子鼓得像个小气球'],
    };
    const BUDDY_EAT = {
      good: ['好吃！这波我很满意', '唔～这顿吃得很舒服', '纤维到位，舒服'],
      mid:  ['吃下去了，看看反应', '记下了，等着瞧吧', '嗯……马马虎虎'],
      bad:  ['唔！这个不太妙……', '你在喂我什么呀', '肚子要闹腾起来了'],
    };

    /* 按 16×22 的网格用色块拼一个小人；每个色块就是一枚"像素" */
    function buildBuddySprite(unit, mood, blink) {
      const cv = document.createElement('canvas');
      cv.width = BUDDY_GW * unit;
      cv.height = BUDDY_GH * unit;
      const c = cv.getContext('2d');
      const P = BUDDY_PAL;
      const box = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * unit, y * unit, w * unit, h * unit); };

      /* 腿脚 */
      box(5, 17, 2, 3, P.pants); box(9, 17, 2, 3, P.pants);
      box(4, 20, 3, 1, P.line);  box(9, 20, 3, 1, P.line);
      /* 身体 */
      box(4, 11, 8, 6, P.cloth);
      box(4, 11, 8, 1, P.clothHi);
      box(4, 16, 8, 1, P.line);
      /* 手臂：难受时抱住肚子 */
      if (mood === 'bad') {
        box(3, 13, 2, 3, P.skin); box(11, 13, 2, 3, P.skin);
        box(5, 14, 6, 2, P.shade);
      } else {
        box(2, 12, 2, 4, P.skin); box(12, 12, 2, 4, P.skin);
        box(2, 16, 2, 1, P.line); box(12, 16, 2, 1, P.line);
      }
      /* 头 */
      box(3, 2, 10, 9, P.skin);
      box(12, 3, 1, 8, P.shade);
      box(3, 2, 10, 1, P.line); box(3, 10, 10, 1, P.line);
      box(2, 3, 1, 5, P.line);  box(13, 3, 1, 5, P.line);
      box(3, 3, 1, 1, P.line);  box(12, 3, 1, 1, P.line);
      /* 头发 */
      box(3, 2, 10, 3, P.hair);
      box(4, 2, 8, 1, P.hairHi);
      box(3, 5, 1, 2, P.hair);  box(12, 5, 1, 2, P.hair);
      /* 耳朵 */
      box(2, 6, 1, 2, P.shade); box(13, 6, 1, 2, P.shade);
      /* 眼睛 */
      if (blink) {
        box(5, 7, 2, 1, P.pupil); box(9, 7, 2, 1, P.pupil);
      } else {
        box(5, 6, 2, 2, P.pupil); box(9, 6, 2, 2, P.pupil);
        box(6, 6, 1, 1, P.white); box(10, 6, 1, 1, P.white);
      }
      /* 腮红 */
      if (mood === 'good' || mood === 'calm' || mood === 'bloat') {
        box(4, 9, 2, 1, P.blush); box(10, 9, 2, 1, P.blush);
      }
      /* 嘴 */
      if (mood === 'good') { box(6, 8, 1, 1, P.mouth); box(9, 8, 1, 1, P.mouth); box(7, 9, 2, 1, P.mouth); }
      else if (mood === 'warn') { box(7, 9, 2, 1, P.mouth); box(6, 8, 1, 1, P.line); box(9, 8, 1, 1, P.line); }
      else if (mood === 'bad') { box(6, 9, 4, 1, P.mouth); box(5, 5, 2, 1, P.line); box(9, 5, 2, 1, P.line); }
      else if (mood === 'bloat') { box(6, 8, 4, 1, P.mouth); box(7, 9, 2, 1, P.mouth); box(7, 8, 2, 1, P.white); }
      else { box(7, 9, 2, 1, P.mouth); }
      return cv;
    }

    /* 情绪由模拟器实时指标决定 */
    function buddyMood() {
      const h = GUT.healthOf(sim);
      if (sim.gas > 0.62) return 'bloat';
      if (sim.inflammation > 0.45 || (sim.diversity < 0.55 && h < 0.45)) return 'bad';
      if (h >= 0.78) return 'good';
      if (h >= 0.60) return 'calm';
      return 'warn';
    }

    /* 找出当前拖后腿最厉害的那项指标，用于给小人配一句有信息量的解读 */
    function buddyDriver() {
      const items = [
        { k: '气体负荷', v: clamp(sim.gas, 0, 1), bad: true, tip: '气体偏高：产气菌在发酵过剩的底物。' },
        { k: '炎症水平', v: clamp(sim.inflammation, 0, 1), bad: true, tip: '炎症偏高：屏障正在被持续消耗。' },
        { k: '菌群多样性', v: clamp(sim.diversity, 0, 1), bad: false, tip: '多样性偏低：菌群结构变得单一。' },
        { k: '丁酸产量', v: clamp(sim.butyrate, 0, 1), bad: false, tip: '丁酸不足：结肠上皮的能量来源吃紧。' },
        { k: '屏障完整度', v: clamp(sim.barrier, 0, 1), bad: false, tip: '屏障变薄：通透性升高。' },
      ];
      const sc = (it) => (it.bad ? it.v : 1 - it.v);
      items.sort((a, b) => sc(b) - sc(a));
      return items[0];
    }

    function buddyPixel(cv, opts) {
      const ctx = cv.getContext('2d');
      const O = opts || {};
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      let W = 660, H = 330, DPR = 1, unit = 9, floorY = 300;
      let t = 0, last = 0, lastDraw = 0, raf = 0, running = false, ro = null;
      let sprites = {}, micro = [], fx = [];
      let line = BUDDY_LINES.calm[0], lineT = 0;
      let jumpT = 0, overlay = null, overlayT = 0, lastMood = '', accSp = 0, accSt = 0;

      function say(text, hold) {
        line = text;
        lineT = hold || 3.2;
      }

      function buildSprites() {
        sprites = {};
        const u = Math.max(1, Math.round(unit * DPR));
        Object.keys(BUDDY_MOOD).forEach((m) => {
          sprites[m + '0'] = buildBuddySprite(u, m, false);
          sprites[m + '1'] = buildBuddySprite(u, m, true);
        });
      }

      /* 漂浮的菌群伙伴：颜色直接取真实菌种的配色，数量分布跟随实际占比 */
      function initMicro() {
        micro = [];
        for (let i = 0; i < 26; i++) {
          micro.push({
            x: Math.random() * W, y: 26 + Math.random() * (floorY - 40),
            vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 9,
            sp: i % GUT.SPECIES.length,
          });
        }
        reassignMicro();
      }

      function reassignMicro() {
        const sh = sim.shares();
        micro.forEach((p) => {
          let r = Math.random(), c = 0, idx = sh.length - 1;
          for (let i = 0; i < sh.length; i++) { c += sh[i]; if (r <= c) { idx = i; break; } }
          p.sp = idx;
        });
      }

      function emit(kind, n) {
        for (let i = 0; i < n; i++) {
          fx.push({
            k: kind, x: W / 2 + (Math.random() - 0.5) * 70,
            y: floorY - BUDDY_GH * unit * (0.5 + Math.random() * 0.5),
            vy: -20 - Math.random() * 16, life: 1, ph: Math.random() * 6.28,
          });
        }
      }

      function hitBuddy(x, y) {
        const bw = BUDDY_GW * unit, bh = BUDDY_GH * unit;
        const bx = W / 2 - bw / 2, by = floorY - bh + 6;
        return x >= bx - 8 && x <= bx + bw + 8 && y >= by - 8 && y <= by + bh + 8;
      }

      function rrect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      }

      function drawBubble(text, ax, top) {
        ctx.font = '12px -apple-system, PingFang SC, "Helvetica Neue", sans-serif';
        ctx.textBaseline = 'top';
        const maxW = Math.min(320, W - 36);
        const lines = [];
        let cur = '';
        for (const ch of String(text)) {
          if (ctx.measureText(cur + ch).width > maxW - 24) { lines.push(cur); cur = ch; }
          else cur += ch;
        }
        if (cur) lines.push(cur);
        const lh = 17, padX = 12, padY = 8;
        let bw = 0;
        lines.forEach((l) => { bw = Math.max(bw, ctx.measureText(l).width); });
        bw += padX * 2;
        const bh = lines.length * lh + padY * 2;
        const x = clamp(ax - bw / 2, 8, Math.max(8, W - bw - 8));
        const y = Math.max(6, top - bh);
        ctx.fillStyle = 'rgba(8,20,26,0.94)';
        ctx.strokeStyle = 'rgba(45,212,191,0.45)';
        ctx.lineWidth = 1;
        rrect(x, y, bw, bh, 10);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - 6, y + bh - 1); ctx.lineTo(ax + 6, y + bh - 1); ctx.lineTo(ax, y + bh + 8);
        ctx.closePath(); ctx.fillStyle = 'rgba(8,20,26,0.94)'; ctx.fill();
        ctx.fillStyle = '#dffbf4';
        lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + i * lh));
      }

      function drawMicro() {
        ctx.globalAlpha = 0.9;
        micro.forEach((p) => {
          const sp = GUT.SPECIES[p.sp];
          ctx.fillStyle = sp ? sp.color : '#7DD3FC';
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
        });
        ctx.globalAlpha = 1;
      }

      function drawFx(dt) {
        const next = [];
        fx.forEach((p) => {
          p.life -= dt * 0.5;
          p.y += p.vy * dt;
          p.x += Math.sin(t * 3 + p.ph) * 8 * dt;
          if (p.life <= 0) return;
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
          if (p.k === 'heart') { ctx.fillStyle = '#FF8FB0'; ctx.font = 'bold 15px -apple-system, sans-serif'; ctx.fillText('♥', p.x, p.y); }
          else if (p.k === 'zzz') { ctx.fillStyle = '#9FC7E8'; ctx.font = 'bold 14px -apple-system, sans-serif'; ctx.fillText('z', p.x, p.y); }
          else { ctx.fillStyle = '#F5B944'; ctx.font = 'bold 14px -apple-system, sans-serif'; ctx.fillText('♪', p.x, p.y); }
          next.push(p);
        });
        ctx.globalAlpha = 1;
        fx = next;
      }

      /* 各情绪的专属小装饰 */
      function drawExtra(mood, dx, dy, dw, dh) {
        if (mood === 'bad') {
          const j = Math.sin(t * 5) * 2;
          ctx.fillStyle = BUDDY_PAL.drop;
          ctx.fillRect(dx + dw - 6, dy + 30 + j, 3, 5);
          ctx.fillRect(dx + dw - 14, dy + 26 - j, 2, 4);
        } else if (mood === 'bloat') {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = '#C7D2E0';
          for (let i = 0; i < 3; i++) {
            const ph = t * 2.2 + i * 2.1;
            ctx.beginPath();
            ctx.arc(dx + dw / 2 + Math.cos(ph) * 26, dy + dh * 0.62 + Math.sin(ph) * 10, 7 + i * 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      function update(dt) {
        t += dt;
        if (jumpT > 0) jumpT -= dt;
        if (overlayT > 0) { overlayT -= dt; if (overlayT <= 0) overlay = null; }
        if (lineT > 0) { lineT -= dt; if (lineT <= 0) say(pick(BUDDY_LINES[buddyMood()]), 3.6); }
        const m = buddyMood();
        if (m !== lastMood) {
          lastMood = m;
          if (lineT <= 0) say(pick(BUDDY_LINES[m]), 3.6);
        }
        micro.forEach((p) => {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 2) p.x = 2; if (p.x > W - 5) p.x = W - 5;
          if (p.y < 22) p.y = 22; if (p.y > floorY - 4) p.y = floorY - 4;
        });
        accSp -= dt;
        if (accSp <= 0) { accSp = 0.7; reassignMicro(); }
        accSt -= dt;
        if (accSt <= 0) {
          accSt = 0.4;
          if (O.onStatus) {
            const meta = BUDDY_MOOD[m];
            O.onStatus({ mood: m, label: meta.label, color: meta.color, note: meta.note, driver: buddyDriver(), health: GUT.healthOf(sim), overlay: overlay });
          }
        }
      }

      function draw(dt) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#071219'); g.addColorStop(1, '#0B1A22');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(45,212,191,0.08)'; ctx.fillRect(0, floorY, W, H - floorY);
        ctx.fillStyle = 'rgba(45,212,191,0.32)'; ctx.fillRect(0, floorY, W, 1);

        const mood = overlay === 'pet' ? 'good' : overlay === 'sleep' ? 'calm' : buddyMood();
        const blink = overlay === 'sleep' || overlay === 'pet' || Math.sin(t * 1.7) > 0.94;
        const hop = jumpT > 0 ? Math.abs(Math.sin((1 - jumpT / 0.45) * Math.PI)) * 30 : 0;
        const bob = Math.sin(t * 2.2) * 2.5;
        const jitter = mood === 'bad' ? Math.sin(t * 24) * 1.4 : 0;
        const puff = mood === 'bloat' ? 1 + Math.sin(t * 3.2) * 0.035 : 1;
        const bw = BUDDY_GW * unit, bh = BUDDY_GH * unit;
        const dw = Math.round(bw * puff), dh = Math.round(bh * puff);
        const dx = Math.round(W / 2 - dw / 2 + jitter);
        const dy = Math.round(floorY - dh + 6 + bob - hop);

        ctx.globalAlpha = 0.3 + (hop > 0 ? -0.12 : 0);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(W / 2 + jitter, floorY + 4, bw * 0.34, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        drawMicro();
        const sp = sprites[mood + (blink ? '1' : '0')];
        if (sp) ctx.drawImage(sp, dx, dy, dw, dh);
        drawExtra(mood, dx, dy, dw, dh);
        drawFx(dt);
        drawBubble(line, W / 2, dy - 12);
      }

      function resize() {
        W = Math.max(320, Math.floor(cv.clientWidth || 660));
        const need = Math.min(2, window.devicePixelRatio || 1);
        DPR = W * H > 520000 ? Math.min(1.25, need) : need;
        unit = W < 420 ? 7 : 9;
        cv.width = Math.round(W * DPR);
        cv.height = Math.round(H * DPR);
        cv.style.height = H + 'px';
        buildSprites();
        if (!micro.length) initMicro();
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        /* 节点被移出文档就自我了断，避免残留循环 */
        if (!document.body.contains(cv)) { running = false; return; }
        update(dt);
        if (now - lastDraw >= 33.4) { lastDraw = now; draw(dt); }
        raf = requestAnimationFrame(frame);
      }

      cv.addEventListener('click', (e) => {
        const r = cv.getBoundingClientRect();
        if (!hitBuddy(e.clientX - r.left, e.clientY - r.top)) return;
        jumpT = 0.45;
        say(pick(BUDDY_LINES[buddyMood()]), 3.4);
        emit('heart', 2);
      });
      cv.addEventListener('mousemove', (e) => {
        const r = cv.getBoundingClientRect();
        cv.style.cursor = hitBuddy(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : 'default';
      });

      return {
        start() {
          if (running) return;
          running = true;
          last = performance.now();
          lastDraw = 0;
          resize();
          if (window.ResizeObserver) {
            ro = new ResizeObserver(() => {
              const w = Math.floor(cv.clientWidth || 0);
              if (Math.abs(w - W) > 2) resize();
            });
            ro.observe(cv);
          }
          emit('heart', 1);
          raf = requestAnimationFrame(frame);
        },
        stop() {
          running = false;
          cancelAnimationFrame(raf);
          if (ro) { ro.disconnect(); ro = null; }
        },
        pet() { overlay = 'pet'; overlayT = 2.6; jumpT = 0.3; emit('heart', 4); say('呼噜噜……被摸头好开心', 2.8); },
        nap() { overlay = 'sleep'; overlayT = 3.4; emit('zzz', 3); say('Zzz……让我打个盹恢复一下', 3.2); },
        react(score, label) {
          overlay = 'eat';
          overlayT = 2.4;
          emit('note', 3);
          const pool = score >= 60 ? BUDDY_EAT.good : score >= 45 ? BUDDY_EAT.mid : BUDDY_EAT.bad;
          say(pick(pool) + '（' + label + ' · ' + Math.round(score) + ' 分）', 3.4);
        },
      };
    }

    function openBuddy() {
      openModal(`
        <div class="buddyHead">
          <h2>我的小人</h2>
          <p class="tiny">它的表情每 0.4 秒读一次模拟器状态，由<b>多样性、屏障、丁酸、炎症、气体</b>共同决定；
            身边漂浮的小方块就是你的菌群，颜色取自真实菌种配色。<b>主界面的肠腔画布保持不变。</b></p>
        </div>
        <canvas id="buddyCv" class="buddyCv"></canvas>
        <div class="buddyStat" id="buddyStat"></div>
        <div class="buddyFeed">
          <input id="buddyInput" type="text" autocomplete="off" placeholder="喂它吃点东西：燕麦 蓝莓 酸奶（也认 养乐多 / 爆辣火锅 / 冰汽水）" />
          <button class="btn btn-primary" id="buddyFeedBtn">喂一口</button>
          <button class="btn" id="buddyPetBtn">摸摸头</button>
          <button class="btn btn-ghost" id="buddyNapBtn">打个盹</button>
        </div>
        <p class="mFoot">喂食走的是和左栏<b>完全相同</b>的解析与 <b>sim.meal()</b> 流程，会真正落到生态里、写进时间轴，
          所以喂完它的脸色会跟着变。点一下小人本身也会有反应。</p>
      `);
      const cv = $('buddyCv');
      const bar = $('buddyStat');
      if (!cv) return;
      const inst = buddyPixel(cv, {
        onStatus(st) {
          if (!bar) return;
          bar.innerHTML =
            `<div class="bsRow"><b style="color:${st.color}">现在的心情 · ${st.label}</b>
              <span>健康度 ${(st.health * 100).toFixed(0)} · ${st.note}</span></div>
             <div class="bsRow"><b style="color:#7DD3FC">主要瓶颈 · ${st.driver.k}</b>
              <span>${st.driver.tip}（当前 ${(st.driver.v * 100).toFixed(0)}%）</span></div>`;
        },
      });
      molAnims.push(inst);
      inst.start();

      const inp = $('buddyInput');
      function doFeed() {
        const text = (inp.value || '').trim();
        if (!text) { U.toast('先写点什么，例如：燕麦 蓝莓 酸奶'); return; }
        const m = parseMeal(text);
        if (!m.items.length) { U.toast('没识别出食物，换个常见说法试试：燕麦 / 酸奶 / 炸鸡'); return; }
        sim.meal(m);
        inp.value = '';
        renderMeals();
        inst.react(m.score, m.label);
        U.toast('已喂给小人：' + m.label);
      }
      const fb = $('buddyFeedBtn');
      if (fb) fb.addEventListener('click', doFeed);
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doFeed(); });
      const pb = $('buddyPetBtn'); if (pb) pb.addEventListener('click', () => inst.pet());
      const nb = $('buddyNapBtn'); if (nb) nb.addEventListener('click', () => inst.nap());
    }
    U.openBuddy = openBuddy;
 
    /* ---------- 虚拟形象：简约像素小动物 ---------- */
    const PETS = [
      { id: 'cat', name: '猫', body: '#F5B944', dark: '#C98F2B', belly: '#FFE3AD' },
      { id: 'dog', name: '狗', body: '#C9976B', dark: '#96693F', belly: '#E8C9A8' },
      { id: 'rabbit', name: '兔', body: '#E8E4F5', dark: '#A9A2CC', belly: '#FFFFFF' },
      { id: 'duck', name: '鸭', body: '#F8E16C', dark: '#C7A62E', belly: '#FDF3C0' },
      { id: 'pigeon', name: '鸽', body: '#AEB9C2', dark: '#5C6470', belly: '#C6CFD6' },
    ];
    function petId() {
      try { return localStorage.getItem('gut_pet') || 'cat'; } catch (e) { return 'cat'; }
    }
    function setPetId(id) { try { localStorage.setItem('gut_pet', id); } catch (e) {} }

    /* 12×11 网格的程序化像素小动物；mood: idle / happy / worried */
    function drawPet(c, id, u, t, mood) {
      const pet = PETS.find((x) => x.id === id) || PETS[0];
      const box = (x, y, w, h, col) => {
        c.fillStyle = col;
        c.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(w * u), Math.ceil(h * u));
      };
      const bob = Math.sin(t * 2.6) > 0 ? 0 : 1;
      const B = pet.body, D = pet.dark, E = '#2B2B33';
      const oy = bob;
      /* 鸽子：形态与四脚兽差异大，独立绘制（参考配色：灰蓝身、棕褐头颈、暗红细脚） */
      if (id === 'pigeon') {
        const HB = '#5C4B50', WG = '#5C6470', TL = '#4A505A', FT = '#8A2F3C', BK = '#C9C0B4';
        const BL = '#C6CFD6';
        /* ① 要鼠了：身体横躺、脚朝天蹬、眼睛变成 × */
        if (mood === 'flat') {
          box(3, oy + 3, 8, 4, B);                        /* 横躺的身体 */
          box(4, oy + 2, 6, 1, B);
          box(4, oy + 5, 6, 2, BL);                       /* 肚皮朝上 */
          box(5, oy + 3, 4, 2, WG);                       /* 翅膀搭在身上 */
          box(11, oy + 3, 1, 3, TL);                      /* 尾羽在右侧 */
          box(0, oy + 3, 3, 2, HB);                       /* 头搁在地上 */
          box(0, oy + 5, 2, 1, BK);                       /* 喙向下垂 */
          box(1, oy + 3, 1, 1, '#E8E4DA'); box(2, oy + 4, 1, 1, '#E8E4DA'); box(1, oy + 5, 1, 1, '#E8E4DA'); /* × 眼 */
          box(4, oy + 1, 1, 2, FT); box(7, oy + 1, 1, 2, FT); /* 两只脚朝天 */
          return;
        }
        /* ② 胀得慌：身体鼓成一颗球，头被挤小、腿被压短 */
        if (mood === 'worried') {
          box(3, oy + 1, 7, 1, B);
          box(2, oy + 2, 9, 6, B);
          box(2, oy + 8, 9, 1, B);
          box(4, oy + 5, 6, 3, BL);
          box(3, oy + 4, 5, 3, WG);
          box(0, oy + 5, 3, 2, TL); box(0, oy + 7, 2, 1, TL);
          box(8, oy, 3, 2, HB);                           /* 被挤小的头 */
          box(7, oy + 2, 3, 1, HB);
          box(11, oy + 1, 1, 1, BK);
          box(8, oy + 1, 2, 1, E);                        /* 半闭眼 */
          box(11, oy + 3, 1, 2, '#7DD3FC');               /* 冒汗滴 */
          box(5, oy + 9, 1, 1, FT); box(8, oy + 9, 1, 1, FT);
          return;
        }
        /* ③ 站姿：happy 抬头挺胸+翅膀上抬，idle 为常态 */
        const up = mood === 'happy' ? 1 : 0;
        const O = oy + 1;                                 /* 整体下移，给抬头留出空间 */
        box(4, O + 1, 6, 1, B);                           /* 背上缘 */
        box(3, O + 2, 8, 3, B);                           /* 上身 */
        box(3, O + 5, 9, 3, B);                           /* 下腹略宽 */
        box(4, O + 8, 7, 1, B);                           /* 圆底 */
        box(5, O + 6, 4, 3, BL);                          /* 浅色胸腹 */
        box(3, O + 3 - up, 5, 3, WG);                     /* 翅膀 */
        box(0, O + 3, 3, 2, TL); box(0, O + 5, 2, 1, TL); /* 尾羽 */
        box(7, O - up, 4, 2, HB);                         /* 头 */
        box(6, O + 2, 3, 2, HB);                          /* 颈 */
        box(11, O - up, 1, 1, BK);                    /* 尖嘴，与眼同高 */
        if (up) box(9, O - 1, 2, 1, E);                   /* 眯眼笑 */
        else box(9, O, 1, 2, E);                              /* 圆点眼 */
        box(5, O + 9, 1, 1, FT); box(7, O + 9, 1, 1, FT); /* 暗红细脚 */
        return;
      }
      if (id === 'cat') {
        box(2, oy, 2, 2, B); box(8, oy, 2, 2, B);
        box(2, oy, 1, 1, D); box(9, oy, 1, 1, D);
      } else if (id === 'dog') {
        box(1, oy + 2, 2, 3, D); box(9, oy + 2, 2, 3, D);
      } else if (id === 'rabbit') {
        box(3, oy - 1, 2, 3, B); box(7, oy - 1, 2, 3, B);
        box(3, oy - 1, 1, 2, '#F5C9D4'); box(8, oy - 1, 1, 2, '#F5C9D4');
      }
      box(3, oy + 1, 6, 1, B);
      box(2, oy + 2, 8, 6, B);
      box(3, oy + 8, 6, 1, B);
      box(4, oy + 5, 4, 3, pet.belly);
      if (mood === 'happy') {
        box(4, oy + 2, 1, 1, E); box(7, oy + 2, 1, 1, E);
        box(4, oy + 3, 1, 1, E); box(7, oy + 3, 1, 1, E);
      } else {
        box(4, oy + 3, 1, 2, E); box(7, oy + 3, 1, 2, E);
      }
      if (mood === 'worried' || mood === 'flat') {
        box(5, oy + 6, 2, 1, E);
        box(10, oy + 2, 1, 2, '#7DD3FC');
        if (mood === 'flat') {
          box(4, oy + 3, 1, 1, E); box(5, oy + 4, 1, 1, E);
          box(7, oy + 3, 1, 1, E); box(8, oy + 4, 1, 1, E);
        }
      } else if (mood === 'happy') {
        box(5, oy + 5, 2, 1, E);
        box(4, oy + 4, 1, 1, '#F5A0B4'); box(7, oy + 4, 1, 1, '#F5A0B4');
      } else {
        box(5, oy + 5, 2, 1, D);
      }
      if (id === 'duck') box(4, oy + 5, 4, 1, '#E8862B');
      box(3, oy + 9, 2, 1, D); box(7, oy + 9, 2, 1, D);
      if (id === 'cat' || id === 'dog') box(10, oy + 5, 1, 2, D);
      if (id === 'rabbit') box(0, oy + 5, 1, 2, '#FFFFFF');
    }

    /* 弹窗里的宠物小动画（跟随 molAnims 生命周期） */
    function petActor(cv, mood) {
      const c = cv.getContext('2d');
      let raf = 0, run = false;
      function frame(now) {
        if (!run) return;
        if (!document.body.contains(cv)) { run = false; return; }
        c.clearRect(0, 0, cv.width, cv.height);
        drawPet(c, petId(), 7, now / 1000, mood || 'idle');
        raf = requestAnimationFrame(frame);
      }
      return {
        start() { if (run) return; run = true; raf = requestAnimationFrame(frame); },
        stop() { run = false; cancelAnimationFrame(raf); },
      };
    }

    /* 画布右下角常驻形象：由 U.update 驱动，表情随生态状态 */
    /* 阈值按实测动态范围设定：不干预时基线稳定在 health≈0.67 / gas≈0.71，
       改善饮食可升到 0.72+ 转 happy，劣食或抗生素拉低健康度、推高炎症则转 worried */
    /* 四种心情：舒畅 / 平稳 / 胀得慌（圆滚滚）/ 要鼠了（躺平）
       阈值按实测动态范围标定：健康度只在 0.44 ~ 0.73 之间浮动 */
    const PET_MOOD = {
      happy:   { color: '#34D399' },
      idle:    { color: '#7DD3FC' },
      worried: { color: '#F5B944' },
      flat:    { color: '#FF6B4A' },
    };
    const PET_LINES = {
      happy:   ['今天菌群在开派对~哄', '纤维到位，舒服！', '哄~状态好得很', '今天什么都不怕'],
      idle:    ['一切如常，稳稳的', '没什么波澜，挺好', '慢慢消化着呢', '哄~'],
      worried: ['好多气……肚子胀圆了', '唔…要圆成一颗球了', '腰带得松一格了哄', '好像吃太多了…'],
      flat:    ['哄…我好像要不行了', '救…救我的肠道…', '躺平了，别打扰我哄', '菌群快撑不住了'],
    };
    function petMood() {
      const h = GUT.healthOf(sim);
      if (sim.inflammation > 0.38 || h < 0.52) return 'flat';
      if (sim.inflammation > 0.28 || h < 0.65 || sim.gas > 0.85) return 'worried';
      if (h > 0.71 && sim.gas < 0.62) return 'happy';
      return 'idle';
    }
    let petTickLast = 0, petLineLast = 0, petLastMood = '';
    function drawPetTick() {
      const cv = $('petBadge');
      if (!cv) return;
      const now = performance.now();
      if (now - petTickLast < 90) return;
      petTickLast = now;
      const mood = petMood();
      cv.dataset.mood = mood;
      /* 状态变了、或每隔 5 秒，换一句词 */
      if (mood !== petLastMood || now - petLineLast > 5000) {
        petLastMood = mood;
        petLineLast = now;
        const pool = PET_LINES[mood] || PET_LINES.idle;
        const txt = pool[Math.floor(Math.random() * pool.length)];
        const lab = $('petLabel');
        if (lab) {
          lab.textContent = txt;
          lab.style.color = PET_MOOD[mood].color;
          lab.style.borderColor = PET_MOOD[mood].color;
          lab.dataset.mood = mood;
          lab.style.animation = 'none';
          void lab.offsetWidth; /* 强制重排，让气泡重播一次弹出动画 */
          lab.style.animation = '';
        }
      }
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      drawPet(c, petId(), 6, now / 1000, mood);
    }
    function initPet() {
      /* 虚拟形象只做状态展示（表情 + 心情台词），不再绑定「点它写日记」这类点击行为 */
      const cv = $('petBadge');
      if (!cv) return;
      cv.removeAttribute('title');
      cv.style.cursor = 'default';
    }

    /* ---------- 左侧导航 ---------- */
    const PANE_IDS = ['events', 'env', 'history'];
    function showPane(id) {
      const panel = $('sidePanel');
      document.querySelectorAll('.railBtn').forEach((b2) => b2.classList.toggle('on', b2.dataset.pane === id));
      PANE_IDS.forEach((pn) => { const el = $('pane-' + pn); if (el) el.hidden = pn !== id; });
      if (panel) panel.hidden = false;
      const app = document.getElementById('app');
      if (app) app.classList.remove('sideCollapsed');
    }
    U.showPane = showPane;
    function buildSideNav() {
      document.querySelectorAll('.railBtn').forEach((b2) => {
        b2.addEventListener('click', () => {
          const pn = b2.dataset.pane;
          /* 日记入口：交给迁移进来的日记模块（投喂 / 记录分析 二选一） */
          if (pn === 'diary') return window.DiaryHub && window.DiaryHub.open();
          if (pn === 'lib') return openLibrary();
          if (pn === 'help') return openHelp();
          const panel = $('sidePanel');
          if (panel && !panel.hidden && b2.classList.contains('on')) {
            panel.hidden = true;
            b2.classList.remove('on');
            return;
          }
          showPane(pn);
        });
      });
      const tg = $('sideToggle');
      if (tg) tg.addEventListener('click', () => {
        const app = document.getElementById('app');
        if (app) app.classList.toggle('sideCollapsed');
      });
    }

    /* ---------- 日记：虚拟形象 + 一句话记录 ---------- */
    /* ---------- 右栏：指标 + 菌占比 走势图 ---------- */
    let trendCtx = null, trendLast = 0;
    const TREND_LINES = [
      { k: 'div', c: '#2DD4BF', label: '多样性' },
      { k: 'but', c: '#F5B944', label: '丁酸' },
      { k: 'bar', c: '#7DD3FC', label: '屏障' },
      { k: 'infl', c: '#FF6B4A', label: '炎症' },
    ];
    function initTrend() {
      const cv = $('trendCv');
      trendCtx = cv ? cv.getContext('2d') : null;
    }
    function drawTrendTick() {
      const cv = $('trendCv');
      if (!cv || !trendCtx) return;
      const now = performance.now();
      if (now - trendLast < 1000) return;
      trendLast = now;
      const W = Math.max(180, cv.clientWidth || 260), H = 190;
      const DPR = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(W * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
      cv.style.height = H + 'px';
      const c = trendCtx;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,0.02)';
      c.fillRect(0, 0, W, H);
      const hist = U.history;
      c.font = '9px -apple-system, PingFang SC, sans-serif';
      if (hist.length < 2) {
        c.fillStyle = '#5F7D84';
        c.fillText('模拟跑起来后，这里会出现走势…', 12, H / 2);
        return;
      }
      const topH = Math.round(H * 0.52), gap = 12, botH = H - topH - gap;
      const x = (i) => 4 + (i / (hist.length - 1)) * (W - 8);
      const yT = (v2) => 10 + (1 - clamp(v2, 0, 1)) * (topH - 14);
      TREND_LINES.forEach((L) => {
        c.strokeStyle = L.c; c.lineWidth = 1.4; c.beginPath();
        hist.forEach((h2, i) => { const px = x(i), py = yT(h2[L.k]); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
        c.stroke();
      });
      let lx = 6;
      TREND_LINES.forEach((L) => {
        c.fillStyle = L.c; c.fillRect(lx, 3, 6, 3);
        c.fillText(L.label, lx + 9, 9);
        lx += 9 + c.measureText(L.label).width + 10;
      });
      const y0 = topH + gap, yB = y0 + botH;
      c.fillStyle = 'rgba(255,255,255,0.04)';
      c.fillRect(0, y0, W, botH);
      const tot = (h2) => Math.max(h2.n.reduce((a2, b2) => a2 + b2, 0), 1e-9);
      const base = hist.map(() => 0);
      S.forEach((sp, si) => {
        const top = base.map((b0, i) => b0 + hist[i].n[si] / tot(hist[i]));
        c.beginPath();
        hist.forEach((h2, i) => { const px = x(i), py = yB - top[i] * botH; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
        for (let i = hist.length - 1; i >= 0; i--) c.lineTo(x(i), yB - base[i] * botH);
        c.closePath();
        c.fillStyle = sp.color; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1;
        for (let i = 0; i < hist.length; i++) base[i] = top[i];
      });
    }


    /* ---------- 今天吃了什么：食物 → 营养维度 → 生态响应 ---------- */
    const FOOD_ALIAS = {
      米饭: '白米饭', 白米: '白米饭', 面条: '白面条', 鸡肉: '鸡胸肉', 青菜: '白菜',
      叶菜: '菠菜', 水果: '苹果', 蔬菜: '西兰花', 猪肉丝: '猪肉', 烧肉: '红烧肉',
      可乐饮料: '可乐', 茶: '浓茶', 拿铁: '咖啡', 冰美式: '咖啡', 麻辣香锅: '麻辣烫',
      冰咖啡: '咖啡', 酸奶昔: '酸奶', 水果捞: '蓝莓', 坚果仁: '坚果', 炒饭: '白米饭',
      益力多: '养乐多', 养乐多饮品: '养乐多', 活性乳酸菌: '乳酸菌饮料', 乳酸菌饮品: '乳酸菌饮料',
      乳酸饮料: '乳酸菌饮料', 汽水: '冰汽水', 冰可乐: '冰汽水', 加冰可乐: '冰汽水',
      沙士: '冰汽水', 苏打水: '冰汽水', 气泡水: '冰汽水', 变态辣: '爆辣火锅', 牛油火锅: '爆辣火锅',
      特辣火锅: '爆辣火锅', 麻辣锅: '爆辣火锅',
    };
    const scoreColor = (s) => (s >= 60 ? '#34D399' : s >= 45 ? '#F5B944' : '#FF6B4A');

    function parseMeal(text) {
      const tokens = text.split(/[,，、\s+＋和跟配与；;]+/).map((s) => s.trim()).filter(Boolean);
      const items = [], unknown = [];
      const CN = { 一: 1, 两: 2, 二: 2, 三: 3, 半: 0.5, 四: 4 };
      tokens.forEach((raw) => {
        let token = raw.replace(/\d+\s*(g|克|ml|毫升|kg)/gi, '');
        let qty = 1;
        // 只在"数量 + 量词"时才算份数，避免把"三文鱼"切成 3 份
        const q = token.match(/^([一两二三四半]|\d+(?:\.\d+)?)\s*(份|碗|个|杯|块|片|根|把|勺|瓶|罐|袋|只|条)/);
        if (q) {
          qty = CN[q[1]] || parseFloat(q[1]) || 1;
          token = token.slice(q[0].length);
        }
        if (!token) return;
        token = FOOD_ALIAS[token] || token;
        // 匹配优先级：完全相等 → 输入包含词条 → 词条包含输入，避免"可乐"被认成"无糖可乐"
        const byLen = (arr) => (arr.length ? arr.sort((a, b) => b.n.length - a.n.length)[0] : null);
        const hit =
          GUT.FOODS.find((f) => f.n === token) ||
          byLen(GUT.FOODS.filter((f) => token.includes(f.n))) ||
          byLen(GUT.FOODS.filter((f) => token.length >= 2 && f.n.includes(token)));
        if (hit) items.push({ food: hit, qty });
        else unknown.push(raw);
      });

      let F = 0, P = 0, Z = 0, S = 0, portions = 0;
      const tags = {};
      items.forEach(({ food, qty }) => {
        F += food.f * qty; P += food.p * qty; Z += food.z * qty; S += food.s * qty;
        portions += qty;
        (Array.isArray(food.tag) ? food.tag : food.tag ? [food.tag] : []).forEach((t) => { tags[t] = true; });
      });
      const n = Math.max(portions, 1);
      const af = F / n, ap = P / n, az = Z / n, as = S / n;
      let score = clamp(50 + (af - 1.2) * 18 + (az - 0.3) * 10 - (ap - 1) * 8 - as * 12, 3, 100);
      /* 活性菌饮品加分、爆辣减分：口味的强度本身也是生态变量 */
      if (tags.liveCulture) score += 4;
      if (tags.superSpicy) score -= 5;
      score = clamp(score, 3, 100);
      const label = items.map((i) => i.food.n).join(' ').slice(0, 24);
      return { items, unknown, f: F, p: P, z: Z, s: S, portions, af, ap, az, as, tags, score, label, text };
    }

    function mealPredict(m) {
      const out = [];
      if (m.af >= 2) out.push(['↑', '纤维充足：未来 1～2 天纤维池上升，产丁酸菌（普拉梭菌、罗氏菌）与双歧杆菌拿到底物，<b>丁酸与 SCFA 会回升</b>，黏液层也不再被当作食物。']);
      else if (m.af < 0.8) out.push(['↓', '纤维不足：菌群会转向发酵蛋白质和黏液糖链，<b>丁酸下降、黏液层被消耗</b>，pH 趋于偏碱。']);
      else out.push(['→', '纤维中等：足以维持基本发酵，但不足以明显推高丁酸。']);
      if (m.ap >= 2) out.push(['↑', '蛋白脂肪偏高：胆汁酸分泌增加，耐胆汁的<b>拟杆菌与硫酸盐还原菌</b>扩张，H₂S 上升、pH 偏碱。']);
      if (m.az >= 1.2) out.push(['↑', '发酵食品充足：带来<b>过路有益菌</b>与乳酸/乙酸，短期内乳酸菌、双歧杆菌份额上升。']);
      if (m.as >= 1.5) out.push(['↑', '糖分偏高：被快速发酵成乳酸与气体，<b>产气 / 腹胀上升</b>；长期高糖还会压低多样性。']);
      if (m.tags.superSpicy) out.push(['↑', '爆辣刺激：辣椒素通过 TRPV1 通路让<b>蠕动明显加快</b>，并带来轻度的黏膜充血与炎症波动，黏液层短暂变薄；配合高脂底料时，胆汁酸与 H₂S 常同时升高。']);
      else if (m.tags.spicy || m.tags.caffeine || m.tags.cold) out.push(['↑', '刺激性饮食：蠕动加快、传输时间缩短，菌群被冲刷，<b>总菌量可能短期下降</b>。']);
      if (m.tags.fizz) out.push(['↑', '碳酸刺激：额外的 CO₂ 进入消化道，<b>气体负荷叠加</b>，配上冷饮的蠕动加快，腹胀感往往比单纯的高糖饮料更明显。']);
      if (m.tags.liveCulture) out.push(['↑', '活性乳酸菌：带来大量<b>过路有益菌</b>与乳酸，乳酸杆菌份额短期上升；但它们很难长期定植，真正决定生态的仍是日常吃的纤维与发酵食品。']);
      if (m.tags.alcohol) out.push(['↑', '酒精：直接提高屏障通透性与炎症，短期内<b>炎症指标小幅上升</b>。']);
      if (m.tags.sweetener) out.push(['→', '人工甜味剂：无热量，但并非对菌群惰性，研究结论尚不一致。']);
      return out;
    }

    function mealTips(m) {
      const t = [];
      if (m.af < 1.2) t.push('下一餐加一份<b>燕麦 / 豆类 / 绿叶菜</b>，把纤维提到 2 以上——这是提升丁酸最有效的一步。');
      if (m.as >= 1.5) t.push('把含糖饮料换成<b>水或无糖茶</b>，可立刻降低乳酸与产气负担。');
      if (m.az < 0.8) t.push('加一份<b>酸奶 / 泡菜 / 纳豆</b>等发酵食品，直接补充过路有益菌与有机酸。');
      if (m.ap >= 2) t.push('用<b>豆类或鱼</b>替换部分红肉与油炸，减少胆汁酸与 H₂S 的来源。');
      if (!t.length) t.push('这一餐结构不错。记住：<b>食材多样</b>比某一种"超级食物"更重要，每周吃够 30 种植物性食材是常见目标。');
      return t;
    }

    function openMealReport(m) {
      const foods = m.items.map(({ food, qty }) => {
        const c = GUT.FOOD_CATS[food.cat];
        const tip = food.desc ? ` title="${String(food.desc).replace(/"/g, '&quot;')}"` : '';
        return `<span class="foodTag"${tip} style="border-color:${c.color}55;background:${c.color}14">
          <i style="background:${c.color}"></i>${food.n}${qty !== 1 ? ' ×' + qty : ''}<em>${c.label}</em></span>`;
      }).join('');
      const maxV = Math.max(1, m.af, m.ap, m.az, m.as);
      const bars = GUT.MEAL_DIMS.map((d) => {
        const v = m[d.key === 'f' ? 'af' : d.key === 'p' ? 'ap' : d.key === 'z' ? 'az' : 'as'];
        return `<div class="mdRow"><span>${d.label}</span>
          <i class="mdBar"><b style="width:${((v / 3) * 100).toFixed(0)}%;background:${d.color}"></b></i>
          <em>${v.toFixed(1)} / 3</em></div>`;
      }).join('');
      const sc = Math.round(m.score), col = scoreColor(m.score);
      const verdict = sc >= 75 ? '对菌群很友好' : sc >= 60 ? '还不错' : sc >= 45 ? '一般，有改进空间' : sc >= 30 ? '偏西式快餐结构' : '对菌群不太友好';
      openModal(`
        <span class="mTag" style="color:#C3E34A;border-color:#C3E34A66;background:#C3E34A12">膳食分析</span>
        <h3 class="mTitle">这一餐对菌群意味着什么</h3>
        <p class="mSub">识别到 ${m.items.length} 种食物 · 约 ${m.portions.toFixed(1)} 份${m.unknown.length ? ' · 有 ' + m.unknown.length + ' 项没认出' : ''}</p>
        <div class="foodList">${foods}</div>
        ${m.unknown.length ? `<p class="tiny">没认出来：<b>${m.unknown.join('、')}</b>——换个常见说法试试（如"炸鸡""奶茶""燕麦"）。</p>` : ''}
        <div class="mScore" style="--c:${col}"><b>${sc}</b><span>菌群友好度 · ${verdict}</span></div>
        <div class="mdWrap">${bars}</div>
        <h4 class="repH">接下来 1～2 天预计会发生什么</h4>
        <ul class="repCause">${mealPredict(m).map((p) => `<li data-i="${p[0]}">${p[1]}</li>`).join('')}</ul>
        <h4 class="repH">怎么改进</h4>
        <ul class="repCause">${mealTips(m).map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openMealReport = openMealReport;

    let lastMealN = -1;
    function renderMeals() {
      if (sim.meals.length === lastMealN) return;
      lastMealN = sim.meals.length;
      const box = $('mealToday');
      if (!sim.meals.length) {
        box.innerHTML = '<p class="tiny">还没有记录。写下今天吃的东西，生态会立刻响应。</p>';
        return;
      }
      const tot = sim.meals.reduce((a, m) => ({ f: a.f + m.f, p: a.p + m.p, z: a.z + m.z, s: a.s + m.s }), { f: 0, p: 0, z: 0, s: 0 });
      const max = Math.max(1, tot.f, tot.p, tot.z, tot.s);
      const bars = GUT.MEAL_DIMS.map((d) => `<div class="mdRow"><span>${d.label}</span>
        <i class="mdBar"><b style="width:${((tot[d.key] / max) * 100).toFixed(0)}%;background:${d.color}"></b></i>
        <em>${tot[d.key].toFixed(0)}</em></div>`).join('');
      const list = sim.meals.slice(-8).reverse().map((m) =>
        `<div class="mealItem"><i style="background:${scoreColor(m.score)}"></i><b>第 ${m.day.toFixed(1)} 天</b>
          <span>${m.label}</span><em style="color:${scoreColor(m.score)}">${Math.round(m.score)}</em></div>`
      ).join('');
      box.innerHTML = `<div class="mdWrap">${bars}</div><div class="mealList">${list}</div>`;
    }

    function submitMeal() {
      const el = $('mealInput');
      const text = el.value.trim();
      if (!text) { U.toast('先写下你吃了什么，例如：燕麦 蓝莓 酸奶'); return; }
      const m = parseMeal(text);
      if (!m.items.length) { U.toast('没识别出食物，换个常见说法试试：燕麦 / 酸奶 / 炸鸡'); return; }
      sim.meal(m);
      el.value = '';
      U.toast('已记录：' + m.label);
      openMealReport(m);
    }

    function buildMeal() {
      const chips = ['燕麦', '蓝莓', '酸奶', '西兰花', '糙米', '三文鱼', '炸鸡', '奶茶', '泡菜', '可乐', '白米饭', '核桃', '养乐多', '爆辣火锅', '冰汽水'];
      const box = $('mealChips');
      box.innerHTML = chips.map((c) => `<button class="chipBtn" data-f="${c}">${c}</button>`).join('');
      box.querySelectorAll('[data-f]').forEach((b) =>
        b.addEventListener('click', () => {
          const inp = $('mealInput');
          inp.value = (inp.value ? inp.value + ' ' : '') + b.dataset.f;
          inp.focus();
        })
      );
      $('mealAdd').addEventListener('click', submitMeal);
      $('mealInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitMeal();
      });
      const clr = $('mealClear');
      if (clr) clr.addEventListener('click', () => {
        sim.meals.length = 0;
        lastMealN = -1;
        U.toast('已清空今日膳食记录');
      });

      // 顶栏「记录一餐」：滚动到输入区并聚焦
      const bm = $('btnMeal');
      if (bm) bm.addEventListener('click', () => {
        const sec = document.querySelector('.block-meal');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('mealInput');
        inp.focus();
        inp.classList.add('flash');
        setTimeout(() => inp.classList.remove('flash'), 1200);
        U.toast('写下你吃了什么，例如：燕麦 蓝莓 酸奶');
      });

      // 顶栏「我的档案」：打开日记本
      const bd = $('btnDiary');
      if (bd) bd.addEventListener('click', () => openDiary());
      diaryLoad();
      syncDiaryBadge();
    }

    /* ============ 我的档案 · 日记本 ============ */
    const DY_KEY = 'gut_diary_v1';
    const dyDraft = { meal: 'lunch', foods: '', mood: 'calm', stress: 4, sleepH: 7, sleepQ: 'ok', symptoms: [], body: '' };

    function diarySave() {
      try { localStorage.setItem(DY_KEY, JSON.stringify(sim.diary)); } catch (err) { /* 忽略存储失败 */ }
    }
    function diaryLoad() {
      try {
        const raw = localStorage.getItem(DY_KEY);
        if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) sim.diary = arr; }
      } catch (err) { /* 忽略 */ }
    }
    function syncDiaryBadge() {
      const b = $('btnDiary');
      if (!b) return;
      const n = sim.diary.length;
      b.textContent = n ? '我的档案 · ' + n : '我的档案';
      b.classList.toggle('has', !!n);
    }
    const dyMealOf = (id) => GUT.DIARY_MEALS.filter((x) => x.id === id)[0] || { label: '记录', color: '#2DD4BF' };
    const dyMoodOf = (id) => GUT.DIARY_MOODS.filter((m) => m.id === id)[0];
    const dySleepOf = (id) => GUT.DIARY_SLEEP.filter((s) => s.id === id)[0] || { label: '一般', v: 0 };
    const stressText = (v) => (v <= 2 ? '很放松' : v <= 4 ? '适中' : v <= 6 ? '偏高' : v <= 8 ? '明显偏高' : '很高');

    function diaryListHTML() {
      if (!sim.diary.length) return '<p class="tiny">还没有记录。填好上面的内容，点「保存这一条记录」。</p>';
      return sim.diary.slice().reverse().map((d) => {
        const m = dyMealOf(d.meal);
        const mood = dyMoodOf(d.mood);
        return `<div class="dyEntry">
          <div class="dyEntryHead">
            <i style="background:${m.color}"></i><b>${m.label} · 第 ${(+d.day).toFixed(1)} 天</b>
            <button class="dyDel" data-dydel="${d.id}" title="删除这条">×</button>
          </div>
          <div class="dyEntryBody">
            ${d.foods ? `<span class="dyPill">餐：${d.foods}</span>` : ''}
            ${mood ? `<span class="dyPill">心情：${mood.label}</span>` : ''}
            <span class="dyPill">压力：${d.stress}/10</span>
            <span class="dyPill">睡眠：${d.sleepH}h · ${dySleepOf(d.sleepQ).label}</span>
            ${(d.symptoms || []).map((s) => `<span class="dyPill warn">${s}</span>`).join('')}
            ${d.body ? `<span class="dyPill">${d.body}</span>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    function bindDiaryList() {
      const list = $('dyList');
      if (!list) return;
      list.innerHTML = diaryListHTML();
      syncDiaryBadge();
      list.querySelectorAll('[data-dydel]').forEach((b) =>
        b.addEventListener('click', () => {
          sim.delDiary(b.dataset.dydel);
          diarySave();
          bindDiaryList();
          U.toast('已删除这条记录');
        })
      );
    }

    /* 汇总：心情 / 压力 / 睡眠 / 症状 / 三餐 → 生态偏移 + 命中的状态 */
    function diaryAgg() {
      const ds = sim.diary;
      const n = ds.length || 1;
      const env = {};
      GUT.ENV.forEach((e) => (env[e.key] = 0));
      const bio = {};
      ['inflammation', 'butyrate', 'barrier', 'mucus', 'gas', 'h2s'].forEach((k) => (bio[k] = 0));
      let stress = 0, sleepH = 0, sleepV = 0;
      const moodCount = {}, mealCount = {}, sympCount = {};
      ds.forEach((d) => {
        const mood = dyMoodOf(d.mood);
        if (mood) {
          if (mood.env) for (const k in mood.env) env[k] += mood.env[k] / n;
          if (mood.bio) for (const k in mood.bio) bio[k] += mood.bio[k] / n;
          moodCount[d.mood] = (moodCount[d.mood] || 0) + 1;
        }
        const sv = +d.stress || 0;
        stress += sv / n;
        env.stress += ((sv - 4) * 5) / n;
        env.immune += (Math.max(0, sv - 6) * 4) / n;
        bio.butyrate -= (Math.max(0, sv - 6) * 0.012) / n;
        bio.barrier -= (Math.max(0, sv - 6) * 0.008) / n;
        const sh = +d.sleepH || 0;
        sleepH += sh / n;
        const qv = dySleepOf(d.sleepQ).v;
        sleepV += qv / n;
        const deficit = Math.max(0, 7.5 - sh);
        env.stress += (deficit * 3) / n;
        env.immune += (deficit * 2 + (qv < 0 ? 4 : 0)) / n;
        const bad = deficit * 0.012 + (qv < 0 ? 0.03 : 0);
        bio.inflammation += bad / n;
        bio.butyrate -= bad / n;
        bio.barrier -= bad * 0.6 / n;
        if (qv > 0 && sh >= 7) { bio.butyrate += 0.025 / n; env.stress -= 3 / n; }
        mealCount[d.meal] = (mealCount[d.meal] || 0) + 1;
        (d.symptoms || []).forEach((s) => (sympCount[s] = (sympCount[s] || 0) + 1));
      });

      const hits = {};
      Object.keys(sympCount).forEach((label) => {
        const s = GUT.DIARY_SYMPTOMS.filter((x) => x.label === label)[0];
        if (s) s.hit.forEach((id) => (hits[id] = (hits[id] || 0) + sympCount[label]));
      });
      const unknown = [];
      ds.forEach((d) => {
        if (!d.body) return;
        const r = parseProfileText(d.body);
        r.hit.forEach((p) => (hits[p.id] = (hits[p.id] || 0) + 1));
        r.unknown.forEach((t) => { if (unknown.indexOf(t) < 0) unknown.push(t); });
      });
      if (stress >= 7) hits.stressHigh = (hits.stressHigh || 0) + 2;
      if (sleepH && (sleepH < 6.5 || sleepV < -0.5)) hits.sleepDebt = (hits.sleepDebt || 0) + 2;

      const foods = ds.map((d) => d.foods).filter(Boolean).join(' ');
      const meal = foods ? parseMeal(foods) : null;
      return { n: ds.length, env, bio, stress, sleepH, sleepV, moodCount, mealCount, sympCount, hits, meal, foods, unknown };
    }

    const dyTag = (label, v, goodUp, unit) => {
      const a = Math.abs(v);
      const s = v > 0.004 ? '↑' : v < -0.004 ? '↓' : '→';
      const good = goodUp ? v > 0 : v < 0;
      const cls = a < 0.004 ? '' : good ? 'down' : 'up';
      return `<span class="pfTag ${cls}">${label} ${s} ${a < 0.004 ? '基本不变' : (unit === '%' ? (a * 100).toFixed(0) + '%' : a.toFixed(0))}</span>`;
    };

    function openDiary() {
      const st = dyDraft;
      const setP = (el) => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
      openModal(`
        <span class="mTag" style="color:#A78BFA;border-color:#A78BFA66;background:#A78BFA12">日记 · 我的档案</span>
        <h3 class="mTitle">我的档案 · 一日记录</h3>
        <p class="mSub">记录三餐、心情、压力、睡眠与身体状况 · 攒几条后点底部「一键分析」</p>

        <h4 class="repH">① 这一餐吃了什么</h4>
        <div class="dySeg" id="dySeg">
          ${GUT.DIARY_MEALS.map((m) => `<button class="dySegBtn${st.meal === m.id ? ' on' : ''}" data-dymeal="${m.id}">${m.label}</button>`).join('')}
        </div>
        <div class="mealInput">
          <input id="dyFood" type="text" autocomplete="off" placeholder="燕麦 蓝莓 酸奶（空格隔开）" value="${st.foods}" />
          <button class="btn btn-primary" id="dyFoodAdd">加入</button>
        </div>
        <p class="tiny" id="dyFoodNote">${st.foods ? '这一餐：' + st.foods : '还没填这一餐（可以留空，只记录心情与睡眠）'}</p>

        <h4 class="repH">② 心情 · 压力 · 睡眠</h4>
        <div class="dyLine"><span class="dyLab">心情</span>
          <div class="dyChips" id="dyMoods">
            ${GUT.DIARY_MOODS.map((m) => `<button class="dyChip${st.mood === m.id ? ' on' : ''}" data-dymood="${m.id}">${m.label}</button>`).join('')}
          </div>
        </div>
        <div class="dyLine"><span class="dyLab">压力值</span>
          <input class="dyRange" id="dyStress" type="range" min="0" max="10" step="1" value="${st.stress}" />
          <b id="dyStressV">${st.stress}</b><span class="tiny" id="dyStressT">${stressText(+st.stress)}</span>
        </div>
        <div class="dyLine"><span class="dyLab">睡眠时长</span>
          <input class="dyRange" id="dySleep" type="range" min="0" max="12" step="0.5" value="${st.sleepH}" />
          <b id="dySleepV">${st.sleepH} h</b>
        </div>
        <div class="dyLine"><span class="dyLab">睡眠质量</span>
          <div class="dyChips" id="dySleepQ">
            ${GUT.DIARY_SLEEP.map((s) => `<button class="dyChip${st.sleepQ === s.id ? ' on' : ''}" data-dysq="${s.id}">${s.label}</button>`).join('')}
          </div>
        </div>

        <h4 class="repH">③ 身体状况（可多选）</h4>
        <div class="dyChips" id="dySymps">
          ${GUT.DIARY_SYMPTOMS.map((s) => `<button class="dyChip${st.symptoms.indexOf(s.label) >= 0 ? ' on warn' : ''}" data-dysym="${s.label}">${s.label}</button>`).join('')}
        </div>
        <div class="mealInput">
          <input id="dyBody" type="text" autocomplete="off" placeholder="补充：今天有点腹胀，下午特别困，喉咙发紧" value="${st.body}" />
        </div>

        <button class="dBtn dyPrimary" id="dySave">保存这一条记录</button>

        <h4 class="repH">已记录 · ${sim.diary.length} 条</h4>
        <div class="dyList" id="dyList"></div>

        <button class="dBtn dyPrimary" id="dyAnalyze">一键分析 · 看菌群变化与器官影响</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);

      const seg = $('dySeg');
      seg.querySelectorAll('[data-dymeal]').forEach((b) =>
        b.addEventListener('click', () => {
          st.meal = b.dataset.dymeal;
          seg.querySelectorAll('[data-dymeal]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dyMoods').querySelectorAll('[data-dymood]').forEach((b) =>
        b.addEventListener('click', () => {
          st.mood = b.dataset.dymood;
          $('dyMoods').querySelectorAll('[data-dymood]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dySleepQ').querySelectorAll('[data-dysq]').forEach((b) =>
        b.addEventListener('click', () => {
          st.sleepQ = b.dataset.dysq;
          $('dySleepQ').querySelectorAll('[data-dysq]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dySymps').querySelectorAll('[data-dysym]').forEach((b) =>
        b.addEventListener('click', () => {
          const l = b.dataset.dysym;
          const i = st.symptoms.indexOf(l);
          if (i >= 0) st.symptoms.splice(i, 1); else st.symptoms.push(l);
          b.classList.toggle('on', i < 0);
          b.classList.toggle('warn', i < 0);
        })
      );

      const sEl = $('dyStress'), hEl = $('dySleep');
      setP(sEl); setP(hEl);
      sEl.addEventListener('input', () => {
        st.stress = +sEl.value;
        setP(sEl);
        $('dyStressV').textContent = sEl.value;
        $('dyStressT').textContent = stressText(+sEl.value);
        sEl.classList.toggle('warn', +sEl.value >= 5);
        sEl.classList.toggle('danger', +sEl.value >= 8);
      });
      sEl.classList.toggle('warn', +sEl.value >= 5);
      sEl.classList.toggle('danger', +sEl.value >= 8);
      hEl.addEventListener('input', () => {
        st.sleepH = +hEl.value;
        setP(hEl);
        $('dySleepV').textContent = hEl.value + ' h';
        hEl.classList.toggle('warn', +hEl.value < 6.5 && +hEl.value > 0);
      });
      hEl.classList.toggle('warn', +hEl.value < 6.5 && +hEl.value > 0);

      const foodInp = $('dyFood');
      const addFood = () => {
        const v = foodInp.value.trim();
        if (!v) { U.toast('写下这一餐吃了什么，例如：燕麦 蓝莓 酸奶'); return; }
        st.foods = (st.foods ? st.foods + ' ' : '') + v;
        foodInp.value = '';
        $('dyFoodNote').textContent = '这一餐：' + st.foods;
        U.toast('已加入这一餐');
      };
      $('dyFoodAdd').addEventListener('click', addFood);
      foodInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFood(); });
      const bodyInp = $('dyBody');
      bodyInp.addEventListener('input', () => { st.body = bodyInp.value; });

      $('dySave').addEventListener('click', () => {
        if (!st.foods && !st.symptoms.length && !st.body) {
          U.toast('至少写点什么：食物、症状或一句身体感受');
          return;
        }
        sim.addDiary({
          meal: st.meal, foods: st.foods, mood: st.mood, stress: +st.stress,
          sleepH: +st.sleepH, sleepQ: st.sleepQ, symptoms: st.symptoms.slice(), body: st.body,
        });
        diarySave();
        st.foods = ''; st.body = ''; st.symptoms = [];
        $('dyFood').value = ''; $('dyBody').value = '';
        $('dyFoodNote').textContent = '还没填这一餐（可以留空，只记录心情与睡眠）';
        $('dySymps').querySelectorAll('[data-dysym]').forEach((b) => b.classList.remove('on', 'warn'));
        bindDiaryList();
        U.toast('已保存 · 日记共 ' + sim.diary.length + ' 条');
      });

      bindDiaryList();
      $('dyAnalyze').addEventListener('click', analyzeDiary);
    }
    U.openDiary = openDiary;

    /* ---------- 一键分析 ---------- */
    function analyzeDiary() {
      if (!sim.diary.length) { U.toast('还没有任何记录：先保存一两条再分析'); return; }
      const a = diaryAgg();
      const days = sim.diary.map((d) => +d.day);
      const span = Math.max(1, Math.max.apply(null, days) - Math.min.apply(null, days) + 1);
      const hitIds = Object.keys(a.hits).sort((x, y) => a.hits[y] - a.hits[x]);
      const items = hitIds.map((id) => PFI[id]).filter(Boolean);
      const mainMood = Object.keys(a.moodCount).sort((x, y) => a.moodCount[y] - a.moodCount[x])[0];
      const mood = dyMoodOf(mainMood);
      const symps = Object.keys(a.sympCount).sort((x, y) => a.sympCount[y] - a.sympCount[x]);

      /* ② 菌群变化的预测条目 */
      const eco = [];
      if (a.meal && a.meal.items.length) {
        mealPredict(a.meal).forEach((p) => eco.push([p[0], '饮食：' + p[1]]));
      } else {
        eco.push(['→', '这几条记录里没有食物信息，饮食对生态的影响无法评估——下次记得写下三餐。']);
      }
      if (a.stress >= 7) eco.push(['↓', '压力持续偏高：蠕动与免疫张力上升、黏液分泌减少，<b>产丁酸菌受压、屏障变漏</b>，耐氧的肠杆菌科更容易抬头。']);
      else if (a.stress <= 3) eco.push(['↑', '压力处于低位：蠕动与免疫张力平稳，有利于严格厌氧的产丁酸菌维持种群。']);
      else eco.push(['→', '压力中等：生态不会因此剧烈波动，但叠加上面的饮食因素后仍有累积效应。']);
      if (a.sleepH < 6.5) eco.push(['↓', '睡眠不足（平均 ' + a.sleepH.toFixed(1) + ' h）：菌群昼夜节律被打乱，<b>多样性与产丁酸菌下降</b>，炎症基线抬高。']);
      else if (a.sleepH >= 7 && a.sleepV > 0.4) eco.push(['↑', '睡眠充足且质量好：有助于维持菌群节律与丁酸产出。']);
      else eco.push(['→', '睡眠时长一般：若能稳定在 7 h 以上并提升深睡比例，通常能看到多样性回升。']);
      if (a.sleepV < -0.4) eco.push(['↓', '睡眠质量差：碎片化睡眠会抬高屏障通透性与炎症，第二天常表现为腹胀与"肠漏感"。']);
      if (mood && (mood.id === 'low' || mood.id === 'flat')) eco.push(['↓', '情绪持续偏低：色氨酸更多走向犬尿氨酸通路，<b>产丁酸菌与双歧/乳酸菌份额下降</b>，炎症升高。']);
      if (mood && mood.id === 'anxious') eco.push(['↑', '焦虑主导：蠕动加快、产气上升，菌群被"冲刷"，敏感菌难以驻留。']);

      /* ③ 器官影响 */
      let axes = GUT.AXES.filter((ax) => (ax.rel || []).some((id) => hitIds.indexOf(id) >= 0));
      if (!axes.length && a.stress >= 6) axes = [GUT.AXIS_INDEX.brain];
      if (!axes.length) axes = [GUT.AXIS_INDEX.immune];
      const axisHTML = axes.slice(0, 4).map((ax) => {
        const mols = ax.molecules.slice(0, 4).map((m) => {
          const d = MOL_DIR[m.dir] || MOL_DIR.flat;
          return `<span class="pfTag" style="color:${d.c};border-color:${d.c}55;background:${d.c}12">${m.name} ${d.s}</span>`;
        }).join('');
        return `<div class="molRow" data-dyax="${ax.id}" style="cursor:pointer">
          <div class="molHead"><b>${ax.title}</b><em style="color:${ax.color}">靶器官：${ax.organ}</em></div>
          <div class="pfLine" style="margin:5px 0">${mols}</div>
          <p>可能出现：${ax.symptoms.slice(0, 3).join('；')}。</p>
        </div>`;
      }).join('');

      /* ④ 饮食建议 */
      const diet = a.meal ? mealTips(a.meal) : ['这几条记录里没有食物，建议从下一餐开始记录：写下<b>主食 + 一份蔬菜 + 一份蛋白</b>即可。'];
      if (a.stress >= 6) diet.push('压力偏高时最容易跳过正餐、转向高糖高脂：优先保住<b>固定三餐 + 一份蔬菜</b>，比追求完美饮食更重要。');
      if (a.sleepH < 6.5) diet.push('把膳食纤维集中在白天、睡前 3 小时不再进食，既减少夜间产气，也给菌群一个真实的"夜间空腹期"。');
      if (symps.indexOf('腹胀 / 排气多') >= 0) diet.push('腹胀明显时，纤维选<b>可溶性</b>（燕麦、车前子、奇亚籽）并循序渐进，避免一次性大量粗纤维。');
      if (symps.indexOf('便秘') >= 0) diet.push('便秘时<b>纤维 + 水必须同时补</b>（25～30 g 纤维配 1.5～2 L 水），西梅、猕猴桃与洋车前子壳的证据最强。');

      /* ⑤ 其他建议 */
      const other = [];
      if (a.stress >= 6) other.push('每天留 10 分钟慢呼吸或放松训练：对肠道的作用经由迷走神经起效，与饮食同等重要。');
      if (a.sleepH < 6.5) other.push('固定起床时间比固定入睡时间更重要；先稳住晨间光照锚点，再逐步提前入睡。');
      if (a.sleepV < -0.4) other.push('睡眠质量差时，先排查：晚间咖啡因 / 酒精、睡前屏幕光、深夜加餐与疼痛不适。');
      other.push('每周 150 分钟中等强度运动 + 2 次力量训练：它是少数能<b>独立于饮食</b>提升菌群多样性的杠杆。');
      other.push('每坐 45 分钟起身活动 3～5 分钟，能明显改善肠蠕动与餐后血糖。');
      if (!other.length) other.push('目前没有特别需要干预的信号：保持"食材多样 + 规律作息"就是最好的维护。');

      const hitChips = items.map((p) => {
        const g = GUT.PROFILE_GROUPS.filter((x) => x.id === p.group)[0] || { color: '#2DD4BF' };
        return `<button class="libCard" data-dypf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · 查看资料卡</span></button>`;
      }).join('');

      openModal(`
        <span class="mTag" style="color:#F472B6;border-color:#F472B666;background:#F472B612">日记 · 一键分析</span>
        <h3 class="mTitle">我的档案 · 分析报告</h3>
        <p class="mSub">基于 ${a.n} 条记录 · 覆盖约 ${span.toFixed(0)} 天 · 下面是它们叠加后对生态与器官的预测</p>
        <p class="mLead">这几天的总体画像：<b>压力 ${a.stress.toFixed(1)}/10（${stressText(a.stress)}）· 睡眠 ${a.sleepH.toFixed(1)} h · 心情以「${mood ? mood.label : '—'}」为主</b>。生态最可能的方向是：${a.bio.butyrate < -0.02 ? '<b>丁酸下降、屏障变漏、炎症上升</b>' : a.bio.butyrate > 0.02 ? '<b>丁酸回升、炎症回落</b>' : '<b>基本维持，但仍有可优化空间</b>'}。</p>

        <h4 class="repH">① 日记概览</h4>
        <div class="mGrid">
          <div><span>记录条数</span><b>${a.n}</b></div>
          <div><span>平均压力</span><b style="color:${a.stress >= 7 ? '#FF6B4A' : a.stress >= 5 ? '#F5B944' : '#34D399'}">${a.stress.toFixed(1)} / 10</b></div>
          <div><span>平均睡眠</span><b style="color:${a.sleepH < 6.5 ? '#FF6B4A' : a.sleepH < 7 ? '#F5B944' : '#34D399'}">${a.sleepH.toFixed(1)} h</b></div>
          <div><span>三餐覆盖</span><b>${Object.keys(a.mealCount).length} / 4</b></div>
        </div>
        <div class="pfLine">
          ${symps.slice(0, 6).map((s) => `<span class="pfTag up">${s} ×${a.sympCount[s]}</span>`).join('') || '<span class="pfTag">没有勾选身体症状</span>'}
        </div>

        <h4 class="repH">② 肠道菌群会发生什么变化</h4>
        <div class="pfLine">
          ${dyTag('丁酸', a.bio.butyrate, true, '%')}
          ${dyTag('炎症', a.bio.inflammation, false, '%')}
          ${dyTag('肠屏障', a.bio.barrier, true, '%')}
          ${dyTag('产气', a.bio.gas, false, '%')}
        </div>
        <div class="pfLine">
          ${dyTag('压力（环境）', a.env.stress, false, '')}
          ${dyTag('肠蠕动', a.env.motility, false, '')}
          ${dyTag('免疫张力', a.env.immune, false, '')}
          ${dyTag('膳食纤维', a.env.fiber, true, '')}
        </div>
        <ul class="repCause">${eco.map((p) => `<li data-i="${p[0]}">${p[1]}</li>`).join('')}</ul>
        ${items.length ? `<h4 class="repH">与之相关的状态（可点开看资料卡）</h4><div class="libGrid">${hitChips}</div>` : ''}
        ${items.length ? `<div class="mSect fear"><h4>菌群结构上的共同特征</h4><p>${items.slice(0, 3).map((p) => strip(p.micro).slice(0, 110) + '…').join(' ')}</p></div>` : ''}
        ${a.unknown.length ? `<p class="tiny">身体描述里没认出来的词：<b>${a.unknown.join('、')}</b>——换个常见说法（如"压力大""便秘""经期"）会更准。</p>` : ''}

        <h4 class="repH">③ 对其他器官的影响</h4>
        <div class="molWrap">${axisHTML}</div>

        <h4 class="repH">④ 饮食调整建议</h4>
        <ul class="repCause">${uniq(diet).map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>

        <h4 class="repH">⑤ 作息与其他有用建议</h4>
        <ul class="repCause">${other.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>

        <div class="mSect fact"><h4>需要就医的信号（红旗）</h4><p>如果出现下列情况，请尽快就医，而不是只做饮食调整：${GUT.DIARY_FLAGS.join('；')}。</p></div>

        <button class="dBtn dyPrimary" id="dyApply">把这份分析应用到模拟器</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);

      const body = $('modalBody');
      body.querySelectorAll('[data-dypf]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.dypf))
      );
      body.querySelectorAll('[data-dyax]').forEach((b) =>
        b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.dyax]))
      );
      $('dyApply').addEventListener('click', () => {
        const ids = sim.profile.slice();
        hitIds.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
        sim.setProfile(ids);
        syncProfileChips();
        U.syncEnv();
        if (a.meal && a.meal.items.length) {
          sim.meal(a.meal);
          lastMealN = -1;
          renderMeals();
        }
        closeModal();
        U.toast('已应用：' + (items.length ? items.map((p) => p.label).join('、') : '生态基线') + ' 已写入状态档案');
        setTimeout(() => openProfileReport(), 400);
      });
    }
    U.analyzeDiary = analyzeDiary;

    /* ---------- 图鉴（分栏科普库） ---------- */
    const TONE_COLOR = { danger: '#FF6B4A', warn: '#F5B944', good: '#34D399', plain: '#7E9AA0' };
    const strip = (s) => s.replace(/<[^>]+>/g, '');

    /* ---------- 精神类状态的数据准备好：健康对照 + 各条档案 ---------- */
    const PSY_ORDER = ['depression', 'autism', 'schizophrenia', 'adhd', 'anxiety', 'stressHigh'];
    const PSY_SHORT = {
      depression: '抑郁症', autism: '孤独症谱系', schizophrenia: '精神分裂症',
      adhd: '多动症 / ADHD', anxiety: '焦虑障碍', stressHigh: '长期压力',
    };

    function psyItems() {
      const g = GUT.PROFILE_GROUPS.find((x) => x.id === 'mental') || { color: '#2DD4BF' };
      const list = PF.filter((p) => p.group === 'mental');
      list.sort((a, b) => PSY_ORDER.indexOf(a.id) - PSY_ORDER.indexOf(b.id));
      const cols = [{
        id: '', short: '健康对照', note: '基线菌群', color: '#7E9A9E', heading: '健康对照：以物种 seed 为基线份额，条形代表 0 参考线。',
        item: { species: {}, molecules: [], bio: {} },
      }];
      list.forEach((p, i) => {
        cols.push({
          id: p.id,
          short: PSY_SHORT[p.id] || String(p.label).split(/[ /（(]/)[0],
          note: strip(p.micro).slice(0, 20) + '…',
          color: MOL_PALETTE[i % MOL_PALETTE.length],
          heading: strip(p.lead).slice(0, 60),
          item: p,
        });
      });
      return cols;
    }

    const psyPanel = `
      <p class="mSub">同一套环境变量下，不同精神类状态的菌群走向差别很大：下面的图把它们和健康对照放在一起对比，点任意一列可打开它的完整资料卡。</p>
      <canvas class="psyCmp" id="psyCmp"></canvas>
      <div class="psyNote"><b id="psyHead">正在对比…</b><span>横向一列＝一个状态（首列「健康对照」为零基准），纵向一行＝一个指标；每根柱的末端<b style="color:#dffbf4">直接写着「上升」或「下降」</b>，柱越长＝该行里变化越大；<span style="color:#34D399">绿色＝通常有利的方向</span>、<span style="color:#FF6B4A">红色＝通常不利的方向</span>。空白表示该档案在这个指标上没有明显改变。</span></div>
    `;

    function mountPsy(root) {
      const cv = root.querySelector('#psyCmp');
      const head = root.querySelector('#psyHead');
      if (!cv) return;
      const inst = psyCompare(cv, psyItems(), (id) => openProfileCard(id), (text) => {
        if (head) head.textContent = text;
      });
      molAnims.push(inst);
      inst.start();
    }

    function openLibrary(tab) {
      const cur = tab || 'ev';
      const tabs = [
        { id: 'ev', label: '临床干预' },
        { id: 'mt', label: '生态指标' },
        { id: 'sp', label: '菌群物种' },
        { id: 'pf', label: '状态档案' },
        { id: 'ax', label: '肠-器官轴' },
        { id: 'topic', label: '生态原理' },
        { id: 'psy', label: '肠脑 · 精神' },
      ];
      let cards = '';
      if (cur === 'ev') {
        cards = GUT.EVENTS.map((e) => {
          const i = GUT.EVENT_INFO[e.id];
          return `<button class="libCard" data-ev="${e.id}"><i style="background:${TONE_COLOR[e.tone]}"></i><b>${e.label}</b><span>${i.tag} · ${strip(i.mech).slice(0, 32)}…</span></button>`;
        }).join('');
      } else if (cur === 'mt') {
        cards = Object.keys(GUT.METRIC_INFO).map((k) => {
          const m = GUT.METRIC_INFO[k];
          return `<button class="libCard" data-mt="${k}"><i style="background:${m.color}"></i><b>${m.label}</b><span>${strip(m.what).slice(0, 32)}…</span></button>`;
        }).join('');
      } else if (cur === 'sp') {
        cards = S.map((sp) => `<button class="libCard" data-sp="${sp.id}"><i style="background:${sp.color}"></i><b>${sp.name}</b><span>${sp.latin} · ${ROLE_TEXT[sp.role]}</span></button>`).join('');
      } else if (cur === 'pf') {
        cards = PF.map((p) => {
          const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
          return `<button class="libCard" data-pf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · ${strip(p.micro).slice(0, 30)}…</span></button>`;
        }).join('');
      } else if (cur === 'psy') {
        cards = psyItems().slice(1).map((c) =>
          `<button class="libCard" data-pf="${c.id}"><i style="background:${c.color}"></i><b>${c.short}</b><span>${c.note}</span></button>`).join('');
      } else if (cur === 'ax') {
        cards = GUT.AXES.map((a) => `<button class="libCard" data-ax="${a.id}"><i style="background:${a.color}"></i><b>${a.title}</b><span>${a.organ} · ${strip(a.symptoms[0]).slice(0, 26)}…</span></button>`).join('');
      } else {
        cards = GUT.TOPICS.map((t) => `<button class="libCard" data-topic="${t.id}"><i style="background:${t.color}"></i><b>${t.title}</b><span>${t.tag} · ${strip(t.body[0]).slice(0, 32)}…</span></button>`).join('');
      }
      openModal(`
        <h3 class="mTitle">图鉴 · 每个旋钮都在改什么</h3>
        <p class="mSub">共 ${GUT.EVENTS.length} 个干预事件、${Object.keys(GUT.METRIC_INFO).length} 个生态指标、${S.length} 个物种、${PF.length} 项状态档案、${GUT.AXES.length} 条肠-器官轴、${GUT.TOPICS.length} 篇原理，点击任意卡片查看完整解释</p>
        <div class="libTabs">
          ${tabs.map((t) => `<button class="tabBtn${t.id === cur ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        ${cur === 'psy' ? psyPanel : ''}
        <div class="libGrid">${cards}</div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const body = $('modalBody');
      if (cur === 'psy') mountPsy(body);
      body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => openLibrary(b.dataset.tab)));
      body.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => openEvent(b.dataset.ev)));
      body.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => openMetric(b.dataset.mt)));
      body.querySelectorAll('[data-topic]').forEach((b) => b.addEventListener('click', () => openTopic(GUT.TOPICS.find((t) => t.id === b.dataset.topic))));
      body.querySelectorAll('[data-ax]').forEach((b) => b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.ax])));
      body.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => openSpecies(GUT.SPECIES_INDEX[b.dataset.sp])));
      body.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => openProfileCard(b.dataset.pf)));
    }
    U.openLibrary = openLibrary;

    /* ---------- 玩法说明 · 卡牌切换 ---------- */
    /* 视觉沿用封面：#050A0D 暗底 + 青绿 (#78FFCD / #9FE8DC) 荧光边 + 大字焦点 + 细渐变分割线 */
    const RAIL_CARDS = [
      {
        name: '日记', color: '#FF6B4A',
        art: `<svg viewBox="0 0 100 100" class="railArt">
          <rect x="22" y="18" width="56" height="66" rx="7" fill="#0E2A2B" stroke="#FF6B4A" stroke-width="2"/>
          <rect x="15" y="18" width="10" height="66" rx="4" fill="#12332C" stroke="#FF8A6B" stroke-width="2"/>
          <path d="M34 38h32M34 50h32M34 62h20" stroke="#FFC4B2" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 60l14 14-7 7-14-14z" fill="#F5B944"/><path d="M76 74l4 4" stroke="#F5B944" stroke-width="3" stroke-linecap="round"/>
        </svg>`,
        text: '写下今天吃了什么 → 生成食物插画，拖给小人投喂；也能记三餐 / 睡眠 / 运动，一键看肠道受了多少影响。',
      },
      {
        name: '科普库', color: '#A78BFA',
        art: `<svg viewBox="0 0 100 100" class="railArt">
          <path d="M12 28c13-6 26-6 38 3 12-9 25-9 38-3v44c-13-6-26-6-38 3-12-9-25-9-38-3z" fill="#0E2A2B" stroke="#A78BFA" stroke-width="2"/>
          <path d="M50 31v42" stroke="#A78BFA" stroke-width="2"/>
          <path d="M22 40h17M22 50h17M61 40h17M61 50h17" stroke="#C4B5FD" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
        text: '干预、指标、物种、状态档案、肠-器官轴的分栏图鉴——想深究某个名词，来这里翻。',
      },
      {
        name: '干预', color: '#F5B944',
        art: `<svg viewBox="0 0 100 100" class="railArt">
          <g transform="rotate(-32 50 56)">
            <rect x="16" y="44" width="60" height="24" rx="12" fill="#0E2A2B" stroke="#F5B944" stroke-width="2"/>
            <path d="M46 44v24" stroke="#F5B944" stroke-width="2"/>
          </g>
          <circle cx="76" cy="26" r="6" fill="#FF6B4A"/><circle cx="30" cy="24" r="4" fill="#78FFCD"/>
        </svg>`,
        text: '抗生素疗程、益生元、致病菌暴露等强扰动，一键施加，看生态如何崩塌又重建。',
      },
      {
        name: '环境', color: '#C3E34A',
        art: `<svg viewBox="0 0 100 100" class="railArt">
          <rect x="12" y="20" width="76" height="62" rx="9" fill="#0E2A2B" stroke="#C3E34A" stroke-width="2"/>
          <path d="M24 36h52M24 52h52M24 68h52" stroke="rgba(195,227,74,0.35)" stroke-width="3" stroke-linecap="round"/>
          <circle cx="46" cy="36" r="6" fill="#C3E34A"/><circle cx="66" cy="52" r="6" fill="#78FFCD"/><circle cx="36" cy="68" r="6" fill="#F5B944"/>
        </svg>`,
        text: '膳食纤维、蛋白、压力、睡眠等 7 个滑块——改一项，生态就重新洗牌。',
      },
      {
        name: '历史', color: '#7DD3FC',
        art: `<svg viewBox="0 0 100 100" class="railArt">
          <path d="M12 62h76" stroke="#7DD3FC" stroke-width="3" stroke-linecap="round"/>
          <circle cx="28" cy="62" r="6" fill="#7DD3FC"/><circle cx="52" cy="62" r="6" fill="#F5B944"/><circle cx="76" cy="62" r="6" fill="#34D399"/>
          <path d="M28 56V34h16M52 56V28h16M76 56V40h12" stroke="rgba(125,211,252,0.55)" stroke-width="2" fill="none"/>
        </svg>`,
        text: '每次干预都在时间轴上留下标记，点开就能回看当时到底发生了什么。',
      },
    ];

    /* 卡牌①的肠截面示意图：彩色小点（菌群）+ 外围肠壁组织 + 蓝色扩散圆环 */
    function gutActor(cv) {
      const c = cv.getContext('2d');
      const W = 264, H = 264;
      const DPR = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * DPR; cv.height = H * DPR;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const dots = [];
      for (let i = 0; i < 52; i++) {
        dots.push({
          a: Math.random() * Math.PI * 2,
          r: 10 + Math.random() * 74,
          sp: 0.05 + Math.random() * 0.14,
          col: (S[i % S.length] || { color: '#78FFCD' }).color,
          s: 1.8 + Math.random() * 2.2,
        });
      }
      let raf = 0, run = false, t0 = performance.now();
      function frame(now) {
        if (!run) return;
        const t = (now - t0) / 1000;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        c.clearRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2, R = W / 2 - 6;
        /* 外围肠壁组织：暗红厚墙 + 放射纹理（隐窝与血管） */
        c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
        const g = c.createRadialGradient(cx, cy, R * 0.74, cx, cy, R);
        g.addColorStop(0, '#2A1520'); g.addColorStop(1, '#5A2C3C');
        c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(226,150,165,0.42)'; c.lineWidth = 1.1;
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * (R * 0.79), cy + Math.sin(a) * (R * 0.79));
          c.lineTo(cx + Math.cos(a) * (R * 0.98), cy + Math.sin(a) * (R * 0.98));
          c.stroke();
        }
        /* 上皮细胞层 + 黏液层 */
        c.beginPath(); c.arc(cx, cy, R * 0.745, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(226,150,165,0.5)'; c.lineWidth = 2; c.stroke();
        c.beginPath(); c.arc(cx, cy, R * 0.685, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(62,217,192,0.5)'; c.lineWidth = 9; c.stroke();
        /* 肠腔 */
        c.beginPath(); c.arc(cx, cy, R * 0.63, 0, Math.PI * 2);
        c.fillStyle = '#0E2A2B'; c.fill();
        /* 蓝色扩散圆环：向外扩张 = 药物正在扩散 */
        for (let k = 0; k < 2; k++) {
          const p = (t * 0.32 + k * 0.5) % 1;
          c.beginPath(); c.arc(cx, cy, R * (0.12 + p * 0.52), 0, Math.PI * 2);
          c.strokeStyle = 'rgba(140,205,255,' + (0.45 * (1 - p)).toFixed(3) + ')';
          c.lineWidth = 2; c.stroke();
        }
        /* 彩色小点 = 菌群 */
        dots.forEach((d, i) => {
          const a = d.a + t * d.sp * 0.35, rr = d.r + Math.sin(t * 0.9 + i) * 3;
          c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, d.s, 0, Math.PI * 2);
          c.fillStyle = d.col; c.globalAlpha = 0.95; c.fill(); c.globalAlpha = 1;
        });
        raf = requestAnimationFrame(frame);
      }
      return {
        start() { if (run) return; run = true; t0 = performance.now(); raf = requestAnimationFrame(frame); },
        stop() { run = false; cancelAnimationFrame(raf); },
      };
    }

    function openHelp() {
      openModal(`
        <div class="helpDeck" id="helpDeck">
          <div class="hdTop">
            <span class="hdKicker">GUT SIMULATOR · 玩法</span>
            <i class="hdRule"></i>
            <span class="hdTicks" id="hdTicks"><i class="on"></i><i></i><i></i></span>
            <span class="hdCount" id="hdCount">1 / 3</span>
          </div>

          <div class="hdStage">
            <!-- ① 肠截面 -->
            <div class="hlCard c1 on">
              <div class="hlcArt"><canvas id="hlGutCv"></canvas></div>
              <div class="hlcTxt">
                <span class="hlcChip">① 画面正中央 · 肠腔横截面</span>
                <div class="hlcFocus">彩色小点</div>
                <div class="hlcFocusSub">= 菌群，形状各不同；点它一下，就知道它是谁、爱吃什么</div>
                <div class="hlcMid">外围肠壁组织</div>
                <div class="hlcNote">暗红色厚墙，放射状纹理是隐窝与血管</div>
                <div class="hlcSmall">蓝色扩散圆环</div>
                <div class="hlcNote">只在抗生素暴露时出现，向外扩张 = 药物正在扩散</div>
              </div>
            </div>

            <!-- ② 右侧数据 -->
            <div class="hlCard c2">
              <span class="hlcChip">② 右侧这一栏</span>
              <svg class="hlBig2Art" viewBox="0 0 260 96">
                <circle cx="48" cy="48" r="34" fill="none" stroke="#12332C" stroke-width="13"/>
                <circle cx="48" cy="48" r="34" fill="none" stroke="#78FFCD" stroke-width="13" stroke-linecap="round"
                        stroke-dasharray="150 214" transform="rotate(-90 48 48)"/>
                <rect x="104" y="20" width="140" height="10" rx="5" fill="#12332C"/>
                <rect x="104" y="20" width="96" height="10" rx="5" fill="#2DD4BF"/>
                <rect x="104" y="43" width="140" height="10" rx="5" fill="#12332C"/>
                <rect x="104" y="43" width="62" height="10" rx="5" fill="#F5B944"/>
                <rect x="104" y="66" width="140" height="10" rx="5" fill="#12332C"/>
                <rect x="104" y="66" width="112" height="10" rx="5" fill="#FF6B4A"/>
              </svg>
              <div class="hlBig">右侧这排仪表，是你肠道的<em>实时体检报告</em></div>
              <div class="hlSub">健康度环一转，谁在拖后腿——丁酸不够？屏障变漏？炎症升高？——立刻现形；下方还有菌群占比走势，能一路回看它是怎么变的。</div>
            </div>

            <!-- ③ 左栏五入口（可左右滑动） -->
            <div class="hlCard c3">
              <span class="hlcChip">③ 左栏五个入口 · 左右滑动查看</span>
              <div class="hdSlider">
                <button class="hdSlArrow" id="hdSlPrev" aria-label="上一项">‹</button>
                <div class="hdSlView" id="hdSlView">
                  <div class="hdSlTrack" id="hdSlTrack">
                    ${RAIL_CARDS.map((it) => `
                      <div class="hdSlide">
                        <div class="hdSlideArt" style="--c:${it.color}">${it.art}</div>
                        <div class="hdSlideTxt">
                          <h5 style="color:${it.color}">${it.name}</h5>
                          <p>${it.text}</p>
                        </div>
                      </div>`).join('')}
                  </div>
                </div>
                <button class="hdSlArrow" id="hdSlNext" aria-label="下一项">›</button>
              </div>
              <div class="hdDots" id="hdSlDots">
                ${RAIL_CARDS.map((it, i) => `<i class="hdDot${i === 0 ? ' on' : ''}" data-i="${i}" style="--c:${it.color}"></i>`).join('')}
              </div>
            </div>
          </div>

          <div class="hdBar">
            <button class="hdBtn ghost" id="hdPrev">上一张</button>
            <div class="hdBarMid">
              <button class="hdBtn primary" id="hdNext">下一张 →</button>
              <button class="hdBtn" id="hdDone">开始探索</button>
            </div>
          </div>
        </div>
      `);
      const mc = document.querySelector('.modalCard');
      if (mc) mc.classList.add('hlWide');
      wireHelpDeck();
    }
    U.openHelp = openHelp;

    U.parseMeal = parseMeal;
    U.renderMeals = renderMeals;
    U.openModal = openModal;
    U.closeModal = closeModal;
    U.scoreColor = scoreColor;

    /* 卡牌切换：当前卡「溶解」淡出 → 下一张从右侧飞入 */
    function wireHelpDeck() {
      const deck = $('helpDeck');
      if (!deck) return;
      const cards = [...deck.querySelectorAll('.hlCard')];
      const ticks = [...deck.querySelectorAll('#hdTicks i')];
      const count = $('hdCount');
      const btnPrev = $('hdPrev'), btnNext = $('hdNext'), btnDone = $('hdDone');
      let idx = 0, moving = false;

      /* 卡牌①的示意图动画（注册到 molAnims，关弹窗时自动停） */
      let gutAnim = null;
      const cv = $('hlGutCv');
      if (cv) { gutAnim = gutActor(cv); molAnims.push(gutAnim); }
      const syncArt = () => { if (gutAnim) (idx === 0 ? gutAnim.start() : gutAnim.stop()); };

      function mark(n) {
        idx = n;
        cards.forEach((c, i) => c.classList.toggle('on', i === n));
        ticks.forEach((t, i) => t.classList.toggle('on', i === n));
        if (count) count.textContent = (n + 1) + ' / ' + cards.length;
        if (btnPrev) btnPrev.style.opacity = n === 0 ? '0.35' : '1';
        if (btnNext) btnNext.textContent = n === cards.length - 1 ? '↻ 再看一遍' : '下一张 →';
        syncArt();
      }

      function go(n) {
        if (moving || n === idx || n < 0 || n >= cards.length) return;
        moving = true;
        const dir = n > idx ? 1 : -1;
        const cur = cards[idx], next = cards[n];
        cur.classList.remove('enter', 'enterL');
        cur.classList.add('leave');            /* 逐渐溶解 */
        setTimeout(() => {
          cur.classList.remove('leave', 'on', 'enter', 'enterL');
          next.classList.add('on');
          next.classList.remove('enter', 'enterL');
          void next.offsetWidth;               /* 强制重排，让飞入动画重播 */
          next.classList.add(dir > 0 ? 'enter' : 'enterL');
          mark(n);
          moving = false;
        }, 420);
      }

      if (btnNext) btnNext.addEventListener('click', () => go(idx === cards.length - 1 ? 0 : idx + 1));
      if (btnPrev) btnPrev.addEventListener('click', () => go(idx - 1));
      if (btnDone) btnDone.addEventListener('click', closeModal);
      ticks.forEach((t, i) => t.addEventListener('click', () => go(i)));
      mark(0);

      /* 卡牌③内部：五个入口左右滑动 */
      const track = $('hdSlTrack'), view = $('hdSlView');
      if (track && view) {
        const slides = [...track.children];
        const dots = [...deck.querySelectorAll('#hdSlDots .hdDot')];
        let si = 0;
        const slideTo = (i) => {
          si = Math.max(0, Math.min(slides.length - 1, i));
          track.style.transform = 'translateX(' + (-si * 100) + '%)';
          dots.forEach((d, k) => d.classList.toggle('on', k === si));
        };
        $('hdSlPrev').addEventListener('click', () => slideTo(si - 1));
        $('hdSlNext').addEventListener('click', () => slideTo(si + 1));
        dots.forEach((d) => d.addEventListener('click', () => slideTo(Number(d.dataset.i))));
        /* 鼠标拖拽 / 触屏滑动 */
        let down = false, x0 = 0;
        view.addEventListener('pointerdown', (e) => { down = true; x0 = e.clientX; });
        view.addEventListener('pointerup', (e) => {
          if (!down) return;
          down = false;
          const dx = e.clientX - x0;
          if (Math.abs(dx) > 40) slideTo(si + (dx < 0 ? 1 : -1));
        });
        view.addEventListener('pointercancel', () => { down = false; });
        slideTo(0);
      }
    }

    /* ---------- 全屏欢迎页：GUT · MICROBIOTA · SIMULATOR ---------- */
    /* 黑底 + 白色发光粒子勾勒的大肠杆菌（超椭圆胶囊轮廓 + 核质 + 质粒环 + 鞭毛），
       周围三圈椭圆水波纹缓慢扩散；点 GET START 后淡出并弹出主图结构解释 */
    /* 展览用：地址栏带 ?welcome=1 时，即使本次会话已看过也重新显示初始页 */
    function _forceWelcome() {
      try { return /(?:\?|&)welcome=1(?:&|$)/.test(window.location.search || ''); } catch (e) { return false; }
    }

    function initWelcome() {
      const layer = $('welcome');
      const cv = $('welcomeCv');
      if (!layer || !cv) return;
      let welcomed = false;
      try { welcomed = !!sessionStorage.getItem('gut_welcomed'); } catch (e) {}
      if (welcomed && !(_forceWelcome())) { layer.remove(); return; }

      const c = cv.getContext('2d');
      let W = 0, H = 0, DPR = 1, raf = 0, running = true;
      const t0 = performance.now();
      const ORI = { n: 5, a: 168, b: 74, rot: -0.52, cx: 0, cy: 0 };
      let outline = [], core = [], plasmids = [], flags = [], drift = [];

      function build() {
        const narrow = W < 900;
        ORI.cx = narrow ? W * 0.5 : W * 0.66;
        ORI.cy = narrow ? H * 0.34 : H * 0.5;
        const sc = Math.min(1, Math.min(W, H) / 640);
        ORI.a = 168 * sc; ORI.b = 74 * sc;
        outline = []; core = []; plasmids = []; flags = []; drift = [];
        for (let i = 0; i < 72; i++) {
          outline.push({ th: (i / 72) * Math.PI * 2, ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.9 });
        }
        for (let i = 0; i < 26; i++) {
          const a2 = Math.random() * 6.28, r2 = Math.sqrt(Math.random()) * 0.62;
          core.push({ u: Math.cos(a2) * r2, v: Math.sin(a2) * r2, ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
        }
        for (let i = 0; i < 3; i++) {
          plasmids.push({ u: (Math.random() - 0.5) * 0.9, v: (Math.random() - 0.5) * 0.8, r: 10 + Math.random() * 14, ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.5 });
        }
        for (let i = 0; i < 3; i++) {
          flags.push({ dy: (i - 1) * 16, ph: Math.random() * 6.28, amp: 9 + Math.random() * 7, len: 120 + Math.random() * 60 });
        }
        for (let i = 0; i < 44; i++) {
          drift.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.4, sp: 0.1 + Math.random() * 0.3, ph: Math.random() * 6.28 });
        }
      }

      function resize() {
        W = window.innerWidth; H = window.innerHeight;
        DPR = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
        build();
      }

      /* 超椭圆参数化：|x/a|^n + |y/b|^n = 1，n≈5 时接近胶囊（杆状菌）形 */
      function spoint(th) {
        const co = Math.cos(th), si = Math.sin(th), e = 2 / ORI.n;
        return {
          x: ORI.a * Math.sign(co) * Math.pow(Math.abs(co), e),
          y: ORI.b * Math.sign(si) * Math.pow(Math.abs(si), e),
        };
      }
      function rot(x, y) {
        const cs = Math.cos(ORI.rot), sn = Math.sin(ORI.rot);
        return { x: ORI.cx + x * cs - y * sn, y: ORI.cy + x * sn + y * cs };
      }
      function glowDot(x, y, r, alpha) {
        c.globalAlpha = alpha;
        c.shadowColor = 'rgba(170,255,235,0.95)';
        c.shadowBlur = 10;
        c.fillStyle = '#F4FCFA';
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1; c.shadowBlur = 0;
      }

      function frame(now) {
        if (!running) return;
        if (!document.body.contains(cv)) { running = false; return; }
        const t = (now - t0) / 1000;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        c.fillStyle = '#050A0D';
        c.fillRect(0, 0, W, H);

        /* 背景漂浮微粒 */
        drift.forEach((d) => {
          const x = (d.x * W + Math.sin(t * d.sp + d.ph) * 14 + W) % W;
          const y = (d.y * H + Math.cos(t * d.sp * 0.7 + d.ph) * 10 + H) % H;
          c.globalAlpha = 0.12 + 0.1 * Math.sin(t * d.sp * 2 + d.ph);
          c.fillStyle = '#BFE9E0';
          c.beginPath(); c.arc(x, y, d.r, 0, 6.28); c.fill();
        });
        c.globalAlpha = 1;

        /* 水波纹：三圈椭圆环循环向外扩散 */
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.22 + i / 3) % 1;
          const rr = 1 + ph * 1.15;
          c.save();
          c.translate(ORI.cx, ORI.cy); c.rotate(ORI.rot);
          c.strokeStyle = 'rgba(130,215,235,' + (0.16 * (1 - ph)).toFixed(3) + ')';
          c.lineWidth = 1.1;
          c.beginPath();
          c.ellipse(0, 0, ORI.a * 1.15 * rr, ORI.b * 1.5 * rr, 0, 0, 6.28);
          c.stroke();
          c.restore();
        }

        /* 鞭毛：从菌体右端伸出，随时间摆动 */
        c.strokeStyle = 'rgba(226,250,244,0.6)';
        c.lineWidth = 1.2;
        c.shadowColor = 'rgba(170,255,235,0.8)'; c.shadowBlur = 7;
        flags.forEach((f) => {
          c.beginPath();
          for (let k = 0; k <= 1.001; k += 1 / 22) {
            const lx = ORI.a * 0.96 + f.len * k;
            const ly = f.dy + Math.sin(k * 7.2 + t * 3.2 + f.ph) * f.amp * k;
            const pt = rot(lx, ly);
            if (k === 0) c.moveTo(pt.x, pt.y); else c.lineTo(pt.x, pt.y);
          }
          c.stroke();
        });
        c.shadowBlur = 0;

        /* 菌体轮廓：一圈发光粒子，各自漂移 + 闪烁 */
        outline.forEach((o) => {
          const p0 = spoint(o.th);
          const jx = Math.sin(t * o.sp + o.ph) * 3.2;
          const jy = Math.cos(t * o.sp * 0.8 + o.ph) * 3.2;
          const pt = rot(p0.x + jx, p0.y + jy);
          const tw = 0.72 + 0.28 * Math.sin(t * 2.2 * o.sp + o.ph * 3);
          glowDot(pt.x, pt.y, 1.5 + tw * 0.9, 0.55 + 0.4 * tw);
        });

        /* 核质区：中心漂浮的小粒子 */
        core.forEach((d) => {
          const lx = d.u * ORI.a + Math.sin(t * d.sp + d.ph) * 5;
          const ly = d.v * ORI.b + Math.cos(t * d.sp * 0.9 + d.ph) * 5;
          const pt = rot(lx, ly);
          c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 1.8 * d.sp + d.ph);
          c.fillStyle = 'rgba(214,246,240,0.9)';
          c.beginPath(); c.arc(pt.x, pt.y, 1.2, 0, 6.28); c.fill();
        });
        c.globalAlpha = 1;

        /* 质粒小环 */
        c.strokeStyle = 'rgba(159,232,220,0.4)';
        c.lineWidth = 1;
        plasmids.forEach((pl) => {
          const pt = rot(pl.u * ORI.a, pl.v * ORI.b);
          c.save(); c.translate(pt.x, pt.y); c.rotate(t * pl.sp + pl.ph);
          c.beginPath(); c.ellipse(0, 0, pl.r, pl.r * 0.62, 0, 0, 6.28); c.stroke();
          c.restore();
        });

        raf = requestAnimationFrame(frame);
      }

      resize();
      window.addEventListener('resize', resize);
      raf = requestAnimationFrame(frame);

      const btn = $('welcomeStart');
      if (btn) btn.addEventListener('click', () => {
        try { sessionStorage.setItem('gut_welcomed', '1'); } catch (e) {}
        layer.classList.add('gone');
        setTimeout(() => { running = false; cancelAnimationFrame(raf); layer.remove(); }, 720);
        setTimeout(() => openHelp(), 480);
      });
    }
    U.initWelcome = initWelcome;

    U.openWelcome = function () {
      openModal(`
        <span class="mTag" style="color:#2DD4BF;border-color:#2DD4BF66;background:#2DD4BF12">WELCOME</span>
        <h3 class="mTitle">欢迎来到你的肠道</h3>
        <p class="mSub">这是一个可以亲手拨动的肠道微生态沙盒</p>
        <p class="mLead">画面中央是<b>结肠横截面</b>：外圈暖色是肠壁与绒毛，青绿色的半透明带是<b>黏液层</b>，中间流动的彩色小点就是<b>菌群</b>——不同颜色和形状代表不同物种。</p>
        <div class="mSect"><h4>三件可以马上做的事</h4><p>① 点一下画布里的任意菌体，看它是谁、喜欢吃什么；<br>② 把左侧「膳食纤维」拉到 0，观察黏液层与屏障的变化；<br>③ 点击「抗生素疗程」，看一个生态系统如何崩塌又重建。</p></div>
        <div class="libGrid">
          <button class="libCard" id="wcHelp"><i style="background:#2DD4BF"></i><b>玩法说明</b><span>滑块、事件、指标分别代表什么</span></button>
          <button class="libCard" id="wcLib"><i style="background:#A78BFA"></i><b>科普库</b><span>短链脂肪酸、肠屏障、粪菌移植…</span></button>
          <button class="libCard" id="wcPf"><i style="background:#F472B6"></i><b>填写我的状态档案</b><span>糖尿病、压力、睡眠、经期…都会改变菌群</span></button>
          <button class="libCard" id="wcAx"><i style="background:#7DD3FC"></i><b>肠-器官轴</b><span>脑、肝、肺、皮肤…肠道如何远程影响它们</span></button>
          <button class="libCard" id="wcDy"><i style="background:#FF6B4A"></i><b>写我的档案（日记本）</b><span>记三餐 / 心情 / 压力 / 睡眠，一键分析</span></button>
        </div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      $('wcHelp').addEventListener('click', openHelp);
      $('wcLib').addEventListener('click', openLibrary);
      $('wcAx').addEventListener('click', () => openLibrary('ax'));
      $('wcDy').addEventListener('click', () => openDiary());
      $('wcPf').addEventListener('click', () => {
        closeModal();
        const sec = document.querySelector('.block-profile');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('pfInput');
        if (inp) { inp.focus(); inp.classList.add('flash'); setTimeout(() => inp.classList.remove('flash'), 1200); }
        U.toast('写下你的状态，例如：糖尿病 压力大 熬夜 经期');
      });
    };

    /* 情境科普弹窗（一次性） */
    const TRIGGERS = [
      { id: 'abxStart', when: () => sim.abxLevel > 0.3, topic: 'abx', text: '抗生素已经开始清场。注意看：敏感菌在数小时内大量消失，多样性骤降。' },
      { id: 'inflamHigh', when: () => sim.inflammation > 0.6, topic: 'barrier', text: '炎症进入高位。屏障变薄、丁酸下降，会让促炎菌更容易扩张——这是一个正反馈。' },
      { id: 'cdiffBloom', when: () => sim.n[IX.cdiff] / Math.max(sim.total, 1e-9) > 0.05, topic: 'fmt', text: '艰难拟梭菌爆发了。它并不是"变强了"，而是竞争对手和定植抵抗消失了。' },
      { id: 'barrierLow', when: () => sim.barrier < 0.28, topic: 'barrier', text: '肠屏障严重受损。黏液层变薄 + 丁酸匮乏，通常意味着菌群已经转向"啃食"宿主黏液。' },
      { id: 'diversityLow', when: () => sim.diversity < 0.45, topic: 'fiber', text: '多样性崩塌。此时生态系统很脆弱，恢复需要持续的膳食纤维与时间。' },
      { id: 'butyrateHigh', when: () => sim.butyrate > 0.85, topic: 'scfa', text: '丁酸进入高位。丁酸是结肠上皮细胞的首选燃料，也是抗炎信号分子——这正是高纤维饮食的价值。' },
    ];
    function checkTriggers() {
      if (!modalRoot.hidden) return;
      for (const t of TRIGGERS) {
        if (U.flags[t.id]) continue;
        if (t.when()) {
          U.flags[t.id] = true;
          const topic = GUT.TOPICS.find((x) => x.id === t.topic);
          openTopic({ ...topic, title: '发生了什么 · ' + topic.title, body: [`<b>${t.text}</b>`, ...topic.body] });
          break;
        }
      }
    }

    /* ============ Toast ============ */
    let toastTimer = null;
    U.toast = function (msg) {
      const el = $('toast');
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), 2600);
    };

    /* ============ 每帧刷新 ============ */
    let last = 0;
    U.update = function (force) {
      const now = performance.now();
      if (!force && now - last < 120) return;
      last = now;
      pushHistory();

      // chips
      CHIPS.forEach((c, i) => {
        const v = clamp(c.get(), 0, 1);
        const el = chipEls[i];
        el.querySelector('b').textContent = c.fmt(v);
        el.querySelector('b').style.color = toneColor(v, c.invert);
        el.querySelector('small').textContent = c.note();
      });

      // HUD
      const topDay = $('topDay');
      if (topDay) topDay.textContent = '第 ' + sim.day.toFixed(1) + ' 天';
      $('hudPH').textContent = sim.pH.toFixed(2);
      $('hudTransit').textContent = (72 - sim.env.motility * 0.58).toFixed(0) + ' h';
      $('hudTotal').textContent = cfu(sim.total) + ' CFU/g';
      $('hudEntero').textContent = '肠型：' + (sim.enterotype ? sim.enterotype.label : '—');
      $('abxBadge').classList.toggle('on', sim.abxLevel > 0.03);

      // 指标
      const total = Math.max(sim.total, 1e-9);
      METRICS.forEach((m, i) => {
        const v = clamp(m.get(), 0, 1);
        const el = metricEls[i];
        el.querySelector('b').textContent = (v * 100).toFixed(0) + '%';
        el.querySelector('b').style.color = toneColor(v, m.invert);
        const f = el.querySelector('.mFill');
        f.style.width = (v * 100).toFixed(1) + '%';
        f.style.background = toneColor(v, m.invert);
      });

      // 健康度
      const health = GUT.healthOf(sim);
      const ring = $('ring');
      ring.style.setProperty('--pct', (health * 100).toFixed(1));
      ring.style.setProperty('--ringc', toneColor(health));
      $('ringVal').textContent = (health * 100).toFixed(0);
      $('ringVal').style.color = toneColor(health);
      $('ringLab').textContent =
        health > 0.75 ? '稳态 · 健康' : health > 0.55 ? '轻度失调' : health > 0.35 ? '明显失调' : '严重失调';
      $('healthNote').textContent =
        health > 0.75 ? '多样性、屏障与丁酸都在健康区间，生态较稳定。'
          : health > 0.55 ? '生态出现波动，通常通过调整膳食纤维可以回升。'
            : health > 0.35 ? '生态失衡明显：多样性下降、屏障变薄、炎症升高。'
              : '生态濒临崩溃：考虑益生元干预或粪菌移植。';
      $('miniMetrics').innerHTML =
        `<div class="miniItem">总量 ${cfu(sim.total)}</div>` +
        `<div class="miniItem">pH ${sim.pH.toFixed(2)}</div>` +
        `<div class="miniItem">SCFA ${(clamp(sim.scfa, 0, 1) * 100).toFixed(0)}%</div>`;

      // 堆叠条
      let maxSh = 0.001;
      const sh = sim.n.map((v) => v / total);
      S.forEach((sp, i) => (stackBars[i].style.width = (sh[i] * 100).toFixed(2) + '%'));

      // 物种列表
      if (spRows.length) S.forEach((sp, i) => {
        const row = spRows[i];
        row.querySelector('.spPct').textContent = sh[i] < 0.0005 ? '<0.1%' : (sh[i] * 100).toFixed(1) + '%';
        row.querySelector('.spBar i').style.width = clamp((sh[i] / 0.4) * 100, 0, 100) + '%';
        row.title = `${sp.latin} · ${ROLE_TEXT[sp.role]}`;
        if (sh[i] > maxSh) maxSh = sh[i];
      });

      // 详情
      if (U.selected != null && U.selected >= 0 && $('detail')) {
        const i = U.selected, sp = S[i];
        const old = U.history.length > 4 ? U.history[Math.max(0, U.history.length - 5)] : null;
        const oldSh = old ? old.n[i] / Math.max(old.n.reduce((a, b) => a + b, 0), 1e-9) : sh[i];
        const d = sh[i] - oldSh;
        $('detail').innerHTML = `
          <div class="dHead">
            <i style="background:${sp.color}"></i>
            <b>${sp.name}</b>
            <span class="role" style="color:${ROLE_COLOR[sp.role]};border-color:${ROLE_COLOR[sp.role]}55">${ROLE_TEXT[sp.role]}</span>
          </div>
          <div class="dGrid">
            <div><span>相对丰度</span><b style="color:${sp.color}">${(sh[i] * 100).toFixed(1)}%</b></div>
            <div><span>绝对量</span><b>${cfu(sim.n[i])}</b></div>
            <div><span>2 天趋势</span><b style="color:${d > 0.002 ? '#34D399' : d < -0.002 ? '#FF6B4A' : '#93aeb4'}">${d > 0.002 ? '↑' : d < -0.002 ? '↓' : '→'} ${Math.abs(d * 100).toFixed(2)}pp</b></div>
            <div><span>最适 pH</span><b>${sp.phOpt.toFixed(1)}</b></div>
          </div>
          <p class="dNote">${sp.sci.headline}</p>
          <button class="dBtn" id="dBtnMore">查看完整科普卡片</button>
        `;
        $('dBtnMore').addEventListener('click', () => openSpecies(i));
      }

      // 时间轴
      renderMeals();
      renderTimeline();
      checkTriggers();
      const dBar = $('digestBar');
      if (dBar) dBar.hidden = !(U.digesting || sim.pending);
      drawTrendTick();
      drawPetTick();
    };

    function renderTimeline() {
      const span = 50;
      const start = Math.max(0, sim.day - 45);
      const track = $('tlTrack');
      const want = [];
      sim.events.forEach((e, i) => {
        if (e.day >= start - 1) want.push({ e, i });
      });
      want.splice(0, Math.max(0, want.length - 14));
      track.innerHTML = want
        .map(({ e, i }) => {
          const x = clamp(((e.day - start) / span) * 100, 0, 99);
          return `<div class="tlMark ${e.tone}" data-i="${i}" title="点击查看这个事件至今的变化" style="left:${x}%">D${e.day.toFixed(0)} ${e.label}</div>`;
        })
        .join('');
      const ticks = [];
      for (let i = 0; i <= 4; i++) ticks.push((start + (span * i) / 4).toFixed(0) + 'd');
      $('tlScale').innerHTML = ticks.map((t) => `<span>${t}</span>`).join('');
      $('tlLog').innerHTML = sim.log
        .slice(0, 10)
        .map((l) => `<div class="${l.tone}"><b>D${l.day.toFixed(1)}</b> ${l.text}</div>`)
        .join('');
    }

    buildChips();
    buildEnv();
    buildEvents();
    buildTools();
    buildMetrics();
    buildHudLinks();
    buildTimelineLinks();
    buildStack();
    buildSideNav();
    initPet();
    initTrend();

    return U;
  };
})(typeof window !== 'undefined' ? window : globalThis);
