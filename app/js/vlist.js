/*
 * Virtualised list / grid. Only the rows on screen are in the DOM, so lists with
 * tens of thousands of channels or movies stay fast on the TV.
 */
function VList(container, opts) {
  this.box = container;
  this.opts = opts;
  this.cols = opts.columns || 1;
  this.items = [];
  this.index = 0;
  this.scrollRow = 0;
  this.nodes = {};
  this.inner = Util.el('div', 'vlist-inner');
  container.innerHTML = '';
  container.appendChild(this.inner);

  var self = this;
  container.addEventListener('click', function (e) {
    var i = self.indexFromEvent(e);
    if (i < 0) return;
    self.setIndex(i);
    if (opts.onSelect) opts.onSelect(self.items[i], i);
  });
  container.addEventListener('mouseover', function (e) {
    var i = self.indexFromEvent(e);
    if (i < 0 || i === self.index) return;
    if (opts.onHover) opts.onHover(self);
    self.setIndex(i);
  });
  container.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (opts.onHover) opts.onHover(self);
    self.move(e.deltaY > 0 ? 1 : -1, 0);
  });
}

VList.prototype.indexFromEvent = function (e) {
  var n = e.target;
  while (n && n !== this.box) {
    if (n.dataset && n.dataset.index !== undefined) return parseInt(n.dataset.index, 10);
    n = n.parentNode;
  }
  return -1;
};

VList.prototype.rowPx = function () {
  return this.opts.rowHeight * parseFloat(getComputedStyle(document.documentElement).fontSize);
};

VList.prototype.visibleRows = function () {
  return Math.max(1, Math.floor(this.box.clientHeight / this.rowPx()));
};

VList.prototype.setItems = function (items, index) {
  this.items = items || [];
  this.nodes = {};
  this.inner.innerHTML = '';
  this.scrollRow = 0;
  this.inner.style.transform = 'translateY(0)';
  this.inner.style.height = Math.ceil(this.items.length / this.cols) * this.rowPx() + 'px';
  this.setIndex(Math.min(Math.max(index || 0, 0), Math.max(this.items.length - 1, 0)), true);
};

VList.prototype.current = function () { return this.items[this.index]; };

VList.prototype.setIndex = function (i, silent) {
  if (!this.items.length) { this.index = 0; this.render(); return; }
  this.index = Math.min(Math.max(i, 0), this.items.length - 1);
  var row = Math.floor(this.index / this.cols), vis = this.visibleRows();
  if (row < this.scrollRow) this.scrollRow = row;
  else if (row >= this.scrollRow + vis) this.scrollRow = row - vis + 1;
  this.inner.style.transform = 'translateY(' + (-this.scrollRow * this.rowPx()) + 'px)';
  this.render();
  if (!silent && this.opts.onFocus) this.opts.onFocus(this.items[this.index], this.index);
};

/* Returns false when the move would leave the list, so the caller can move focus elsewhere. */
VList.prototype.move = function (dRow, dCol) {
  var n = this.items.length;
  if (!n) return false;
  var i = this.index;
  if (dCol) {
    var col = i % this.cols + dCol;
    if (col < 0 || col >= this.cols || i + dCol >= n) return false;
    this.setIndex(i + dCol);
    return true;
  }
  var next = i + dRow * this.cols;
  if (next < 0) {
    if (i === 0 || Math.abs(dRow) === 1) return false;
    next = 0;
  }
  if (next >= n) {
    var lastRow = Math.floor((n - 1) / this.cols);
    if (Math.floor(i / this.cols) >= lastRow) return false;
    next = n - 1;
  }
  this.setIndex(next);
  return true;
};

VList.prototype.page = function (dir) {
  return this.move(dir * this.visibleRows(), 0);
};

VList.prototype.refresh = function () {
  this.nodes = {};
  this.inner.innerHTML = '';
  this.render();
};

VList.prototype.render = function () {
  var rowPx = this.rowPx(), cols = this.cols, vis = this.visibleRows();
  var side = I18n.rtl() ? 'right' : 'left';
  var from = Math.max(0, (this.scrollRow - 1) * cols);
  var to = Math.min(this.items.length, (this.scrollRow + vis + 2) * cols);
  var keep = {}, i;

  for (i = from; i < to; i++) {
    var node = this.nodes[i];
    if (!node) {
      node = Util.el('div', 'vitem');
      node.dataset.index = i;
      node.style.top = Math.floor(i / cols) * rowPx + 'px';
      node.style.height = rowPx + 'px';
      node.style.width = (100 / cols) + '%';
      node.style[side] = (i % cols) * (100 / cols) + '%';
      node.appendChild(this.opts.render(this.items[i], i));
      this.inner.appendChild(node);
    }
    node.classList.toggle('focused', i === this.index);
    keep[i] = node;
  }
  for (i in this.nodes) {
    if (!keep[i]) this.inner.removeChild(this.nodes[i]);
  }
  this.nodes = keep;
};

VList.prototype.setActive = function (on) {
  this.box.classList.toggle('active', on);
};
