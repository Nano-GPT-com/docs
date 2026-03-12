(function () {
  'use strict';

  var copyIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var checkIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  var turndownReady = null;

  function loadTurndown() {
    if (turndownReady) return turndownReady;
    turndownReady = new Promise(function (resolve, reject) {
      if (window.TurndownService) return resolve();
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/turndown@7.2.0/dist/turndown.js';
      s.onload = function () {
        var g = document.createElement('script');
        g.src = 'https://unpkg.com/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js';
        g.onload = resolve;
        g.onerror = resolve;
        document.head.appendChild(g);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return turndownReady;
  }

  function createButton() {
    if (document.getElementById('copy-md-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'copy-md-btn';
    btn.title = 'Copy page as Markdown';
    btn.setAttribute('aria-label', 'Copy page content as Markdown');
    btn.innerHTML =
      copyIcon + '<span style="margin-left:6px">Copy as Markdown</span>';

    btn.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;align-items:center;' +
      'padding:8px 14px;background:#16A34A;color:#fff;border:none;border-radius:8px;' +
      'cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:all .2s ease;opacity:.9;';

    btn.onmouseenter = function () {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.2)';
    };
    btn.onmouseleave = function () {
      btn.style.opacity = '0.9';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    };
    btn.onclick = handleCopy;

    document.body.appendChild(btn);
  }

  var defaultHTML = copyIcon + '<span style="margin-left:6px">Copy as Markdown</span>';

  function showFeedback(success) {
    var btn = document.getElementById('copy-md-btn');
    if (!btn) return;
    btn.innerHTML = success
      ? checkIcon + '<span style="margin-left:6px">Copied!</span>'
      : '<span>Failed to copy</span>';
    btn.style.background = success ? '#15803D' : '#DC2626';
    setTimeout(function () {
      btn.innerHTML = defaultHTML;
      btn.style.background = '#16A34A';
    }, 2000);
  }

  function getContentElement() {
    var selectors = [
      'article',
      '#content-area',
      '[data-content]',
      'main [class*="prose"]',
      'main article',
      'main'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim().length > 100) return el;
    }
    return document.querySelector('main') || document.querySelector('article');
  }

  function cleanClone(clone) {
    // Remove UI-only elements
    var removeSelectors = [
      '#copy-md-btn',
      'button',
      'nav',
      'footer',
      '[aria-label="Navigation"]',
      '[class*="breadcrumb"]',
      '[class*="Breadcrumb"]',
      '[class*="pagination"]',
      '[class*="Pagination"]',
      '[class*="prev-next"]',
      '[class*="PrevNext"]',
      '[class*="footer"]',
      '[class*="Footer"]',
      '[class*="keyboard"]',
      '[class*="shortcut"]',
      'script',
      'style',
      'noscript'
    ];
    removeSelectors.forEach(function (sel) {
      try {
        clone.querySelectorAll(sel).forEach(function (el) { el.remove(); });
      } catch (e) {}
    });

    // Remove heading anchor links (zero-width space permalink icons)
    clone.querySelectorAll('a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var text = a.textContent.replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '');
      if (href.charAt(0) === '#' && text.length === 0) {
        a.remove();
      }
    });

    // Remove standalone "Copy" labels from code blocks
    clone.querySelectorAll('[class*="copy"], [class*="Copy"]').forEach(function (el) {
      var t = el.textContent.trim();
      if (t === 'Copy' || t === 'copy') el.remove();
    });

    // Remove Mintlify "Powered by" elements
    clone.querySelectorAll('a[href*="mintlify.com"]').forEach(function (el) {
      var parent = el.closest('div') || el.parentElement;
      if (parent && parent.textContent.includes('Powered by')) {
        parent.remove();
      } else {
        el.remove();
      }
    });

    // Reveal hidden tab/accordion content so all tabs get captured
    clone.querySelectorAll('[hidden], [aria-hidden="true"]').forEach(function (el) {
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
    });
    clone.querySelectorAll('[style]').forEach(function (el) {
      var s = el.style;
      if (s.display === 'none') s.display = '';
      if (s.visibility === 'hidden') s.visibility = '';
    });

    // Remove the breadcrumb-like group label at the very top
    // (In Mintlify, it's often the first small text before the h1)
    var h1 = clone.querySelector('h1');
    if (h1) {
      var prev = h1.previousElementSibling;
      while (prev) {
        var next = prev.previousElementSibling;
        // Remove small text elements before h1 that are likely breadcrumbs/labels
        if (prev.textContent.trim().length < 80 && !prev.querySelector('code, pre')) {
          prev.remove();
        }
        prev = next;
      }
    }

    return clone;
  }

  function handleCopy() {
    var btn = document.getElementById('copy-md-btn');
    btn.innerHTML =
      copyIcon + '<span style="margin-left:6px">Loading...</span>';

    loadTurndown()
      .then(function () {
        var contentEl = getContentElement();
        if (!contentEl) return showFeedback(false);

        var clone = cleanClone(contentEl.cloneNode(true));

        var turndownService = new window.TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          bulletListMarker: '-',
          emDelimiter: '*'
        });

        // Don't escape underscores (they're common in API field names)
        turndownService.escape = function (str) {
          return str
            .replace(/\\/g, '\\\\')
            .replace(/\*/g, '\\*')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/>/g, '\\>')
            .replace(/\|/g, '\\|');
        };

        // Add GFM plugin if loaded
        if (window.turndownPluginGfm) {
          turndownService.use(window.turndownPluginGfm.gfm);
        }

        // Code blocks with language hints
        turndownService.addRule('fencedCodeBlock', {
          filter: function (node) {
            return node.nodeName === 'PRE' && node.querySelector('code');
          },
          replacement: function (content, node) {
            var codeEl = node.querySelector('code');
            var lang = '';
            if (codeEl.className) {
              var m = codeEl.className.match(/language-(\w+)/);
              if (m) lang = m[1];
            }
            var code = codeEl.textContent;
            return '\n\n```' + lang + '\n' + code.replace(/\n$/, '') + '\n```\n\n';
          }
        });

        // Skip SVGs
        turndownService.addRule('skipSvg', {
          filter: 'svg',
          replacement: function () { return ''; }
        });

        // Skip empty anchor links
        turndownService.addRule('skipPermalinks', {
          filter: function (node) {
            if (node.nodeName !== 'A') return false;
            var href = node.getAttribute('href') || '';
            var text = node.textContent.replace(/[\u200B\u200C\u200D\uFEFF\s]/g, '');
            return href.charAt(0) === '#' && text.length === 0;
          },
          replacement: function () { return ''; }
        });

        var md = turndownService.turndown(clone);
        md = postProcess(md);

        var url = window.location.href;
        var result = 'Source: ' + url + '\n\n' + md;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(result).then(
            function () { showFeedback(true); },
            function () { fallbackCopy(result); showFeedback(true); }
          );
        } else {
          fallbackCopy(result);
          showFeedback(true);
        }
      })
      .catch(function () {
        showFeedback(false);
      });
  }

  function postProcess(md) {
    md = md
      // Remove zero-width spaces
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      // Remove orphaned anchor links [​](#something)
      .replace(/\[[\s]*\]\(#[^)]*\)/g, '');

    // Join fragmented API paths line-by-line
    // Mintlify renders "POST /v1/images/generations" as separate lines:
    //   POST\n\n/\n\nv1\n\n/\n\nimages\n\n/\n\ngenerations
    md = joinApiPaths(md);

    md = md
      // Fix empty heading lines: "## \n\nOverview" → "## Overview"
      .replace(/^(#{1,6})\s*\n+\s*(.+)/gm, '$1 $2')
      // Remove standalone "Copy" / "cURL" / "curl" lines
      .replace(/^\s*Copy\s*$/gm, '')
      .replace(/^\s*cURL\s*$/gm, '')
      // Remove "Show child attributes" UI text
      .replace(/^\s*Show child attributes?\s*$/gm, '')
      // Remove "Option 1" / "Option 2" tab labels
      .replace(/^-\s*Option \d+\s*$/gm, '')
      .replace(/^\s*Option \d+\s*$/gm, '')
      // Remove keyboard shortcuts like ⌘I
      .replace(/[⌘⌥⇧⌃][A-Z]/g, '')
      // Remove Mintlify powered-by
      .replace(/Powered by.*?Mintlify.*$/gm, '')
      .replace(/This documentation is built and hosted on Mintlify.*$/gm, '')
      // Remove prev/next page links at the very end
      .replace(/(\n\[.+?\]\(\/[^)]+\)){1,2}\s*$/, '')
      // Remove duplicate auto-generated OpenAPI section if hand-written content exists above
      .replace(/\n#### Authorizations[\s\S]*$/, '')
      // Clean up excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Strip breadcrumb/group labels before the first heading
    // e.g. "Endpoint Examples\n\n# Image Generation..." → "# Image Generation..."
    md = md.replace(/^([\s\S]*?)(^# )/m, function (match, before, heading) {
      // Only strip if the "before" text is short lines (breadcrumbs), not real content
      var lines = before.trim().split('\n').filter(function (l) { return l.trim().length > 0; });
      var allShort = lines.length > 0 && lines.every(function (l) { return l.trim().length < 60 && l.trim().charAt(0) !== '-' && l.trim().charAt(0) !== '`'; });
      return allShort ? heading : match;
    });

    return md;
  }

  function joinApiPaths(md) {
    var HTTP_METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;
    var lines = md.split('\n');
    var result = [];
    var i = 0;

    while (i < lines.length) {
      var trimmed = lines[i].trim();

      if (HTTP_METHODS.test(trimmed)) {
        var method = trimmed;
        var pathParts = [];
        var j = i + 1;
        var lastWasSlash = true; // after method, expect a "/" next

        while (j < lines.length) {
          var part = lines[j].trim();
          if (part === '') {
            j++;
            continue;
          }
          if (part === '/') {
            // Standalone slash separator
            pathParts.push(part);
            lastWasSlash = true;
            j++;
          } else if (/^\/[\w{}.:-]+$/.test(part)) {
            // Combined "/segment"
            pathParts.push(part);
            lastWasSlash = false;
            j++;
          } else if (lastWasSlash && /^[\w{}.:-]+$/.test(part)) {
            // Bare word only accepted right after a "/"
            pathParts.push(part);
            lastWasSlash = false;
            j++;
          } else {
            break;
          }
        }

        if (pathParts.length > 0) {
          var path = pathParts.join('');
          if (path.charAt(0) !== '/') path = '/' + path;
          path = path.replace(/\/{2,}/g, '/');
          result.push(method + ' ' + path);
          result.push('');
          i = j;
        } else {
          result.push(lines[i]);
          i++;
        }
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ── Init ──────────────────────────────────────────────────────────────

  function init() {
    createButton();
    new MutationObserver(function () {
      if (!document.getElementById('copy-md-btn')) createButton();
    }).observe(document.body, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
