// include.js : header.html include + 초기화
window.addEventListener("DOMContentLoaded", async () => {
  const el = document.querySelector('[include-html]');
  if (!el) return;
  try {
    const includePath = el.getAttribute('include-html') || 'header.html';
    const res = await fetch(includePath);
    const html = await res.text();
    el.innerHTML = html;
    el.querySelectorAll('script').forEach(old => {
      const s = document.createElement('script');
      if (old.src) s.src = old.src; else s.textContent = old.textContent;
      document.body.appendChild(s);
      old.remove();
    });
  } catch (e) {
    el.innerHTML = 'header include 실패';
  }
  if (window.__two4_init_menu) window.__two4_init_menu();
});
