/* ================================================================
   工作台原型 · 交互
   只做"能点得动"的部分，不接任何真实数据。
   ================================================================ */

(function () {
  'use strict';

  /* ---------- 日间 / 夜间 ---------- */
  var root = document.documentElement;
  var btnTheme = document.getElementById('btn-theme');

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    btnTheme.textContent = t === 'dark' ? '☾' : '☀';
    btnTheme.title = t === 'dark' ? '切到日间' : '切到夜间';
  }
  btnTheme.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('proto-theme', next); } catch (e) { /* file:// 下可能不让存，无所谓 */ }
  });

  var saved = 'light';
  try { saved = localStorage.getItem('proto-theme') || 'light'; } catch (e) {}
  // 网址后面加 ?theme=dark 直接进夜间（方便截图/发给别人看）
  if (location.search.indexOf('theme=dark') >= 0) saved = 'dark';
  applyTheme(saved);

  /* ---------- 标注新增 ---------- */
  var btnAnn = document.getElementById('btn-annotate');
  var alBtn = document.getElementById('al-btn');
  var alPanel = document.getElementById('anno-legend');
  function setAnnotate(on) {
    document.body.classList.toggle('annotate', on);
    btnAnn.classList.toggle('on', on);
    btnAnn.textContent = on ? '退出' : '标注';
    alBtn.classList.toggle('hide', !on);
    if (!on) { alPanel.classList.add('hide'); alBtn.textContent = '图例'; }
  }
  btnAnn.addEventListener('click', function () {
    setAnnotate(!document.body.classList.contains('annotate'));
  });
  // 网址后面加 ?annotate 直接进标注模式（方便直接发给别人看）
  if (location.search.indexOf('annotate') >= 0) setAnnotate(true);

  /* ---------- 右栏整体折叠 ---------- */
  var shell = document.getElementById('shell');
  document.getElementById('btn-rail').addEventListener('click', function () {
    shell.classList.toggle('rail-collapsed');
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 左栏：分组只是前端归纳，会话互相独立 ---------- */
  var sbList = document.querySelector('.sb-list');
  var menu = document.getElementById('sess-menu');
  var menuSess = null;

  function groupEl(name) {
    return sbList.querySelector('.proj[data-group="' + name + '"]');
  }
  function allGroups() {
    return [].slice.call(sbList.querySelectorAll('.proj[data-group]'))
      .map(function (g) { return g.dataset.group; })
      .filter(function (n) { return n !== '已归档'; });
  }
  function updateCounts() {
    sbList.querySelectorAll('.proj[data-group]').forEach(function (g) {
      var n = g.querySelectorAll('.sess').length;
      g.querySelector('.proj-cnt').textContent = n;
      if (g.dataset.group === '已归档') g.classList.toggle('hide', n === 0);
    });
  }
  function setActive(sess) {
    sbList.querySelectorAll('.sess').forEach(function (x) { x.classList.remove('is-active'); });
    sess.classList.add('is-active');
  }
  function toggleGroup(g) {
    var open = g.classList.toggle('is-open');
    g.querySelector('.chev').textContent = open ? '▾' : '▸';
  }
  function moveTo(sess, name) {
    var g = groupEl(name);
    if (!g || !sess) return;
    g.querySelector('.proj-bd').appendChild(sess);
    g.classList.add('is-open');
    g.querySelector('.chev').textContent = '▾';
    updateCounts();
  }

  /* 会话「⋯」菜单 */
  function renderMain() {
    menu.innerHTML =
      '<button class="menu-i" data-act="rename">重命名</button>' +
      '<button class="menu-i" data-act="archive">归档</button>' +
      '<button class="menu-i" data-act="move">移动至某分组<span class="menu-arrow">›</span></button>';
  }
  function renderGroups() {
    var html = '<button class="menu-i dim" data-act="back">‹ 返回</button><div class="menu-sep"></div>';
    allGroups().forEach(function (n) {
      html += '<button class="menu-i" data-act="to" data-to="' + esc(n) + '">' + esc(n) + '</button>';
    });
    menu.innerHTML = html;
  }
  function openMenuAt(btn) {
    menuSess = btn.closest('.sess');
    renderMain();
    menu.classList.remove('hide');
    var r = btn.getBoundingClientRect();
    var w = menu.offsetWidth, h = menu.offsetHeight;
    var left = Math.min(r.right - w + 8, window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - h - 6;   // 下面放不下就往上弹
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }
  function closeMenu() { menu.classList.add('hide'); menuSess = null; }

  function startRename(sess) {
    var span = sess && sess.querySelector('.sess-name');
    if (!span) return;
    var old = span.textContent;
    var inp = document.createElement('input');
    inp.className = 'sess-input';
    inp.value = old;
    span.replaceWith(inp);
    inp.focus(); inp.select();
    var done = false;
    function finish(ok) {
      if (done) return; done = true;
      var el = document.createElement('span');
      el.className = 'sess-name';
      el.textContent = (ok && inp.value.trim()) || old;
      if (inp.parentNode) inp.replaceWith(el);
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    inp.addEventListener('blur', function () { finish(true); });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  sbList.addEventListener('click', function (e) {
    var more = e.target.closest('.sess-more');
    if (more) { e.stopPropagation(); openMenuAt(more); return; }
    var hd = e.target.closest('.proj-hd');
    if (hd) { toggleGroup(hd.closest('.proj')); return; }
    var sess = e.target.closest('.sess');
    if (sess) { setActive(sess); syncFloatPanel(); showView('session'); }
  });
  menu.addEventListener('click', function (e) {
    e.stopPropagation();
    var b = e.target.closest('.menu-i');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'move') return renderGroups();
    if (act === 'back') return renderMain();
    if (act === 'to') { moveTo(menuSess, b.dataset.to); return closeMenu(); }
    if (act === 'archive') { moveTo(menuSess, '已归档'); return closeMenu(); }
    if (act === 'rename') { var s = menuSess; closeMenu(); startRename(s); }
  });
  document.addEventListener('click', function () { if (menuSess) closeMenu(); });
  sbList.addEventListener('scroll', closeMenu);
  window.addEventListener('resize', closeMenu);
  updateCounts();

  /* ---------- ＋ 新会话：按上面选的客户自动归组 ---------- */
  function makeGroup(name) {
    // 照着现成的第一个组复制一个壳（别用「已归档」，它是空的特殊组）
    var proto = sbList.querySelector('.proj[data-group]:not(#grp-archived)');
    var g = proto.cloneNode(true);
    g.dataset.group = name;
    g.removeAttribute('id');
    g.querySelector('.proj-name').textContent = name;
    g.querySelector('.proj-bd').innerHTML = '';
    g.classList.add('is-open');
    g.querySelector('.chev').textContent = '▾';
    sbList.insertBefore(g, groupEl('已归档'));
    return g;
  }
  // 在某客户组下开一条新会话
  function spawnSession(name) {
    var group = clientVal();
    var g = groupEl(group) || makeGroup(group);       // 新建的客户，第一次发送时自动开一个组
    var sess = document.createElement('div');
    sess.className = 'sess';
    sess.innerHTML = '<span class="sess-name"></span><button class="sess-more" title="更多">⋯</button>';
    sess.querySelector('.sess-name').textContent = name;
    g.querySelector('.proj-bd').insertBefore(sess, g.querySelector('.proj-bd').firstChild);
    g.classList.add('is-open');
    g.querySelector('.chev').textContent = '▾';
    setActive(sess);
    updateCounts();
    sess.scrollIntoView({ block: 'nearest' });
    syncFloatPanel();
  }
  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  // 会话标题：日期 · 类型 · 数量
  // 勾了多类叫「混合」；一类没选但挂了参考就叫「仿写」；都没有叫「其他」
  function sessionTypeLabel() {
    if (types.length > 1) return '混合';
    if (types.length === 1) return types[0];
    return refCount() ? '仿写' : '其他';
  }
  function sessionCount() {
    if (mode === 'weak') return picked.length || null;
    return refCount() || null;     // 自己说：还不知道要写几篇，除非挂了参考
  }
  function sessionNameFor() {
    var base = today() + ' · ' + sessionTypeLabel() +
               ' · ' + (sessionCount() ? sessionCount() + ' 篇' : '待定');
    var taken = [].slice.call(sbList.querySelectorAll('.sess-name')).map(function (x) { return x.textContent; });
    var name = base, n = 2;
    while (taken.indexOf(name) >= 0) { name = base + ' (' + n + ')'; n++; }
    return name;
  }

  /* ================================================================
     装配台
     两个维度，别混在一起：
       写什么 —— 薄弱问句 / 自己说，二选一（选题从哪来）
       怎么写 —— 参考文章，可选可叠加（写法照着谁）
     挂上参考 = 仿写，所以「仿写」不再是一种模式，也不再是一种文章类型。
     ================================================================ */

  var asm = document.getElementById('asm');
  var cpText = document.getElementById('cp-text');
  var mode = 'weak';

  /* ---------- 给谁写 ---------- */
  var selClient = document.getElementById('sel-client');
  var selLine = document.getElementById('sel-line');
  var selTerm = document.getElementById('sel-term');

  function clientVal() { return selClient.value; }
  function clientTrio() { return [selClient.value, selLine.value, selTerm.value]; }

  [selClient, selLine, selTerm].forEach(function (el) {
    el.addEventListener('change', function () {
      ctxOff = false;
      syncSheetSub();
      afterChange();
    });
  });

  // 新建客户：按钮就地变成输入框，回车确定 / Esc 取消（跟左栏重命名同一套做法）
  var btnNewClient = document.getElementById('btn-new-client');
  btnNewClient.addEventListener('click', function () {
    var inp = document.createElement('input');
    inp.className = 'ah-input';
    inp.placeholder = '客户名…';
    btnNewClient.replaceWith(inp);
    inp.focus();
    var done = false;
    function finish(ok) {
      if (done) return; done = true;
      var name = inp.value.trim();
      if (ok && name) {
        var op = document.createElement('option');
        op.textContent = name;
        selClient.appendChild(op);
        selClient.value = name;
        ctxOff = false;
        syncSheetSub();
        afterChange();
      }
      if (inp.parentNode) inp.replaceWith(btnNewClient);
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', function () { finish(true); });
  });

  /* ---------- 主题：二选一 ---------- */
  var srcTabs = [].slice.call(document.querySelectorAll('.src-tab'));

  // 自己说的时候，输入框就是工作区那一大块 —— 同一个 textarea 搬过去，不复制，
  // 打了一半的字切模式也不会丢
  function setMode(m) {
    mode = m;
    asm.classList.toggle('m-weak', m === 'weak');
    asm.classList.toggle('m-free', m === 'free');
    srcTabs.forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === m); });
    applyPlaceholder();
    ctxOff = false;
    afterChange();
  }
  srcTabs.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); autoGrow(); });
  });

  function applyPlaceholder() {
    var other = refCount() && copyStyle() === '其他';
    if (mode === 'free') {
      cpText.placeholder = other
        ? '想写什么？顺便说说想怎么仿（比如：只借开头、换行业保留句式）…'
        : '想写什么？主题、角度、要覆盖的点，随便说…（Enter 发送）';
    } else {
      cpText.placeholder = other
        ? '说说想怎么仿（比如：只借开头、换行业保留句式）…'
        : '补充要求（选填）…';
    }
    // 选「其他」→ 高亮最下面那个输入区，光标也放过去，直接在那儿写
    var host = cpText.closest('.cp-box') || cpText.closest('.free-block');
    if (host) host.classList.toggle('hl', !!other);
    if (other) { try { cpText.focus(); } catch (e) {} }
  }

  /* ---------- 文章类型 ＝「怎么写 · 用模板」里那排标签 ---------- */
  var TYPES = ['老榜单','测评排行榜','选型决策','单品牌论证','科普问答','价格对比',
    '口碑盘点','避坑指南','医生专访','案例复盘','行业趋势','政策解读','FAQ 合集',
    '品牌故事','术后护理','材料对比','儿童齿科指南','团购攻略'];
  var COMMON = 8;                  // 前 8 个常用，剩下的收进「更多」
  var types = ['老榜单'];
  var typesOpen = false;

  var chipsEl = document.getElementById('chips-type');
  var btnMore = document.getElementById('btn-more');

  function renderChips() {
    chipsEl.innerHTML = TYPES.map(function (t, i) {
      return '<button class="chip2' + (i >= COMMON ? ' extra' : '') +
             (types.indexOf(t) >= 0 ? ' is-on' : '') + '">' + esc(t) + '</button>';
    }).join('');
    chipsEl.querySelectorAll('.chip2').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = types.indexOf(b.textContent);
        if (k >= 0) types.splice(k, 1); else types.push(b.textContent);
        b.classList.toggle('is-on', k < 0);
        ctxOff = false;
        renderRefs(); afterChange();
      });
    });
  }
  function syncMore() {
    chipsEl.classList.toggle('expanded', typesOpen);
    var hidden = TYPES.slice(COMMON).filter(function (t) { return types.indexOf(t) < 0; }).length;
    btnMore.textContent = typesOpen ? '收起 ▴' : '更多 ' + hidden + ' ▾';
  }
  btnMore.addEventListener('click', function () { typesOpen = !typesOpen; syncMore(); });

  function typesText() {
    if (!types.length) return '';
    return types.length === 1 ? types[0] : types.length + ' 类文章';
  }

  /* ---------- 怎么写：两个标签页 —— 仿写 / 用模板 ----------
     「用模板」里就是上面那排文章类型，不再另外编一套假 skill。
     标签页只切显示，不互斥：挂了参考、又选了 skill，两个一起生效。 */
  var refbox = document.getElementById('refbox');
  var refBd = document.getElementById('ref-bd');
  var refChev = document.getElementById('ref-chev');
  var refText = document.getElementById('ref-text');
  var refListEl = document.getElementById('ref-list');
  var refSum = document.getElementById('ref-sum');
  var refFiles = [];
  var refOpen = false;

  var btnFile = document.getElementById('btn-file');
  var refTabs = [].slice.call(document.querySelectorAll('.ref-tab'));
  var refPanes = [].slice.call(document.querySelectorAll('.ref-pane'));
  var refTab = 'copy';

  function setRefTab(t) {
    refTab = t;
    refTabs.forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === t); });
    refPanes.forEach(function (p) { p.classList.toggle('hide', p.dataset.pane !== t); });
    // 切到「仿写」页 = 这次是照着别人的写，文章类型那套自动让位（选的就清掉）
    if (t === 'copy' && types.length) {
      types = [];
      renderChips();
      typesOpen = false;
      renderRefs();
    }
    ctxOff = false;         // 动一下就让它重新出现（跟别处一致）
    afterChange();          // 标签内容跟着「在仿写页 / 不在仿写页」变
  }
  refTabs.forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();              // 别把折叠一起点了
      setRefTab(b.dataset.tab);
      if (!refOpen) setRefOpen(true);
    });
  });

  var URL_RE = /^(https?:\/\/|www\.)\S+$/i;
  function refLines() {
    return refText.value.split(/\r?\n/).map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }
  function refUrls() { return refLines().filter(function (s) { return URL_RE.test(s); }); }
  function refBody() { return refLines().filter(function (s) { return !URL_RE.test(s); }).join('\n'); }
  function refBodyLen() { return refBody().replace(/\s/g, '').length; }
  // 一堆链接 + 一整篇粘进来的正文 + 选的文件，一起算「挂了几篇参考」
  function refCount() { return refUrls().length + refFiles.length + (refBodyLen() ? 1 : 0); }

  function copyStyle() {
    return document.querySelector('#copy-style .seg2-b.is-on').textContent;
  }
  // 收起来的时候，这一行要能把两个标签页里挂了什么都说清楚
  function refSumText() {
    var p = [];
    var n = refUrls().length;
    if (n) p.push(n + ' 个链接');
    if (refBodyLen()) p.push('正文 ' + refBodyLen() + ' 字');
    if (refFiles.length) p.push(refFiles.length + ' 个文件');
    var copy = p.length ? p.join(' · ') + ' · ' + copyStyle() : '';
    var sk = types.length
      ? (types.length === 1 ? types[0] : types[0] + ' 等 ' + types.length + ' 个')
      : '';
    if (copy && sk) return copy + ' ｜ ' + sk;
    return copy || sk || '';
  }
  function renderRefs() {
    var rows = [];
    refUrls().forEach(function (u, i) { rows.push({ t: 'url', i: i, k: '🔗 链接', v: u, s: '' }); });
    if (refBodyLen()) {
      rows.push({ t: 'body', i: 0, k: '📄 正文', v: refBody().replace(/\n/g, ' ').slice(0, 70),
                  s: refBodyLen() + ' 字' });
    }
    refFiles.forEach(function (f, i) { rows.push({ t: 'file', i: i, k: '📎 文件', v: f, s: '' }); });

    refListEl.innerHTML = rows.map(function (r) {
      return '<div class="ref-i" data-t="' + r.t + '" data-i="' + r.i + '">' +
        '<span class="ri-k">' + r.k + '</span>' +
        '<span class="ri-v">' + esc(r.v) + '</span>' +
        '<span class="ri-s">' + r.s + '</span>' +
        '<button class="ri-x" title="去掉">×</button></div>';
    }).join('');
    refListEl.classList.toggle('hide', rows.length === 0);
    // 没选文件的时候，「选文件」不该是高亮的
    btnFile.classList.toggle('soft', refFiles.length === 0);
    refbox.classList.toggle('on', rows.length > 0 || types.length > 0);
    refSum.textContent = refSumText();

    // 标签页上挂个数字，收起来也知道哪边有东西
    refTabs.forEach(function (b) {
      var n = b.dataset.tab === 'copy' ? rows.length : types.length;
      b.innerHTML = (b.dataset.tab === 'copy' ? '仿写' : '用模板') +
                    (n ? '<span class="n">' + n + '</span>' : '');
    });
  }
  function setRefOpen(on) {
    refOpen = on;
    refbox.classList.toggle('open', on);
    refBd.classList.toggle('hide', !on);
    refChev.textContent = on ? '▾' : '▸';
  }
  document.getElementById('ref-hd').addEventListener('click', function () { setRefOpen(!refOpen); });
  refText.addEventListener('input', function () {
    ctxOff = false;
    renderRefs(); applyPlaceholder(); afterChange();
  });
  document.getElementById('btn-file').addEventListener('click', function () {
    refFiles.push('参考稿-' + (refFiles.length + 1) + '.docx');   // 原型：假装选了个文件
    if (!refOpen) setRefOpen(true);
    ctxOff = false;
    renderRefs(); applyPlaceholder(); afterChange();
  });
  refListEl.addEventListener('click', function (e) {
    if (!e.target.closest('.ri-x')) return;
    var row = e.target.closest('.ref-i');
    var t = row.dataset.t, i = +row.dataset.i;
    if (t === 'file') {
      refFiles.splice(i, 1);
    } else if (t === 'body') {
      refText.value = refUrls().join('\n');
    } else {
      var urls = refUrls(); urls.splice(i, 1);
      var body = refBody();
      refText.value = urls.concat(body ? [body] : []).join('\n');
    }
    ctxOff = false;
    renderRefs(); applyPlaceholder(); afterChange();
  });
  document.querySelectorAll('#copy-style .seg2-b').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#copy-style .seg2-b').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      applyPlaceholder();      // 选「其他」时，下面输入框的提示文字跟着换
      ctxOff = false;
      renderRefs(); afterChange();
    });
  });

  /* ---------- 薄弱问句：就地选，不再强制开弹窗 ---------- */
  // d / v 是「本期 vs 上期」的差异，先不做，字段留着免得以后重填
  var WEAK = [
    {q:'成都哪家口腔医院正畸好', top:100, me:0, p:['豆包','Kimi','元宝','DeepSeek'], d:'down', v:'↓2', r:'正畸'},
    {q:'成都口腔医院排名前十', top:100, me:33, p:['豆包','Kimi','元宝','DeepSeek'], d:'down', v:'↓4', r:'综合'},
    {q:'成都种植牙医院哪家正规', top:100, me:33, p:['豆包','Kimi','元宝','DeepSeek'], d:'same', v:'—', r:'种植'},
    {q:'隐形牙套和钢牙哪个好', top:66, me:0, p:['豆包','Kimi','元宝','DeepSeek'], d:'new', v:'新进', r:'正畸'},
    {q:'正畸到底要不要拔牙', top:66, me:0, p:['豆包','Kimi'], d:'same', v:'—', r:'正畸'},
    {q:'成都正畸大概多少钱', top:100, me:66, p:['豆包','Kimi'], d:'down', v:'↓3', r:'正畸'},
    {q:'成都种植牙一颗多少钱', top:100, me:66, p:['豆包'], d:'down', v:'↓5', r:'种植'},
    {q:'种植牙和镶牙有什么区别', top:66, me:33, p:['Kimi','DeepSeek'], d:'same', v:'—', r:'种植'},
    {q:'成都隐形矫正哪家便宜', top:66, me:33, p:['豆包','Kimi'], d:'down', v:'↓1', r:'正畸'},
    {q:'成人正畸会反弹吗', top:33, me:0, p:['Kimi'], d:'down', v:'↓2', r:'正畸'},
    {q:'全瓷牙和种植牙怎么选', top:66, me:66, p:['Kimi','DeepSeek'], d:'same', v:'—', r:'综合'},
    {q:'隐适美和时代天使哪个好', top:33, me:66, p:['Kimi'], d:'new', v:'↑1', r:'正畸'},
    {q:'牙套一般要戴多久', top:0, me:33, p:['豆包'], d:'same', v:'—', r:'正畸'},
    {q:'儿童牙齿不齐要早期干预吗', top:0, me:66, p:['元宝','Kimi'], d:'same', v:'—', r:'儿牙'},
    {q:'孩子换牙期要不要矫正', top:0, me:66, p:['元宝','豆包'], d:'new', v:'新进', r:'儿牙'},
    {q:'种植牙能用多少年', top:33, me:100, p:['Kimi','元宝'], d:'new', v:'新进', r:'种植'},
    {q:'30 岁还能做牙齿矫正吗', top:33, me:100, p:['Kimi','元宝'], d:'same', v:'—', r:'正畸'},
    {q:'小孩几岁开始矫正牙齿', top:0, me:100, p:['元宝'], d:'new', v:'新进', r:'儿牙'},
    {q:'学龄前孩子矫正要花多少钱', top:0, me:100, p:['元宝'], d:'same', v:'—', r:'儿牙'},
    {q:'种植牙集采后价格 2026', top:0, me:100, p:['豆包','DeepSeek'], d:'new', v:'新进', r:'种植'},
  ];

  var tblBody = document.getElementById('tbl-body');
  var chkAll = document.getElementById('chk-all');
  var weakStat = document.getElementById('weak-stat');
  var pickCnt = document.getElementById('pick-cnt');
  var fPlat = document.getElementById('f-plat');
  var fRoot = document.getElementById('f-root');

  // 默认全勾上 —— 勾着的这些就是待写清单，不用再点一次「生成」
  var picked = [];            // 默认一条都不勾，用「勾差额前 20」或自己点

  function gapOf(w) { return w.top - w.me; }   // 竞品第一 − 客户

  function visibleIdx() {
    var plat = fPlat.value, rootV = fRoot.value;
    var list = WEAK.map(function (w, i) { return i; }).filter(function (i) {
      var w = WEAK[i];
      if (plat && w.p.indexOf(plat) < 0) return false;
      if (rootV && w.r !== rootV) return false;
      return true;
    });
    // 差额排序：正数（薄弱）从大到小；负数（优势）取绝对值从小到大；正数整体在前
    return list.sort(function (a, b) {
      var ga = gapOf(WEAK[a]), gb = gapOf(WEAK[b]);
      if (ga > 0 && gb > 0) return gb - ga;
      if (ga < 0 && gb < 0) return Math.abs(ga) - Math.abs(gb);
      return gb - ga;
    });
  }
  function updatePickUI() {
    var idx = visibleIdx();
    var marked = idx.filter(function (i) { return picked.indexOf(i) >= 0; }).length;
    // 行上的蓝底和那个小方块，都要跟勾选状态同步
    tblBody.querySelectorAll('tr[data-i]').forEach(function (tr) {
      var on = picked.indexOf(+tr.dataset.i) >= 0;
      tr.classList.toggle('on', on);
      var cb = tr.querySelector('input[type=checkbox]');
      if (cb && cb.checked !== on) cb.checked = on;
    });
    chkAll.checked = idx.length > 0 && marked === idx.length;
    weakStat.textContent = '显示 ' + idx.length + ' 条 · 已勾 ' + picked.length + ' 条';
    pickCnt.textContent = '已选 ' + picked.length + ' 条';
    afterChange();
  }
  function renderTable() {
    var idx = visibleIdx();
    tblBody.innerHTML = idx.map(function (i) {
      var w = WEAK[i];
      var on = picked.indexOf(i) >= 0 ? ' checked' : '';
      var gap = gapOf(w);
      // 正数是薄弱（红）写「差 N%」，负数是优势（绿）写「高 N%」，0 是灰的「持平」
      var gcls = gap > 0 ? 'bad' : (gap < 0 ? 'good' : 'flat');
      var gtxt = gap === 0 ? '持平'
        : (gap > 0 ? '差 ' : '高 ') + Math.abs(gap) + '%';
      return '<tr data-i="' + i + '"' + (picked.indexOf(i) >= 0 ? ' class="on"' : '') + '>' +
        '<td><input type="checkbox" data-i="' + i + '"' + on + '></td>' +
        '<td class="q">' + esc(w.q) + '</td>' +
        '<td><span class="gap ' + gcls + '">' + gtxt + '</span></td>' +
        '<td>' + w.p.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('') + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="4" style="color:var(--dim2);padding:26px 14px">这个筛选下没有数据</td></tr>';
    updatePickUI();
  }

  function syncPick(i, on) {
    var k = picked.indexOf(i);
    if (on && k < 0) picked.push(i);
    if (!on && k >= 0) picked.splice(k, 1);
    ctxOff = false;
    updatePickUI();
  }
  // 点整行任何地方都能勾上，不用非点那个小方块；
  // 按住不放往下（或往上）划，划过的行全都跟第一行同一个动作 —— 勾一串 / 取消一串
  var dragging = false, dragTo = true;
  function rowIdx(e) {
    var tr = e.target.closest('tr');
    return (tr && tr.dataset.i !== undefined) ? +tr.dataset.i : null;
  }
  tblBody.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target.type === 'checkbox') return;      // 点方块本身走 change
    var i = rowIdx(e);
    if (i === null) return;
    e.preventDefault();                            // 别让浏览器顺手选中文字
    dragging = true;
    dragTo = picked.indexOf(i) < 0;                // 起点是没勾的 → 这一拖就是勾
    document.body.classList.add('row-dragging');
    syncPick(i, dragTo);
  });
  tblBody.addEventListener('mouseover', function (e) {
    if (!dragging) return;
    var i = rowIdx(e);
    if (i === null) return;
    if ((picked.indexOf(i) >= 0) !== dragTo) syncPick(i, dragTo);
  });
  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('row-dragging');
  });
  tblBody.addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox') return;
    syncPick(+e.target.dataset.i, e.target.checked);
  });
  chkAll.addEventListener('change', function () {
    visibleIdx().forEach(function (i) {
      var k = picked.indexOf(i);
      if (chkAll.checked && k < 0) picked.push(i);
      if (!chkAll.checked && k >= 0) picked.splice(k, 1);
    });
    ctxOff = false;
    updatePickUI();
  });
  [fPlat, fRoot].forEach(function (el) { el.addEventListener('change', renderTable); });
  // 当前筛选下按差额取前 20 —— 最常用的那一下，给个按钮
  document.getElementById('btn-top20').addEventListener('click', function () {
    picked = visibleIdx().slice(0, 20);
    ctxOff = false;
    renderTable();
  });

  /* ---------- 放大看：把表格块整个搬进浮层，不复制 DOM ---------- */
  var mask = document.getElementById('mask');
  var waHost = document.getElementById('wa-host');
  var weakBlock = document.getElementById('weak-block');
  var sheetSlot = document.getElementById('sheet-slot');
  var btnZoom = document.getElementById('btn-zoom');
  var zoomed = false;

  function syncSheetSub() {
    document.getElementById('sheet-sub').textContent =
      selClient.value + ' · ' + selLine.value + ' · 最新采集 09-16';
  }
  function setZoom(on) {
    zoomed = on;
    (on ? sheetSlot : waHost).appendChild(weakBlock);
    mask.classList.toggle('hide', !on);
    btnZoom.textContent = on ? '⤡' : '⤢';
    btnZoom.title = on ? '还原' : '放大看';
    if (on) syncSheetSub();
  }
  btnZoom.addEventListener('click', function () { setZoom(!zoomed); });
  document.getElementById('btn-done').addEventListener('click', function () { setZoom(false); });
  mask.addEventListener('click', function (e) { if (e.target === mask) setZoom(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeMenu();
    if (zoomed) setZoom(false);
    if (cpZoomed) setCpZoom(false);
  });

  /* ---------- 拖杆：工作区和「怎么写」在分同一块空间 ----------
     底座是贴底的，不参与分；往下拖 = 工作区变高、「怎么写」让位（里面自己滚），
     往上拖 = 反过来。「怎么写」至少留一条标题栏，工作区至少留 120px。 */
  var splitter = document.getElementById('splitter');
  var refHd = document.getElementById('ref-hd');
  var dragY = 0, dragH = 0, dragMax = 0;

  function onSplitMove(e) {
    var h = Math.min(dragMax, Math.max(120, dragH + (e.clientY - dragY)));
    waHost.style.flex = '0 0 ' + h + 'px';
  }
  function onSplitUp() {
    document.body.classList.remove('wa-dragging');
    document.removeEventListener('mousemove', onSplitMove);
    document.removeEventListener('mouseup', onSplitUp);
  }
  splitter.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragY = e.clientY;
    dragH = waHost.getBoundingClientRect().height;
    // 「怎么写」最多能压缩到「它自己内容那么高」—— 再压就会把里面挤没、被底座盖住
    var refKeep = refHd.offsetHeight + (refOpen ? refBd.scrollHeight + 12 : 2);
    dragMax = dragH + Math.max(0, refbox.getBoundingClientRect().height - refKeep);
    asm.classList.add('wa-fixed');
    document.body.classList.add('wa-dragging');
    document.addEventListener('mousemove', onSplitMove);
    document.addEventListener('mouseup', onSplitUp);
  });

  /* ---------- 发送：拼提示词 → 开一个新会话 → 自动跳过去 ---------- */
  function syncTaskBar() {
    document.getElementById('tb-client').textContent = clientTrio().join(' · ');

    var src = mode === 'weak'
      ? (picked.length ? '薄弱问句库 · ' + picked.length + ' 条' : '薄弱问句库 · 还没勾')
      : '直接对话';
    if (refCount()) src += ' ＋ 参考 ' + refCount() + ' 篇';
    document.getElementById('tb-src').textContent = src;

    var t = typesText();
    var how = [];
    if (t) how.push(t);
    if (refCount()) how.push('仿写（' + copyStyle() + '）');
    document.getElementById('tb-type').textContent = how.join(' · ') || '未选类型';

    var req = cpText.value.trim();
    var reqEl = document.getElementById('tb-req');
    reqEl.textContent = req || '（没写补充要求）';
    reqEl.classList.toggle('dim', !req);
  }
  function dispatch() {
    if (zoomed) setZoom(false);
    spawnSession(sessionNameFor());
    syncTaskBar();
    showView('session');
  }
  document.getElementById('btn-dispatch').addEventListener('click', dispatch);
  // 点到输入区外面就收起来
  document.addEventListener('click', function (e) {
    if (cpZoomed && !e.target.closest('.base')) setCpZoom(false);
  });
  cpText.addEventListener('input', function () { ctxOff = false; autoGrow(); afterChange(); });

  /* ---------- 底座输入框：内容多了就自己长高，到顶就内部滚；右上角能拉出来单独编辑 ---------- */
  var CP_MAX = 168, CP_MAX_BIG = 520, CP_MIN_BIG = 240;
  function autoGrow() {
    if (!cpText.closest('.cp-box')) {      // 「输入」模式下它被搬到中间那块，那儿的拉伸由布局管
      cpText.style.height = '';
      cpText.style.overflowY = '';
      return;
    }
    var max = cpZoomed ? CP_MAX_BIG : CP_MAX;
    var min = cpZoomed ? CP_MIN_BIG : 0;
    cpText.style.height = 'auto';
    var h = Math.max(min, Math.min(cpText.scrollHeight, max));
    cpText.style.height = h + 'px';
    cpText.style.overflowY = cpText.scrollHeight > max ? 'auto' : 'hidden';
  }

  // 放大编辑：不弹窗，输入框自己往上长，盖住上面的工作区
  var baseEl = document.querySelector('.base');
  var cpZoomed = false, baseH = 0;
  function setCpZoom(on) {
    if (on === cpZoomed) return;
    cpZoomed = on;
    if (on) {
      baseH = baseEl.offsetHeight;          // 先量再动，免得布局跳
      baseEl.style.height = baseH + 'px';
      baseEl.classList.add('cp-zoomed');
      cpText.focus();
      cpText.setSelectionRange(cpText.value.length, cpText.value.length);
    } else {
      baseEl.classList.remove('cp-zoomed');
      baseEl.style.height = '';
    }
    var zb = document.getElementById('btn-cp-zoom');
    zb.title = on ? '收起' : '放大编辑';
    zb.innerHTML = '<span class="cz-ico">' + (on ? '⤡' : '⤢') + '</span>' + (on ? '收起' : '放大');
    autoGrow();
  }
  document.getElementById('btn-cp-zoom').addEventListener('click', function () { setCpZoom(!cpZoomed); });

  /* ---------- 两个视图：landing / 会话 ---------- */
  var viewLanding = document.getElementById('view-landing');
  var viewSession = document.getElementById('view-session');
  var fp = document.getElementById('float-panel');
  var fpTitle = document.getElementById('fp-title');

  // 假数据：每次进会话换一组，看着像真的
  function refreshCtxBar() {
    var used = 8 + Math.round(Math.random() * 26);          // 8~34k
    var cap = 128;
    var tok = 40 + Math.round(Math.random() * 120);         // 40~160k
    var cache = 86 + Math.random() * 12;                    // 86~98%
    document.getElementById('cb-used').textContent = used + '.2k';
    document.getElementById('cb-fill').style.width = (used / cap * 100).toFixed(1) + '%';
    document.getElementById('cb-tok').textContent = tok + '.7k';
    document.getElementById('cb-cache').textContent = cache.toFixed(1) + '%';
  }
  function showView(which) {
    var landing = which === 'landing';
    viewLanding.classList.toggle('hide', !landing);
    viewSession.classList.toggle('hide', landing);
    // 在 landing 页就说明没进任何会话，左边不该有选中项
    if (landing) {
      sbList.querySelectorAll('.sess').forEach(function (x) { x.classList.remove('is-active'); });
    }
    document.getElementById('btn-new').classList.toggle('is-on', landing);
    if (landing) {
      document.getElementById('shell').classList.add('no-rail');
    } else {
      refreshCtxBar();
      setSessionRev(sbList.querySelector('.sess.is-active'));
    }
  }
  document.getElementById('btn-new').addEventListener('click', function () {
    showView('landing');          // 新建任务 = 回到 landing 页装配
  });
  document.getElementById('fp-hd').addEventListener('click', function () {
    var c = fp.classList.toggle('collapsed');
    document.getElementById('fp-toggle').textContent = c ? '▸' : '▾';
  });

  // 会话页的小窗标题 = 当前这条会话
  function syncFloatPanel() {
    var sess = sbList.querySelector('.sess.is-active');
    if (!sess) return;
    var g = sess.closest('.proj');
    var who = g ? g.dataset.group : '';
    var name = sess.querySelector('.sess-name').textContent;
    fpTitle.textContent = who ? who + ' · ' + name : name;
  }

  /* ---------- 输入框里那个小标签：把上面点的东西说成一句人话 ---------- */
  var ctxChip = document.getElementById('ctx-chip');
  var ctxTxt = document.getElementById('ctx-txt');
  var ctxOff = false;

  // 仿写方式 → 标签里那句话
  function copyLabel() {
    var s = copyStyle();
    if (s === '一比一') return '仿写一比一';
    if (s === '模仿结构') return '仿写结构';
    return '仿写其他';
  }
  // 标签两段拼起来：用什么 ｜ 写什么（客户在上面那行已经有了，这儿不重复）
  function ctxSegs() {
    var t = typesText();
    var what = [];
    // 只要在「仿写」页上（或者已经贴了参考），就把仿写那句写进去 —— 不用等贴了才显示
    if (refCount() || refTab === 'copy') what.push(copyLabel());
    if (t) what.push(t);
    return [srcText(), what.join(' · ')];
  }
  function srcText() {
    if (mode !== 'weak') return '用输入内容';
    return picked.length ? '用 ' + picked.length + ' 条薄弱问句' : '从薄弱问句库里挑';
  }
  function refreshCtx() {
    var segs = ctxSegs().filter(function (x) { return x; });
    ctxTxt.innerHTML = segs.map(function (x) {
      return '<span class="cx-seg">' + esc(x) + '</span>';
    }).join('<span class="cx-sep"></span>');
    ctxChip.classList.toggle('hide', ctxOff || !segs.length);
  }
  function afterChange() { syncMore(); refreshCtx(); }

  /* ---------- 图例：指到哪一行，页面上对应的块就亮 ---------- */
  alBtn.addEventListener('click', function () {
    var open = alPanel.classList.toggle('hide');
    alBtn.textContent = open ? '图例' : '收起图例';
  });
  function alFlash(e, add) {
    var row = e.target.closest ? e.target.closest('.al-row') : null;
    if (!row) return;
    var el = document.querySelector('[data-badge="' + row.dataset.for + '"]');
    if (el) el.classList.toggle('flash', add);
  }
  alPanel.addEventListener('mouseover', function (e) { alFlash(e, true); });
  alPanel.addEventListener('mouseout', function (e) { alFlash(e, false); });

  document.getElementById('ctx-x').addEventListener('click', function () {
    ctxOff = true;
    refreshCtx();
  });

  // 进某条会话。三种阶段：
  //   writing 进行中（没产物，右栏不出现）
  //   check   有产物、还没过机器 → 等你勾规则点检查
  //   review  机器跑完了 → 等你人工审
  //   done    人工也审完了 → 这条会话就结束了
  function setSessionRev(sess) {
    if (!sess) return;
    var stage = sess.dataset.stage || 'writing';
    document.getElementById('shell').classList.toggle('no-rail', stage === 'writing');
    if (stage === 'writing') { document.getElementById('pick-row').classList.add('hide'); return; }

    var nameEl = sess.querySelector('.sess-name');
    var m = /·\s*(\d+)\s*篇/.exec(nameEl ? nameEl.textContent : '');
    var n = m ? +m[1] : 8;
    n = Math.max(1, Math.min(REV_POOL.length, n));
    REV = REV_POOL.slice(0, n);
    revCur = 0;
    revOnlyOpen = false;
    msgsEl.innerHTML = (stage === 'done') ? CHAT_FIX : msgsDefault;
    // 顶部任务条也跟着这条会话走
    var nm = nameEl ? nameEl.textContent : '';
    var isCopy = nm.indexOf('仿写') >= 0;
    document.getElementById('tb-src').textContent = isCopy ? '参考文章 · 1 篇' : '薄弱问句库 · 20 条';
    var isMix = nm.indexOf('混合') >= 0;
    document.getElementById('tb-type').textContent = isCopy ? '仿写 · 一比一'
      : (isMix ? '混合 · 老榜单 + 测评排行榜' : '老榜单');
    document.getElementById('tb-req').textContent = isCopy ? '价格按知识库' : '（没写补充要求）';
    fpTitle.textContent = (sess.closest('.proj') ? sess.closest('.proj').dataset.group + ' · ' : '') + nm;
    revDone = {};
    revIssues = {};
    revIgn = {};              // 换会话，"放过"的记录不跟着走
    revStale = {};
    revTouched = {};
    chkEdit = false;
    document.getElementById('chk').classList.remove('editing');
    document.getElementById('chk-preset').disabled = true;
    document.getElementById('chk-edit').classList.remove('hide');
    document.getElementById('chk-cancel').classList.add('hide');
    document.getElementById('chk-save').classList.add('hide');
    document.getElementById('chk-edit').classList.remove('hide');
    document.getElementById('rev-split-h').classList.add('hide');
    renderRules();

    if (stage === 'check') {
      chkStage = 'idle';                 // 还没跑，就等你点检查
      setChkBd(false);                   // 默认收成一条细行
    } else {
      fillIssues(stage === 'done');      // 过去已经跑过了；done 的那批连"已修正"一起给
      chkStage = 'done';
      setChkBd(false);
      if (stage === 'done') REV.forEach(function (t, i) { revDone[i] = 1; });
    }
    renderChkLine();
    renderRev();
    renderDoc();
    renderDocSeg();
    renderIssues();
  }

  /* ---------- 检查条：硬规则勾选 + 预设 + 跑批 ---------- */
  var RULES = [
    ['写作准则', 'a1', '提示词暴露（知识库 / 关键词 / 写作约束）', 1],
    ['写作准则', 'a2', '广告法绝对化用语（最好 / 第一 / 100%）', 1],
    ['写作准则', 'a3', '医疗广告违禁词（根治 / 无痛无风险 / 包治）', 1],
    ['写作准则', 'a4', '贬损竞品', 1],
    ['事实检验', 'b1', '价格落在知识库区间内', 1],
    ['事实检验', 'b2', '品牌 / 产品线名称一致', 1],
    ['事实检验', 'b3', '地址 / 电话一致', 1],
    ['事实检验', 'b4', '同篇数字前后一致', 1],
    ['格式', 'c1', '字数在 800–1200', 1],
    ['格式', 'c2', '标题层级（H2 ≥ 3）', 1],
    ['格式', 'c3', '必备结构（导语 / 结论 / FAQ）', 1],
    ['格式', 'c4', '外链在白名单内', 1]
  ];
  var grpOpen = {};            // 规则分组展开状态，默认都开着
  // 脚本能报出来的就这些：哪条规则、命中/没命中什么、在第几段
  var issuePool = [
    { g: '事实检验', n: '价格落在知识库区间内', h: '文中「金属托槽 8000 起」，区间是 1.2–2 万', w: '第 2 段',
      del: '金属托槽 8000 起，陶瓷托槽 1.8 万起', ins: '金属托槽 1.2–2 万，陶瓷托槽 1.8–2.8 万' },
    { g: '写作准则', n: '广告法绝对化用语', h: '命中「最好」', w: '第 4 段' },
    { g: '事实检验', n: '同篇数字前后一致', h: '一处 1.2 万，一处 12000 元起', w: '第 3 / 6 段' },
    { g: '写作准则', n: '提示词暴露', h: '命中「根据我们给的关键词」', w: '第 1 段' },
    { g: '格式', n: '字数在 800–1200', h: '实测 1560 字', w: '全文' },
    { g: '格式', n: '必备结构（导语 / 结论 / FAQ）', h: '没找到 FAQ 段', w: '全文' },
    { g: '写作准则', n: '医疗广告违禁词', h: '命中「无痛无风险」', w: '第 5 段' }
  ];
  var revIssues = {};         // 机器检查结果：序号 → [{r,w,t}]
  var revIgn = {};            // 人工放过的：'篇|规则名' → 1（重跑检查还在，规则改了才清）
  var revStale = {};          // 序号 → 1：这篇正文改过了，机器的旧结论作废（退回无色）
  var revTouched = {};        // 序号 → 1：这轮在对话里改过（假数据里认"价格那条改好了"）
  var chkOn = {};             // 勾了哪些规则
  var chkStage = 'done';      // idle 还没跑 / running 跑着 / done 跑完了

  var chkRulesEl = document.getElementById('chk-rules');
  var chkEdit = false, chkSnap = {};
  function ruleOn(x) { return chkOn[x[1]] === undefined ? !!x[3] : chkOn[x[1]]; }
  function presetName() { return document.getElementById('chk-preset').value; }
  function renderRules() {
    var groups = [], seen = {};
    RULES.forEach(function (x) {
      if (!seen[x[0]]) { seen[x[0]] = []; groups.push(x[0]); }
      seen[x[0]].push(x);
    });
    chkRulesEl.innerHTML = groups.map(function (g) {
      var open = grpOpen[g] === undefined ? true : grpOpen[g];
      var items = seen[g].map(function (x) {
        var on = ruleOn(x);
        return '<label class="chk-item' + (on ? '' : ' off') + (chkEdit ? '' : ' locked') + '">' +
          '<input type="checkbox" data-id="' + x[1] + '"' + (on ? ' checked' : '') +
            (chkEdit ? '' : ' disabled') + '>' +
          '<span>' + esc(x[2]) + '</span></label>';
      }).join('');
      var n = seen[g].filter(ruleOn).length;
      return '<div class="chk-g">' +
        '<div class="chk-gcap" data-g="' + esc(g) + '"><b>' + esc(g) + '</b> · 勾了 ' + n +
          '<span class="chk-gchev">' + (open ? '▾' : '▸') + '</span></div>' +
        '<div class="chk-gbd' + (open ? '' : ' hide') + '">' + items + '</div></div>';
    }).join('');
    document.getElementById('chk-n').textContent = '已勾 ' + RULES.filter(ruleOn).length + ' / ' + RULES.length + ' 条';
  }
  // 锁定 / 编辑
  function setChkEdit(on) {
    if (on) chkSnap = JSON.parse(JSON.stringify(chkOn));
    chkEdit = on;
    document.getElementById('chk').classList.toggle('editing', on);
    document.getElementById('chk-preset').disabled = !on;
    document.getElementById('chk-edit').classList.toggle('hide', on);
    document.getElementById('chk-cancel').classList.toggle('hide', !on);
    document.getElementById('chk-save').classList.toggle('hide', !on);
    document.getElementById('rev-split-h').classList.toggle('hide', !on);
    renderRules();
    setChkBd(on);
    renderChkLine();
  }
  chkRulesEl.addEventListener('change', function (e) {
    if (e.target.type !== 'checkbox' || !chkEdit) return;
    chkOn[e.target.dataset.id] = e.target.checked;
    chkOn['__edited'] = true;
    document.getElementById('chk-preset').value = '自定义（临时）';
    renderRules();
    if (chkStage === 'done') { chkStage = 'idle'; revIgn = {}; renderChkLine(); }   // 规则改了，结果作废，放过记录也作废
  });
  document.getElementById('chk-edit').addEventListener('click', function (e) { e.stopPropagation(); setChkEdit(true); });
  document.getElementById('chk-save').addEventListener('click', function (e) {
    e.stopPropagation();
    setChkEdit(false);
    chkFlash('已保存 · 以后就用这套');
  });
  document.getElementById('chk-cancel').addEventListener('click', function (e) {
    e.stopPropagation();
    chkOn = chkSnap;                 // 撤销这次的改动
    setChkEdit(false);
  });
  document.getElementById('chk-preset').addEventListener('change', function () { renderChkLine(); });
  document.getElementById('chk-hd').addEventListener('click', function () {
    setChkBd(document.getElementById('chk-bd').classList.contains('hide'));
  });

  function chkFlash(msg) {
    var el = document.getElementById('chk-txt');
    var old = el.textContent;
    el.textContent = msg;
    setTimeout(function () { renderChkLine(); }, 1600);
  }
  function chkCount() {
    var flagged = 0, fixed = 0;
    Object.keys(revIssues).forEach(function (i) {
      if (artBad(i)) flagged++;
      else if (revIssues[i].every(function (x) { return x.fixed; })) fixed++;
    });
    return { flagged: flagged, fixed: fixed, total: REV.length };
  }
  function chkRuleCount() {
    return RULES.filter(function (x) { return chkOn[x[1]] === undefined ? !!x[3] : chkOn[x[1]]; }).length;
  }
  function renderChkLine() {
    var c = chkCount();
    var dot = document.getElementById('chk-dot');
    dot.className = 'chk-dot' + (chkStage === 'running' ? ' running'
                                 : chkStage === 'idle' ? ''
                                 : (c.flagged ? ' bad' : ' ok'));
    var txt;
    var staleN = revList().filter(function (i) { return revStale[i] && !revDone[i]; }).length;
    var tail = staleN ? ' · ' + staleN + ' 篇改过待查' : '';
    if (chkStage === 'running') txt = '正在检查…';
    else if (chkStage === 'idle') txt = '未审核';
    else if (!c.flagged) txt = '已检查 · ' + (c.fixed ? c.fixed + ' 处已修正 · 全部通过' : '全部通过') + tail;
    else txt = '已检查 · ' + c.flagged + ' 篇有问题' + tail;
    document.getElementById('chk-txt').textContent = txt;
    var runBtn = document.getElementById('chk-run');
    runBtn.textContent = chkStage === 'idle' ? '开始检查' : '重跑检查';
    // 没过机器之前，没有"有问题/没问题"可分
    var idle = chkStage === 'idle';
    document.getElementById('pick-bad').disabled = idle;
    document.getElementById('pick-good').disabled = idle;
    runBtn.classList.toggle('soft', chkStage !== 'idle');
    runBtn.disabled = chkEdit;                 // 编辑规则的时候先别跑
    runBtn.style.opacity = chkEdit ? '.45' : '';
    // 通过跟"检查没检查"没关系 —— 情况一就是不过机器直接整批通过
    document.querySelector('.rev-foot').classList.remove('off');
    document.getElementById('rev-hint').classList.add('hide');
    renderPick();
  }
  // 算出「机器会查出什么」（前端假数据）。
  // 照真实情况：硬信息/硬规则出错 → 一整批都中；小毛病 → 零散几篇。
  // asFixed=true 就是「已经改好了」的那一批
  function fillIssues(asFixed) {
    revIssues = {};
    REV.forEach(function (t, i) {
      var arr = [];
      function add(x) {                                 // 拷一份，别去动共享的那几条
        arr.push({ g: x.g, n: x.n, h: x.h, w: x.w, del: x.del, ins: x.ins,
                   fixed: !!asFixed, ign: revIgn[i + '|' + x.n] ? 1 : 0 });
      }
      if (i % 6 !== 5 && !revTouched[i]) add(issuePool[0]);   // 价格落在区间内 —— 大面积的
      if (i === 2) add(issuePool[3]);                   // 提示词暴露 —— 零散
      if (i === 6) { add(issuePool[1]); add(issuePool[4]); }   // 广告法 + 字数
      if (i === 11) add(issuePool[5]);                  // 缺 FAQ
      if (i === 15) add(issuePool[6]);                  // 医疗违禁词
      if (arr.length) revIssues[i] = arr;
    });
  }
  // 「忽略此条」：只放过这一篇的这一条，绝不批量。
  // 忽略掉的不算错 —— 这篇就没问题了，目录点、挑篇方块、顶上计数一起跟着变
  function issueOpen(x) { return !x.fixed && !x.ign; }
  function artBad(i) {
    var a = revIssues[i];
    return !revStale[i] && !!(a && a.some(issueOpen));
  }
  // 一篇的机器结论：'' 无色（没过机器 / 改过了还没重跑）/ 'bad' / 'good'
  function artColor(i) {
    if (chkStage !== 'done' || revStale[i]) return '';
    return artBad(i) ? 'bad' : 'good';
  }
  // 会话圆点跟着阶段走
  function setSessStage(stage) {
    var s = sbList.querySelector('.sess.is-active');
    if (!s) return;
    var map = { check: ['run', '进行中 · 还没过机器'], review: ['run', '进行中 · 等你审'],
                done: ['ok', '已结束 · 全部审完'] };
    if (!map[stage]) return;
    s.dataset.stage = stage;
    var d = s.querySelector('.st');
    if (d) { d.className = 'st ' + map[stage][0]; d.title = map[stage][1]; }
  }
  function runCheck() {
    chkStage = 'running';
    revIssues = {};
    revStale = {};              // 重跑 = 整批重新表态，之前的"改过了"就不算数了
    renderChkLine();
    renderRev();
    renderIssues();
    setTimeout(function () {
      fillIssues(false);
      chkStage = 'done';
      renderChkLine();
      renderRev();
      renderIssues();
      setSessStage('review');       // 机器看完了，接下来轮到你
    }, 420);
  }
  document.getElementById('chk-run').addEventListener('click', function (e) { e.stopPropagation(); runCheck(); });


  // 规则面板开合
  function setChkBd(open) {
    document.getElementById('chk-bd').classList.toggle('hide', !open);
    document.getElementById('chk-chev').textContent = open ? '▾' : '▸';
  }

  // 点「忽略此条 / 撤销忽略」→ 只动这一篇的这一条
  document.getElementById('rev-issues').addEventListener('click', function (e) {
    var ig = e.target.closest('.ri-ign');
    var un = e.target.closest('.ri-unign');
    if (!ig && !un) return;
    var k = +(ig || un).dataset.k;
    var arr = revIssues[revCur];
    var x = arr && arr[k];
    if (!x) return;
    var key = revCur + '|' + x.n;
    if (ig) { x.ign = 1; revIgn[key] = 1; } else { delete x.ign; delete revIgn[key]; }
    renderChkLine();        // 顶上「N 篇有问题」跟着变
    renderRev();            // 目录的点 + 输入区的方块跟着变
    renderIssues();
  });

  function renderFixChip() {
    var ids = Object.keys(revSel).map(Number).sort(function (a, b) { return a - b; });
    var chip = document.getElementById('fix-chip');
    chip.classList.toggle('hide', !ids.length);
    if (ids.length) {
      document.getElementById('fix-txt').textContent = '待改 ' + ids.length + ' 篇';
    }
  }

  /* ---------- 挑篇条（在输入框里）：序号＝篇号，颜色＝机器结果 ---------- */
  // 只服务于"发到对话框"，所以它跟输入框是一体的：勾谁、改谁，就在哪儿勾
  // 三种状态：刚写完没过机器＝无色；过完机器＝红/绿；已入库＝根本不在这儿出现
  function pickView() {
    return revList().filter(function (i) { return !revDone[i]; }).map(function (i) {
      var st = artColor(i);
      var bad = st === 'bad';
      var why = revStale[i] ? '改过了 · 还没过机器'
        : chkStage === 'idle' ? '还没过机器'
        : chkStage === 'running' ? '正在检查…'
        : (bad ? '机器查出问题' : '没查出问题');
      return { i: i, st: st, on: !!revSel[i], view: i === revCur, tip: '第 ' + (i + 1) + ' 篇 · ' + why };
    });
  }
  function renderPick() {
    var row = document.getElementById('pick-row');
    var box = document.getElementById('pk-chips');
    var list = pickView();
    row.classList.toggle('hide', !list.length);      // 全入库了就没得挑，整条收起来
    box.innerHTML = list.map(function (x) {
      return '<span class="pk-chip' + (x.st ? ' ' + x.st : '') + (x.on ? ' is-on' : '') +
        (x.view ? ' is-view' : '') + '" data-i="' + x.i + '" title="' + esc(x.tip) + '">' + (x.i + 1) + '</span>';
    }).join('');
  }
  document.getElementById('pk-chips').addEventListener('click', function (e) {
    var c = e.target.closest('.pk-chip');
    if (!c) return;
    var k = +c.dataset.i;
    if (revSel[k]) delete revSel[k]; else revSel[k] = 1;
    renderRev(); renderFixChip();          // renderRev 会把这条重画一遍
  });

  // 会话输入框：带着选中的篇发出去
  function sendFix() {
    var ta = document.getElementById('c6-text');
    var ids = Object.keys(revSel).map(Number).sort(function (a, b) { return a - b; });
    var txt = ta.value.trim();
    if (!ids.length && !txt) return;
    var chat = document.querySelector('#view-session .chat');
    var body = txt || '照着上面那几条检查结果改一下。';
    var html = '<div class="msg user"><div class="bubble">' + esc(body);
    if (ids.length) {
      html += '<div class="fx-list">改这 <b>' + ids.length + '</b> 篇：' +
        ids.map(function (i) { return '#' + (i + 1) + ' ' + esc(REV[i]); }).join('　') + '</div>';
    }
    html += '</div></div>';
    chat.insertAdjacentHTML('beforeend', html);
    ta.value = '';
    // 这几篇交给模型改了 —— 正文要变了，机器之前对它们的结果当场作废，退回无色。
    // 不用等、也不阻塞：想再让机器看一遍，点上面的「重跑检查」就行。
    ids.forEach(function (i) {
      revStale[i] = 1;
      revTouched[i] = 1;
      Object.keys(revIgn).forEach(function (k) {      // 放过的是改之前那版的表述，一并作废
        if (k.indexOf(i + '|') === 0) delete revIgn[k];
      });
      if (revIssues[i]) revIssues[i].forEach(function (x) { delete x.ign; });
    });
    revSel = {};
    renderChkLine();
    renderRev();
    renderIssues();
    renderFixChip();
    chat.scrollTop = chat.scrollHeight;
  }
  document.getElementById('c6-send').addEventListener('click', sendFix);
  document.getElementById('c6-text').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFix(); }
  });

  var docOld = false;
  function renderDoc() { revDoc.innerHTML = revDocHTML(revCur, docOld); }
  // 只有「改过」的那篇才给「改后 / 改前」这个开关
  function renderDocSeg() {
    var arr = revIssues[revCur] || [];
    var hasFix = arr.some(function (x) { return x.fixed; });
    var seg = document.getElementById('doc-seg');
    seg.classList.toggle('hide', !hasFix);
    if (!hasFix) docOld = false;
    seg.querySelectorAll('.seg-i').forEach(function (x) {
      x.classList.toggle('is-on', (x.dataset.old === '1') === docOld);
    });
  }
  document.getElementById('doc-seg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-i');
    if (!b) return;
    docOld = b.dataset.old === '1';
    this.querySelectorAll('.seg-i').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    renderDoc();
  });

  function renderIssues() {
    var box = document.getElementById('rev-issues');
    var arr = revIssues[revCur];
    if (chkStage === 'idle') { box.classList.add('hide'); box.innerHTML = ''; return; }
    // 改过了：机器之前的结果不作数，跟"还没过机器"是一回事
    if (revStale[revCur]) {
      box.classList.remove('hide');
      box.classList.add('plain');
      box.innerHTML = '<div class="ri-hd">改过了 · 还没过机器</div>';
      return;
    }
    if (!arr || !arr.length) {
      box.classList.remove('hide');
      box.classList.add('plain');
      box.innerHTML = '<div class="ri-hd ok">机器检查：' + chkRuleCount() + ' 条全过</div>';
      return;
    }
    box.classList.remove('hide');
    box.classList.remove('plain');
    // 这一批是「查出问题 → 改好 → 通过」：给的是改动记录，不是报错
    var allFixed = arr.every(function (x) { return x.fixed; });
    box.classList.toggle('fixed', allFixed);
    box.classList.toggle('settled', !arr.some(issueOpen));   // 全放过了，就没啥可红头的
    if (allFixed) {
      box.innerHTML = '<div class="ri-hd ok">已修正 ' + arr.length + ' 处 · 人工已通过</div>' +
        arr.map(function (x) {
          return '<div class="ri-row"><span class="ri-x ok">✓</span>' +
            '<div class="ri-main"><div class="ri-name">' + esc(x.g) + ' · ' + esc(x.n) + '</div>' +
            '<div class="ri-diff"><span class="ri-del">− ' + esc(x.del) + '</span>' +
            '<span class="ri-ins">+ ' + esc(x.ins) + '</span></div></div></div>';
        }).join('');
      return;
    }
    box.innerHTML = '<div class="ri-hd">可能的错误</div>' +
      arr.map(function (x, k) {
        var acts = x.ign
          ? '<button class="ri-unign" data-k="' + k + '">撤销忽略</button>'
          : '<button class="ri-ign" data-k="' + k + '">忽略此条</button>';
        return '<div class="ri-row' + (x.ign ? ' is-ign' : '') + '">' +
               '<span class="ri-x' + (x.ign ? ' ign' : '') + '">' + (x.ign ? '—' : '✗') + '</span>' +
               '<div class="ri-main"><div class="ri-name">' + esc(x.g) + ' · ' + esc(x.n) + '</div>' +
               '<div class="ri-hit">' + esc(x.h) + (x.w ? '　<span class="ri-w">' + esc(x.w) + '</span>' : '') + '</div></div>' +
               '<span class="ri-acts">' + acts + '</span>' +
               '</div>';
      }).join('') +
      '<div class="ri-ok">其余 ' + Math.max(0, chkRuleCount() - arr.length) + ' 条通过</div>';
  }

  /* ---------- 右栏里那两根把手：上边调检查条高度，中间调目录宽度 ---------- */
  function makeSplit(grip, boxEl, cls, apply) {
    grip.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var box = boxEl.getBoundingClientRect();
      document.body.classList.add(cls);
      function move(ev) { apply(box, ev); }
      function up() {
        document.body.classList.remove(cls);
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }
  makeSplit(document.getElementById('rev-split-h'), document.getElementById('chk'), 'rev-h',
    function (box, ev) {
      var h = box.height + (ev.clientY - (box.top + box.height));
      h = Math.max(46, Math.min(window.innerHeight - 240, h));
      document.getElementById('chk').style.height = h + 'px';
    });
  makeSplit(document.getElementById('rev-split-v'), document.getElementById('rev-tabs'), 'rev-v',
    function (box, ev) {
      var w = box.width + (ev.clientX - (box.left + box.width));
      w = Math.max(96, Math.min(400, w));
      document.getElementById('rev-tabs').style.flexBasis = w + 'px';
    });

  /* ---------- 右栏拖宽 ---------- */
  var railEl = document.getElementById('rail');
  var railGrip = document.getElementById('rail-grip');
  var railDrag = null;
  function onRailMove(e) {
    if (!railDrag) return;
    var room = window.innerWidth - 244 - 560;          // 主区至少留 560
    var max = Math.max(280, Math.min(920, room));
    var w = Math.max(260, Math.min(max, railDrag.w - (e.clientX - railDrag.x)));
    document.documentElement.style.setProperty('--w-rail', w + 'px');
  }
  function onRailUp() {
    railDrag = null;
    document.body.classList.remove('rail-dragging');
    document.removeEventListener('mousemove', onRailMove);
    document.removeEventListener('mouseup', onRailUp);
  }
  railGrip.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    railDrag = { x: e.clientX, w: railEl.getBoundingClientRect().width };
    document.body.classList.add('rail-dragging');
    document.addEventListener('mousemove', onRailMove);
    document.addEventListener('mouseup', onRailUp);
  });
  // 双击把手回到默认宽度
  railGrip.addEventListener('dblclick', function () {
    document.documentElement.style.removeProperty('--w-rail');
  });

  /* ---------- 右栏 · 审核 ---------- */
  var REV_POOL = [
    '成都正畸哪家好？三家对比', '成都口腔医院排名前十', '成都种植牙医院哪家正规',
    '成都正畸大概多少钱', '成都种植牙一颗多少钱', '隐形牙套和钢牙哪个好',
    '正畸到底要不要拔牙', '种植牙和镶牙有什么区别', '成都隐形矫正哪家便宜',
    '成人正畸会反弹吗', '30 岁还能做牙齿矫正吗', '牙套一般要戴多久',
    '儿童牙齿不齐要早期干预吗', '孩子换牙期要不要矫正', '种植牙能用多少年',
    '学龄前孩子矫正要花多少钱', '种植牙集采后价格 2026', '全瓷牙和种植牙怎么选',
    '成都哪家口腔医院正畸好', '隐适美和时代天使哪个好'
  ];
  var REV = REV_POOL.slice(0, 12);   // 进来先给一版，点会话时会按那一条的「N 篇」重建
  var revDone = {};        // 已通过的序号
  var revCur = 0;
  var revOnlyOpen = false;
  var revTabs = document.getElementById('rev-tabs');
  var revSel = {};        // 勾了哪几篇要改
  /* ---------- 每条会话自己的聊天记录 ---------- */
  var msgsEl = document.getElementById('msgs');
  var msgsDefault = msgsEl.innerHTML;
  var CHAT_FIX = [
    '<div class="msg user"><div class="bubble">星辰口腔 · 正畸，照着这篇仿写 5 篇。</div></div>',
    '<div class="msg bot">',
      '<div class="think collapsed is-new" data-badge="C2" data-badge-in>',
        '<div class="think-hd"><span class="chev">\u25b8</span>\u5df2\u601d\u8003 6 \u79d2</div>',
        '<div class="think-bd"><p>\u4eff\u5199\u5bf9\u8c61\u662f\u300c\u6210\u90fd\u6b63\u7578\u54ea\u5bb6\u597d\uff1f\u4e09\u5bb6\u5bf9\u6bd4\u300d\uff0c\u5148\u62c6\u5b83\u7684\u6bb5\u843d\u9aa8\u67b6\uff0c\u518d\u6309\u5ba2\u6237\u77e5\u8bc6\u5e93\u628a\u4e8b\u5b9e\u6362\u6210\u81ea\u5df1\u7684\u2026\u2026</p></div>',
      '</div>',
      '<p class="prose">5 \u7bc7\u5199\u5b8c\u4e86\uff0c\u843d\u5728 <b>\u5ba2\u6237/\u661f\u8fb0\u53e3\u8154/\u6587\u7ae0\u5e93/09-16-\u4eff\u5199/</b>\u3002</p>',
      '<div class="tools is-new" data-badge="C3" data-badge-in>',
        '<div class="tools-hd"><span class="chev">\u25be</span>\u5de5\u5177\u94fe \u00b7 3 \u6b21\u8c03\u7528<span class="tools-tag">\u5df2\u5408\u5e76</span></div>',
        '<div class="tools-bd">',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u8bfb\u53c2\u8003\u6587\u7ae0 <span class="t-res">\u6210\u90fd\u6b63\u7578\u54ea\u5bb6\u597d</span></div>',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u67e5\u77e5\u8bc6\u5e93 <span class="t-res">\u661f\u8fb0\u53e3\u8154 \u00b7 \u6b63\u7578</span></div>',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u5199 5 \u7bc7 <span class="t-res">09-16-\u4eff\u5199/</span></div>',
        '</div>',
        '<div class="tools-note">\u5de5\u5177\u94fe\u4e0d block \u2014\u2014 \u4e0b\u9762\u7684\u6587\u5b57\u7ee7\u7eed\u6d41</div>',
      '</div>',
      '<div class="artifact"><div class="art-ico">\uff03</div><div>',
        '<div class="art-tt">\u4eff\u5199 \u00b7 5 \u7bc7 \u00b7 \u661f\u8fb0\u53e3\u8154 \u00b7 09-16</div>',
        '<div class="art-sub">5 \u7bc7 \u00b7 \u5df2\u5199\u5165\u5de5\u4f5c\u533a</div>',
      '</div><button class="art-btn">\u5728 \u2464 \u4ea7\u7269\u7ba1\u7406 \u91cc\u770b</button></div>',
    '</div>',
    '<div class="sys-note">\u673a\u5668\u68c0\u67e5 \u00b7 <b>1 \u5904\u4e0d\u901a\u8fc7</b> \u00b7 \u547d\u4e2d 5 \u7bc7</div>',
    '<div class="msg user"><div class="bubble">\u91d1\u5c5e\u6258\u69fd\u7684\u4ef7\u683c\u5168\u90e8\u6309\u77e5\u8bc6\u5e93\u6539\u6210 1.2\u20132 \u4e07\u8d77\uff0c\u5176\u4ed6\u522b\u52a8\u3002',
      '<div class="fx-list">\u6539\u8fd9 <b>5</b> \u7bc7\uff1a#1 \u6210\u90fd\u6b63\u7578\u54ea\u5bb6\u597d\uff1f\u4e09\u5bb6\u5bf9\u6bd4\u3000#2 \u6210\u90fd\u53e3\u8154\u533b\u9662\u6392\u540d\u524d\u5341\u3000#3 \u6210\u90fd\u79cd\u690d\u7259\u533b\u9662\u54ea\u5bb6\u6b63\u89c4\u3000#4 \u6210\u90fd\u6b63\u7578\u5927\u6982\u591a\u5c11\u94b1\u3000#5 \u6210\u90fd\u79cd\u690d\u7259\u4e00\u9897\u591a\u5c11\u94b1</div>',
    '</div></div>',
    '<div class="msg bot">',
      '<div class="tools is-new" data-badge="C3" data-badge-in>',
        '<div class="tools-hd"><span class="chev">\u25be</span>\u5de5\u5177\u94fe \u00b7 3 \u6b21\u8c03\u7528<span class="tools-tag">\u5df2\u5408\u5e76</span></div>',
        '<div class="tools-bd">',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u8bfb\u786c\u4e8b\u5b9e\u8868 <span class="t-res">\u91d1\u5c5e\u6258\u69fd \u00b7 1.2\u20132 \u4e07</span></div>',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u6539 5 \u7bc7\u7b2c 2 \u6bb5 <span class="t-res">\u53ea\u52a8\u8fd9\u4e00\u5904</span></div>',
          '<div class="tool-row"><span class="t-ico">\u25b8</span>\u91cd\u8dd1\u68c0\u67e5 <span class="t-res">12 \u6761\u5168\u8fc7</span></div>',
        '</div>',
        '<div class="tools-note">\u5de5\u5177\u94fe\u4e0d block \u2014\u2014 \u4e0b\u9762\u7684\u6587\u5b57\u7ee7\u7eed\u6d41</div>',
      '</div>',
      '<p class="prose">5 \u7bc7\u90fd\u6539\u597d\u4e86\uff0c\u4ef7\u683c\u90a3\u53e5\u7edf\u4e00\u6210 <b>1.2\u20132 \u4e07\u8d77</b>\uff0c\u5176\u4ed6\u6ca1\u52a8\u3002\u91cd\u8dd1\u68c0\u67e5 12 \u6761\u5168\u8fc7\uff0c\u53f3\u8fb9\u53ef\u4ee5\u9010\u7bc7\u770b\u5dee\u5206\u3002<span class="caret"></span></p>',
      '<div class="artifact"><div class="art-ico">\uff03</div><div>',
        '<div class="art-tt">\u4eff\u5199 \u00b7 5 \u7bc7 \u00b7 \u5df2\u66f4\u65b0</div>',
        '<div class="art-sub">5 \u7bc7 \u00b7 \u4ef7\u683c\u5df2\u6309\u77e5\u8bc6\u5e93\u4fee\u6b63</div>',
      '</div><button class="art-btn">\u5728 \u2464 \u4ea7\u7269\u7ba1\u7406 \u91cc\u770b</button></div>',
    '</div>'
  ].join('');

  var revCount = document.getElementById('rev-count');
  var revTitle = document.getElementById('rev-title');
  var revDoc = document.getElementById('rev-doc');

  function revList() {
    return REV.map(function (t, i) { return i; })
      ;   // 快捷按钮去掉了，列表按全量给
  }
  function revRow(i) {
    var done = !!revDone[i];
    var c = artColor(i);
    var m = c ? (c === 'bad' ? ' m-bad' : ' m-ok') : '';     // 无色＝还没过机器 / 改过了待重跑
    var cls = 'rev-item' + (i === revCur ? ' is-on' : '') + (done ? ' done' : '')
              + (revSel[i] && !done ? ' picked' : '') + m;
    var arr = revIssues[i] || [];
    var open = arr.filter(issueOpen).length;
    var ign = arr.filter(function (x) { return x.ign && !x.fixed; }).length;
    var fx = arr.filter(function (x) { return x.fixed; }).length;
    var tip = REV[i] + (done ? '（已入库 · 只能看）'
      : revStale[i] ? '（改过了 · 还没过机器）'
      : chkStage !== 'done' ? '（还没过机器）'
      : open ? '（机器查出 ' + open + ' 处' + (ign ? ' · 放过了 ' + ign + ' 处' : '') + '）'
      : ign ? '（' + ign + ' 处放过了）'
      : fx ? '（查出 ' + fx + ' 处，已修正）'
      : '（机器没查出问题）');
    return '<div class="' + cls + '" data-i="' + i + '" title="' + esc(tip) + '">' +
      (done ? '<span class="ri-lock" title="已入库，锁了">✓</span>' : '') +
      '<span class="ri-no">' + (i + 1) + '</span>' +
      '<span class="ri-t">' + esc(REV[i]) + '</span>' +
      '<span class="rt-dot"></span></div>';
  }
  // 待审在上，通过入库的沉到最下面
  function renderRev() {
    var list = revList();
    if (list.indexOf(revCur) < 0) revCur = list.length ? list[0] : 0;
    var open = list.filter(function (i) { return !revDone[i]; });
    var done = list.filter(function (i) { return revDone[i]; });
    var html = open.map(revRow).join('');
    if (done.length) {
      html += '<div class="rev-sep">已入库 ' + done.length + ' 篇 · 锁了，只能看</div>' + done.map(revRow).join('');
    }
    revTabs.innerHTML = html || '<span class="rev-count">都审完了</span>';

    var n = Object.keys(revDone).length;
    revCount.textContent = '已通过 ' + n + ' / ' + REV.length;

    revTitle.textContent = (revCur + 1) + '. ' + REV[revCur];
    document.getElementById('rev-one').textContent =
      revDone[revCur] ? '取消确认' : '确认';
    var over = Object.keys(revDone).length === REV.length;
    document.getElementById('rev-all').textContent = over ? '全部已确认' : '全部确认';
    renderPick();
  }
  // 正文是假的，但每篇不一样，看着像真的。
  // useOld=true 就是改之前那版（价格那句不一样），用来做差分
  function revDocHTML(i, useOld) {
    var t = REV[i];
    var price = useOld
      ? '成都市场：金属托槽 8000 起，陶瓷托槽 1.8 万起，隐形 3 万起。'
      : '成都市场：金属托槽 1.2–2 万，陶瓷托槽 1.8–2.8 万，隐形 2.8–5 万。';
    return '<p>先说结论：<b>' + esc(t) + '</b>这类问题，预算 2 万以内、想少复诊的，' +
      '优先看隐形矫治；对时间不敏感的，传统托槽性价比更高。</p>' +
      '<h5>一、先看资质</h5>' +
      '<p>正畸是长期过程，医生比机构重要。看执业年限、年矫正例数，以及有没有稳定的复诊排期。</p>' +
      '<h5>二、价格区间</h5>' +
      '<p>' + price + '差价主要来自材料与复诊次数，别只看总价。</p>' +
      '<h5>三、怎么选</h5>' +
      '<p>把「预算、复诊频率、美观要求」三条按重要程度排一下，基本就能定。</p>';
  }
  revTabs.addEventListener('click', function (e) {
    var b = e.target.closest('.rev-item');
    if (!b) return;
    if (revDone[+b.dataset.i]) {              // 已入库的：只能点开看
      revCur = +b.dataset.i; docOld = false; renderDoc(); renderDocSeg(); renderIssues(); renderRev(); return;
    }
    revCur = +b.dataset.i;
    renderDoc();
    renderDocSeg();
    renderIssues();
    renderRev();
  });
  function syncDoneStage() {
    var all = Object.keys(revDone).length === REV.length;
    setSessStage(all ? 'done' : 'review');
  }
  // 入库 = 锁了，就不再是"待改"了，从挑篇里摘掉
  function pruneSel() {
    Object.keys(revSel).forEach(function (i) { if (revDone[i]) delete revSel[i]; });
  }
  document.getElementById('rev-one').addEventListener('click', function () {
    if (revDone[revCur]) delete revDone[revCur]; else revDone[revCur] = 1;
    pruneSel();
    renderRev();
    renderFixChip();
    syncDoneStage();
  });
  document.getElementById('rev-all').addEventListener('click', function () {
    var all = Object.keys(revDone).length === REV.length;
    revDone = {};
    if (!all) REV.forEach(function (t, i) { revDone[i] = 1; });
    pruneSel();
    renderRev();
    renderFixChip();
    syncDoneStage();
  });
  // 全选（入库的不算，它们已经锁了）
  document.getElementById('pick-all').addEventListener('click', function () {
    var open = revList().filter(function (i) { return !revDone[i]; });
    var all = open.length && open.every(function (i) { return revSel[i]; });
    revSel = {};
    if (!all) open.forEach(function (i) { revSel[i] = 1; });
    renderRev(); renderFixChip();
  });
  // 红点＝只选有问题的，绿点＝只选没问题的；两个都是再点一下取消（跟「全选」一样）
  function selBy(pick) {
    var ids = revList().filter(function (i) {
      if (revDone[i]) return false;
      return pick(artBad(i));
    });
    var allOn = ids.length &&
      ids.every(function (i) { return revSel[i]; }) &&
      Object.keys(revSel).length === ids.length;   // 一个不多一个不少，才算"已经选好了"
    revSel = {};
    if (!allOn) ids.forEach(function (i) { revSel[i] = 1; });
    renderRev(); renderFixChip();
  }
  document.getElementById('pick-bad').addEventListener('click', function () { selBy(function (bad) { return bad; }); });
  document.getElementById('pick-good').addEventListener('click', function () { selBy(function (bad) { return !bad; }); });
  document.getElementById('fix-x').addEventListener('click', function () {
    revSel = {}; renderRev(); renderFixChip();
  });
  revDoc.innerHTML = revDocHTML(0);
  renderRev();

  /* ---------- 右栏面板：一次只展开一个 ---------- */
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-panel]'));
  panels.forEach(function (p) {
    p.querySelector('.panel-hd').addEventListener('click', function () {
      var wasOpen = p.classList.contains('is-open');
      panels.forEach(function (q) {
        q.classList.remove('is-open');
        q.querySelector('.chev').textContent = '▸';
      });
      if (!wasOpen) {
        p.classList.add('is-open');
        p.querySelector('.chev').textContent = '▾';
      }
    });
  });

  /* ---------- 思考链折叠 ---------- */
  document.querySelectorAll('.think').forEach(function (t) {
    t.querySelector('.think-hd').addEventListener('click', function () {
      var collapsed = t.classList.toggle('collapsed');
      t.querySelector('.chev').textContent = collapsed ? '▸' : '▾';
      t.querySelector('.think-hd').lastChild.textContent = collapsed ? '已思考 8 秒' : '思考中…';
    });
  });

  /* ---------- 工具链折叠 ---------- */
  document.querySelectorAll('.tools').forEach(function (t) {
    t.querySelector('.tools-hd').addEventListener('click', function () {
      var closed = t.classList.toggle('closed');
      t.querySelector('.chev').textContent = closed ? '▸' : '▾';
    });
  });

  /* ---------- 众测 / 个人 两层模板 ---------- */
      // 众测 / 个人 这两层也用同一套选择逻辑（标签是「名字 · 类型」）
  var PUB_SKILLS = [
    ['群面一下', '测评对比'],
    ['小红书体', '种草'],
    ['一句顶十句', '开头'],
  ];
  var MY_SKILLS = [
    ['我的开头库', '结构'],
    ['口腔价格话术', '数据'],
  ];
  function renderOtherChips(el, list) {
    el.innerHTML = list.map(function (p) {
      var name = p[0] + ' · ' + p[1];
      var on = types.indexOf(name) >= 0;
      return '<button class="chip2' + (on ? ' is-on' : '') + '">' +
             esc(p[0]) + '<span class="sk-type"> · ' + esc(p[1]) + '</span></button>';
    }).join('');
    el.querySelectorAll('.chip2').forEach(function (b) {
      b.addEventListener('click', function () {
        var name = b.textContent.trim();
        var k = types.indexOf(name);
        if (k >= 0) types.splice(k, 1); else types.push(name);
        b.classList.toggle('is-on', k < 0);
        ctxOff = false;
        renderRefs(); afterChange();
      });
    });
  }
  renderOtherChips(document.getElementById('chips-pub'), PUB_SKILLS);
  renderOtherChips(document.getElementById('chips-mine'), MY_SKILLS);

  /* ---------- 初始化：一进来是 landing 页，左边不选中任何会话 ---------- */
  renderChips();
  setRefTab('skill');       // 文章类型是必选项，一进来就停在「用模板」这页上
  renderRefs();
  setRefOpen(true);
  syncSheetSub();
  renderTable();
  setMode('weak');
  autoGrow();
  showView('landing');

})();
