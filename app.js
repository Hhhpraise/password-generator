/* ============================================================
   SecurePass — Application Logic
   Minimalist editorial password generator.
   ============================================================ */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────
  let currentPin = '';
  let storedPin = '';
  let isAuthenticated = false;
  let isSettingPin = false;
  let lockTimeout = null;
  let domains = [];
  let storageAvailable = false;
  let domainPreferences = {};
  let collapsedCategories = {};

  const STORAGE_KEYS = {
    PIN: 'securepass_pin',
    DOMAINS: 'securepass_domains',
    SETTINGS: 'securepass_settings',
    DOMAIN_PREFERENCES: 'securepass_domain_preferences'
  };

  const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes

  // ── DOM references ────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const loadingScreen   = $('#loadingScreen');
  const securityScreen  = $('#securityScreen');
  const mainApp         = $('#mainApp');
  const setupSection    = $('#setupSection');
  const resultEl        = $('#result');
  const passwordDisplay = $('#passwordDisplay');
  const securityTip     = $('#securityTip');
  const checkBreachBtn  = $('#checkBreachBtn');
  const historySection  = $('#historySection');
  const aboutSection    = $('#aboutSection');
  const domainList      = $('#domainList');
  const storageStatus   = $('#storageStatus');
  const pwaBanner       = $('#addToHomeBanner');
  const pwaInstructions = $('#iosInstructions');

  // ── Storage ───────────────────────────────────────────────
  function checkStorageAvailability() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      storageAvailable = true;
    } catch (e) {
      storageAvailable = false;
    }
  }

  function loadStoredData() {
    if (!storageAvailable) {
      storedPin = '';
      domains = [];
      domainPreferences = {};
      return;
    }
    try {
      storedPin = localStorage.getItem(STORAGE_KEYS.PIN) || '';
      const rawDomains = localStorage.getItem(STORAGE_KEYS.DOMAINS);
      const rawPrefs = localStorage.getItem(STORAGE_KEYS.DOMAIN_PREFERENCES);

      domains = rawDomains ? JSON.parse(rawDomains) : [];
      if (!Array.isArray(domains)) domains = [];

      domains = domains.map((d) => {
        if (typeof d === 'string') {
          return { display: d.trim(), normalized: normalizeDomain(d), timestamp: Date.now() };
        }
        return { ...d, normalized: normalizeDomain(d.display || d.normalized || '') };
      });

      domainPreferences = rawPrefs ? JSON.parse(rawPrefs) : {};
      if (typeof domainPreferences !== 'object' || domainPreferences === null) {
        domainPreferences = {};
      }
    } catch (e) {
      domains = [];
      storedPin = '';
      domainPreferences = {};
    }
  }

  function saveData() {
    if (!storageAvailable) return;
    try {
      localStorage.setItem(STORAGE_KEYS.PIN, storedPin);
      localStorage.setItem(STORAGE_KEYS.DOMAINS, JSON.stringify(domains));
      localStorage.setItem(STORAGE_KEYS.DOMAIN_PREFERENCES, JSON.stringify(domainPreferences));
      updateStorageStatus('saved');
    } catch (e) {
      updateStorageStatus('error');
    }
  }

  function updateStorageStatus(status) {
    if (!storageStatus) return;
    if (status === 'saved') {
      storageStatus.textContent = 'Saved';
      storageStatus.style.color = 'var(--color-success)';
      setTimeout(() => updateStorageStatus(), 2000);
    } else if (status === 'error') {
      storageStatus.textContent = 'Storage error';
      storageStatus.style.color = 'var(--color-danger)';
    } else {
      storageStatus.textContent = domains.length + ' domains stored locally';
      storageStatus.style.color = 'var(--color-text-tertiary)';
    }
  }

  // ── Toast ─────────────────────────────────────────────────
  function toast(message, duration = 2500) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 200);
    }, duration);
  }

  // ── Domain normalization ──────────────────────────────────
  function normalizeDomain(raw) {
    return raw
      .toLowerCase().trim()
      .replace(/\s+/g, '')
      .replace(/[-_]+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  // ── PIN Management ────────────────────────────────────────
  function addPin(digit) {
    if (currentPin.length >= 6) return;
    currentPin += digit;
    updatePinDots();

    if (currentPin.length === 6) {
      setTimeout(() => {
        if (isSettingPin) {
          storedPin = currentPin;
          saveData();
          isSettingPin = false;
          setupSection.style.display = 'none';
          toast('PIN set');
          setTimeout(() => unlockApp(), 600);
        } else {
          if (currentPin === storedPin) {
            unlockApp();
          } else {
            shakePinDots();
            toast('Incorrect PIN');
            currentPin = '';
            updatePinDots();
          }
        }
      }, 200);
    }
  }

  function deletePinDigit() {
    if (currentPin.length > 0) {
      currentPin = currentPin.slice(0, -1);
      updatePinDots();
    }
  }

  function clearPin() {
    currentPin = '';
    updatePinDots();
  }

  function updatePinDots() {
    for (let i = 1; i <= 6; i++) {
      const dot = document.getElementById('dot' + i);
      dot.classList.toggle('filled', i <= currentPin.length);
      dot.classList.remove('error');
    }
  }

  function shakePinDots() {
    const display = document.querySelector('.pin-display');
    display.classList.add('shake');
    $$('.pin-dot').forEach((d) => d.classList.add('error'));
    setTimeout(() => {
      display.classList.remove('shake');
      $$('.pin-dot').forEach((d) => d.classList.remove('error'));
    }, 500);
  }

  // ── Biometric auth ────────────────────────────────────────
  async function authenticateWithBiometric() {
    if (!window.PublicKeyCredential) {
      toast('Biometric auth not supported');
      return;
    }
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        toast('No biometric sensor detected');
        return;
      }
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 30000,
          userVerification: 'required',
          allowCredentials: []
        }
      });
      toast('Authenticated');
      setTimeout(() => unlockApp(), 500);
    } catch (e) {
      toast('Biometric failed — use PIN');
    }
  }

  // ── App lock / unlock ─────────────────────────────────────
  function unlockApp() {
    isAuthenticated = true;
    securityScreen.style.display = 'none';
    mainApp.classList.add('active');
    clearPin();
    startAutoLockTimer();
    renderDomainHistory();
    updateStorageStatus();
  }

  function lockApp() {
    isAuthenticated = false;
    mainApp.classList.remove('active');
    securityScreen.style.display = 'block';
    clearTimeout(lockTimeout);
    $('#masterPassword').value = '';
    $('#domain').value = '';
    resultEl.classList.remove('show');
    if (securityTip) securityTip.classList.remove('show');
  }

  function startAutoLockTimer() {
    clearTimeout(lockTimeout);
    lockTimeout = setTimeout(() => {
      if (isAuthenticated) lockApp();
    }, AUTO_LOCK_MS);
  }

  function resetAutoLock() {
    if (isAuthenticated) startAutoLockTimer();
  }

  // ── Password generation ───────────────────────────────────
  async function generatePassword() {
    const master = $('#masterPassword').value;
    const rawDomain = $('#domain').value.trim();
    const length = parseInt($('#length').value, 10);

    if (!master || !rawDomain) {
      toast('Enter master password and domain');
      return;
    }

    const normalized = normalizeDomain(rawDomain);
    domainPreferences[normalized] = length;
    saveData();

    try {
      const encoder = new TextEncoder();
      const salt = encoder.encode(normalized);
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(master),
        { name: 'PBKDF2' }, false, ['deriveBits']
      );
      const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial, 256
      );

      const bytes = new Uint8Array(derived);
      const base64 = btoa(String.fromCharCode(...bytes));
      const password = buildPassword(base64, length);

      passwordDisplay.textContent = password;
      resultEl.classList.add('show');
      if (checkBreachBtn) checkBreachBtn.style.display = 'inline-flex';
      saveDomainToHistory(rawDomain, normalized);

      setTimeout(() => {
        if (securityTip) {
          securityTip.classList.add('show');
          setTimeout(() => securityTip.classList.remove('show'), 10000);
        }
      }, 1500);
    } catch (e) {
      toast('Error generating password');
    }
  }

  function buildPassword(base64, length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars[base64.charCodeAt(i % base64.length) % chars.length];
    }
    return ensureComplexity(pwd);
  }

  function ensureComplexity(pwd) {
    const has = {
      upper: /[A-Z]/.test(pwd),
      lower: /[a-z]/.test(pwd),
      digit: /[0-9]/.test(pwd),
      special: /[!@#$%^&*]/.test(pwd)
    };
    if (has.upper && has.lower && has.digit && has.special) return pwd;

    const arr = pwd.split('');
    if (!has.upper) arr[0] = 'A';
    if (!has.lower) arr[1] = 'a';
    if (!has.digit) arr[2] = '1';
    if (!has.special) arr[3] = '!';
    return arr.join('');
  }

  // ── Copy ──────────────────────────────────────────────────
  async function copyPassword() {
    const pwd = passwordDisplay.textContent;
    if (!pwd) return;
    try {
      await navigator.clipboard.writeText(pwd);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = pwd;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const btn = $('#copyBtn');
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy to Clipboard';
      btn.classList.remove('copied');
    }, 2500);
  }

  // ── Quick domain fill ─────────────────────────────────────
  function fillQuickDomain(prefix) {
    $('#domain').value = prefix;
    $('#masterPassword').focus();
  }

  // ── URL params ────────────────────────────────────────────
  function handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain');
    const service = params.get('service');
    if (domain) {
      $('#domain').value = decodeURIComponent(domain);
    } else if (service) {
      fillQuickDomain(service + '-');
    }
  }

  // ── Domain history ────────────────────────────────────────
  function saveDomainToHistory(raw, normalized) {
    if (!raw) return;
    const norm = normalizeDomain(raw);
    domains = domains.filter((d) => {
      const dn = d.normalized || normalizeDomain(d.display || d);
      return dn !== norm;
    });
    domains.unshift({ display: raw.trim(), normalized: norm, timestamp: Date.now() });
    if (domains.length > 100) domains = domains.slice(0, 100);
    saveData();
    renderDomainHistory();
  }

  function renderDomainHistory() {
    if (!domainList) return;

    if (domains.length === 0) {
      domainList.innerHTML = '<div class="no-history">No domains saved yet</div>';
      return;
    }

    const cats = {};
    domains.forEach((d) => {
      const display = typeof d === 'object' ? d.display : d;
      const norm = typeof d === 'object' ? d.normalized : normalizeDomain(d);
      const cat = norm.includes('-') ? norm.split('-')[0] : 'other';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push({ display, normalized: norm });
    });

    let html = '';
    for (const [cat, items] of Object.entries(cats)) {
      const collapsed = collapsedCategories[cat];
      html += '<div class="domain-category">';
      html += '<div class="category-header" data-category="' + cat + '">';
      html += cat.toUpperCase();
      html += '<span class="caret">' + (collapsed ? '&#9654;' : '&#9660;') + '</span>';
      html += '</div>';
      html += '<div class="category-domains" style="display:' + (collapsed ? 'none' : 'block') + '">';

      items.forEach((item) => {
        const pref = domainPreferences[item.normalized];
        const label = pref ? item.display + ' (' + pref + 'ch)' : item.display;
        html += '<div class="domain-item">';
        html += '<span class="domain-name" data-domain="' + escapeAttr(item.display) + '">' + escapeHTML(label) + '</span>';
        html += '<div class="domain-actions">';
        html += '<button class="use-btn" data-domain="' + escapeAttr(item.display) + '">Use</button>';
        html += '<button class="delete-btn" data-normalized="' + escapeAttr(item.normalized) + '">Del</button>';
        html += '</div></div>';
      });

      html += '</div></div>';
    }

    domainList.innerHTML = html;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function useDomain(display) {
    $('#domain').value = display;
    const norm = normalizeDomain(display);
    if (domainPreferences[norm]) {
      $('#length').value = domainPreferences[norm];
    }
    historySection.classList.remove('show');
    $('#masterPassword').focus();
  }

  function deleteDomain(normalized) {
    domains = domains.filter((d) => {
      const dn = d.normalized || normalizeDomain(d.display || d);
      return dn !== normalized;
    });
    delete domainPreferences[normalized];
    saveData();
    renderDomainHistory();
  }

  function clearAllHistory() {
    if (!confirm('Clear all domain history?')) return;
    domains = [];
    domainPreferences = {};
    saveData();
    renderDomainHistory();
    toast('History cleared');
  }

  function toggleHistory() {
    historySection.classList.toggle('show');
    if (historySection.classList.contains('show')) {
      renderDomainHistory();
      updateStorageStatus();
    }
  }

  function toggleCategory(category) {
    collapsedCategories[category] = !collapsedCategories[category];
    renderDomainHistory();
  }

  // ── About ─────────────────────────────────────────────────
  function toggleAbout() {
    aboutSection.classList.toggle('show');
  }

  // ── Breach checker ────────────────────────────────────────
  function checkBreach() {
    const pwd = passwordDisplay.textContent;
    if (!pwd) { toast('Generate a password first'); return; }
    window.open('https://hhhpraise.github.io/password-breach-checker/', '_blank');
  }

  // ── PWA banner ────────────────────────────────────────────
  function showPWABanner() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.navigator.standalone;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isIOS && isSafari && !standalone) {
      const dismissed = localStorage.getItem('pwa_banner_dismissed');
      if (!dismissed && pwaBanner) pwaBanner.classList.add('show');
    }
  }

  function dismissPWABanner() {
    if (pwaBanner) pwaBanner.classList.remove('show');
    if (storageAvailable) localStorage.setItem('pwa_banner_dismissed', 'true');
  }

  function showPWAInstructions() {
    if (pwaInstructions) pwaInstructions.classList.add('show');
  }

  // ── Service worker ────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ── Event delegation ──────────────────────────────────────
  function delegate(selector, event, handler) {
    document.addEventListener(event, function (e) {
      const target = e.target.closest(selector);
      if (target) handler.call(target, e);
    });
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    checkStorageAvailability();
    loadStoredData();
    handleURLParams();

    // Start button
    $('#startBtn').addEventListener('click', () => {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
        if (!storedPin) {
          setupSection.style.display = 'block';
          isSettingPin = true;
        }
        securityScreen.style.display = 'block';
      }, 400);
    });

    // PIN keypad
    delegate('.pin-key:not(.delete)', 'click', function () {
      addPin(this.dataset.key);
    });
    $('#deletePin').addEventListener('click', deletePinDigit);

    // Biometric
    $('#biometricBtn').addEventListener('click', authenticateWithBiometric);

    // Lock
    $('#lockBtn').addEventListener('click', lockApp);

    // Generate
    $('#generateBtn').addEventListener('click', generatePassword);

    // Enter key in form fields
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active === $('#masterPassword') || active === $('#domain')) {
          generatePassword();
        }
      }
    });

    // Copy
    $('#copyBtn').addEventListener('click', copyPassword);

    // Breach checker
    if (checkBreachBtn) checkBreachBtn.addEventListener('click', checkBreach);

    // History
    $('#toggleHistory').addEventListener('click', toggleHistory);
    $('#clearHistoryBtn').addEventListener('click', clearAllHistory);

    // Domain list interactions
    delegate('.domain-name', 'click', function () {
      useDomain(this.dataset.domain);
    });
    delegate('.use-btn', 'click', function () {
      useDomain(this.dataset.domain);
    });
    delegate('.delete-btn', 'click', function () {
      deleteDomain(this.dataset.normalized);
    });
    delegate('.category-header', 'click', function () {
      toggleCategory(this.dataset.category);
    });

    // Quick access shortcuts
    delegate('.shortcut-chip', 'click', function () {
      fillQuickDomain(this.dataset.prefix);
    });

    // About
    $('#toggleAbout').addEventListener('click', toggleAbout);
    $('#closeAbout').addEventListener('click', () => {
      aboutSection.classList.remove('show');
    });

    // PWA banner
    if ($('#dismissBanner')) $('#dismissBanner').addEventListener('click', dismissPWABanner);
    if ($('#showInstructions')) $('#showInstructions').addEventListener('click', showPWAInstructions);

    // Auto-lock reset on activity
    ['keypress', 'touchstart', 'click', 'scroll'].forEach((evt) => {
      document.addEventListener(evt, resetAutoLock);
    });

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(lockTimeout);
      } else if (isAuthenticated) {
        startAutoLockTimer();
      }
    });

    // Storage events (cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.DOMAINS) {
        loadStoredData();
        if (isAuthenticated) {
          renderDomainHistory();
          updateStorageStatus();
        }
      }
    });

    // PWA banner after delay
    setTimeout(showPWABanner, 3000);

    // Service worker
    registerSW();

    // Expose for inline handlers
    window.useDomain = useDomain;
    window.deleteDomain = deleteDomain;
    window.fillQuickDomain = fillQuickDomain;
    window.toggleCategoryVisibility = toggleCategory;
  }

  // ── Boot ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
