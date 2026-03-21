// Onboarding Walkthrough
// Interactive first-time user tour highlighting key UI areas step-by-step

const STORAGE_KEY = "zebra-walkthrough-complete";

const STEPS = [
  {
    target: null,
    title: "Welcome to ZPL Editor",
    body: "This quick tour will show you how to create your first Zebra label. Takes about 30 seconds.",
    icon: "waving_hand",
    position: "center",
  },
  {
    target: "#add-textblock-btn",
    area: "#add-textblock-btn, #add-fieldblock-btn, #add-text-btn, #add-barcode-btn, #add-qrcode-btn, #add-box-btn, #add-line-btn, #add-circle-btn",
    title: "Add Elements",
    body: "Start by clicking any button to add text, barcodes, shapes, or QR codes to your label.",
    icon: "add_box",
    position: "right",
  },
  {
    target: "#label-canvas",
    title: "Design Canvas",
    body: "Drag elements to position them. Use handles to resize. Right-click for more options.",
    icon: "draw",
    position: "bottom",
  },
  {
    target: "#elements-list",
    title: "Elements List",
    body: "All your elements appear here. Click to select, use arrows to reorder, or the trash icon to delete.",
    icon: "list",
    position: "right",
  },
  {
    target: "#properties-panel",
    title: "Properties Panel",
    body: "Select an element to see its properties here. Adjust position, size, font, rotation and more.",
    icon: "tune",
    position: "left",
  },
  {
    target: "#zpl-output-highlight",
    title: "Live ZPL Output",
    body: "ZPL code is generated in real-time as you design. Copy it directly to your Zebra printer.",
    icon: "code",
    position: "top",
  },
  {
    target: "#mode-canvas-btn",
    area: "#mode-canvas-btn, #mode-api-btn",
    title: "Edit & Preview Modes",
    body: "Switch between Edit mode for designing and Preview mode to see the rendered label via Labelary.",
    icon: "visibility",
    position: "bottom",
  },
  {
    target: "#copy-btn",
    area: "#copy-btn, #share-btn, #zpl-more-btn",
    title: "Copy, Share & Export",
    body: "Copy ZPL to clipboard, generate a shareable link, or export/import templates as JSON.",
    icon: "share",
    position: "bottom",
  },
  {
    target: null,
    title: "You're All Set!",
    body: "Start creating your label. You can replay this tour anytime from the Tour button in the header.",
    icon: "celebration",
    position: "center",
  },
];

export class OnboardingWalkthrough {
  constructor() {
    this._currentStep = 0;
    this._spotlight = null;
    this._popover = null;
    this._backdrop = null;
    this._resizeTimer = null;
    this._boundResize = this._onResize.bind(this);
    this._boundKeydown = this._onKeydown.bind(this);
  }

  init() {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setTimeout(() => this.start(), 400);
  }

  start() {
    this._currentStep = 0;
    this._buildDOM();
    window.addEventListener("resize", this._boundResize);
    document.addEventListener("keydown", this._boundKeydown, true);
    this._goToStep(0);
  }

  _buildDOM() {
    // Remove any existing walkthrough elements
    this._cleanup(false);

    // Backdrop — captures clicks behind the popover
    this._backdrop = document.createElement("div");
    this._backdrop.className = "walkthrough-backdrop";
    document.body.appendChild(this._backdrop);

    // Spotlight — highlights the target element
    this._spotlight = document.createElement("div");
    this._spotlight.className = "walkthrough-spotlight";
    this._spotlight.style.display = "none";
    document.body.appendChild(this._spotlight);

    // Popover
    this._popover = document.createElement("div");
    this._popover.className = "walkthrough-popover";
    this._popover.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="material-icons-round text-blue-600" style="font-size:22px" data-wt="icon"></span>
        <div style="flex:1;min-width:0">
          <h3 class="text-sm font-bold text-slate-800" data-wt="title"></h3>
        </div>
        <span class="text-[11px] font-medium text-slate-400" data-wt="counter"></span>
      </div>
      <p class="text-sm text-slate-600 leading-relaxed" data-wt="body"></p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px">
        <button data-wt="skip" class="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">Skip tour</button>
        <div style="display:flex;gap:8px">
          <button data-wt="back" class="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">Back</button>
          <button data-wt="next" class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._popover);

    // Wire button events
    this._popover
      .querySelector('[data-wt="skip"]')
      .addEventListener("click", () => this._skip());
    this._popover
      .querySelector('[data-wt="back"]')
      .addEventListener("click", () => this._back());
    this._popover
      .querySelector('[data-wt="next"]')
      .addEventListener("click", () => this._next());
    this._backdrop.addEventListener("click", () => this._skip());
  }

  _goToStep(index) {
    if (index < 0 || index >= STEPS.length) return;
    this._currentStep = index;
    const step = STEPS[index];

    // Update content
    this._popover.querySelector('[data-wt="icon"]').textContent = step.icon;
    this._popover.querySelector('[data-wt="title"]').textContent = step.title;
    this._popover.querySelector('[data-wt="body"]').textContent = step.body;
    this._popover.querySelector('[data-wt="counter"]').textContent =
      `${index + 1} / ${STEPS.length}`;

    // Update buttons
    const backBtn = this._popover.querySelector('[data-wt="back"]');
    const nextBtn = this._popover.querySelector('[data-wt="next"]');
    const skipBtn = this._popover.querySelector('[data-wt="skip"]');

    backBtn.style.display = index === 0 ? "none" : "";
    skipBtn.style.display = index === STEPS.length - 1 ? "none" : "";

    if (index === 0) {
      nextBtn.textContent = "Get Started";
    } else if (index === STEPS.length - 1) {
      nextBtn.textContent = "Done";
    } else {
      nextBtn.textContent = "Next";
    }

    // Position spotlight and popover
    if (step.target) {
      const targetEl = document.querySelector(step.target);
      if (!targetEl) {
        // Target not found — skip to next step
        this._next();
        return;
      }

      // Scroll target into view if needed
      this._scrollIntoView(targetEl);

      // Use requestAnimationFrame to measure after scroll settles
      requestAnimationFrame(() => {
        const rect = this._getAreaRect(step);
        this._positionSpotlight(rect);
        this._positionPopover(rect, step.position);
      });
    } else {
      // Centered modal — no spotlight
      this._spotlight.style.display = "none";
      this._positionCenter();
    }
  }

  _getAreaRect(step) {
    if (!step.area) {
      return document.querySelector(step.target).getBoundingClientRect();
    }
    // Compute bounding rect across all area selectors
    const selectors = step.area.split(",").map((s) => s.trim());
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  _positionSpotlight(rect) {
    const pad = 8;
    this._spotlight.style.display = "";
    this._spotlight.style.left = `${rect.left - pad}px`;
    this._spotlight.style.top = `${rect.top - pad}px`;
    this._spotlight.style.width = `${rect.width + pad * 2}px`;
    this._spotlight.style.height = `${rect.height + pad * 2}px`;
  }

  _positionPopover(targetRect, preferred) {
    const gap = 12;
    const margin = 12;

    // Force layout to get popover dimensions
    this._popover.style.left = "0px";
    this._popover.style.top = "0px";
    const pRect = this._popover.getBoundingClientRect();
    const pw = pRect.width;
    const ph = pRect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    const positions = {
      bottom: () => {
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - pw / 2;
      },
      top: () => {
        top = targetRect.top - ph - gap;
        left = targetRect.left + targetRect.width / 2 - pw / 2;
      },
      right: () => {
        top = targetRect.top + targetRect.height / 2 - ph / 2;
        left = targetRect.right + gap;
      },
      left: () => {
        top = targetRect.top + targetRect.height / 2 - ph / 2;
        left = targetRect.left - pw - gap;
      },
    };

    // Try preferred position first
    positions[preferred]();

    // Flip if overflowing
    if (top + ph > vh - margin && preferred === "bottom") positions.top();
    if (top < margin && preferred === "top") positions.bottom();
    if (left + pw > vw - margin && preferred === "right") positions.left();
    if (left < margin && preferred === "left") positions.right();

    // Clamp to viewport
    left = Math.max(margin, Math.min(left, vw - pw - margin));
    top = Math.max(margin, Math.min(top, vh - ph - margin));

    this._popover.style.left = `${left}px`;
    this._popover.style.top = `${top}px`;
  }

  _positionCenter() {
    const pRect = this._popover.getBoundingClientRect();
    this._popover.style.left = `${(window.innerWidth - pRect.width) / 2}px`;
    this._popover.style.top = `${(window.innerHeight - pRect.height) / 2}px`;
  }

  _scrollIntoView(el) {
    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!inView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  _next() {
    if (this._currentStep >= STEPS.length - 1) {
      this._finish();
    } else {
      this._goToStep(this._currentStep + 1);
    }
  }

  _back() {
    if (this._currentStep > 0) {
      this._goToStep(this._currentStep - 1);
    }
  }

  _skip() {
    localStorage.setItem(STORAGE_KEY, "1");
    this._cleanup(true);
  }

  _finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    this._cleanup(true);
  }

  _onResize() {
    clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      if (this._popover) {
        this._goToStep(this._currentStep);
      }
    }, 100);
  }

  _onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this._skip();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      this._next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      this._back();
    }
  }

  _cleanup(removeListeners) {
    this._backdrop?.remove();
    this._spotlight?.remove();
    this._popover?.remove();
    this._backdrop = null;
    this._spotlight = null;
    this._popover = null;

    if (removeListeners) {
      window.removeEventListener("resize", this._boundResize);
      document.removeEventListener("keydown", this._boundKeydown, true);
    }
  }
}
