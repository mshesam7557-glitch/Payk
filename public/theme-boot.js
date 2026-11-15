// اعمال تم پیش از رندر تا صفحه چشمک نزند
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('payk.settings') || '{}');
    var root = document.documentElement;
    var theme = s.theme || 'night';
    if (theme === 'auto') theme = matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
    root.setAttribute('data-theme', theme);
    if (s.accent) {
      root.style.setProperty('--accent', s.accent);
      var n = parseInt(s.accent.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      root.style.setProperty('--on-accent', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#10131f' : '#ffffff');
    }
    if (s.fontSize) root.style.setProperty('--base', s.fontSize + 'px');
    var meta = document.querySelector('meta[name=theme-color]');
    var colors = { night: '#0f1424', day: '#f3f5fa', aurora: '#17102e', ocean: '#08202c', forest: '#0e1d17', sunset: '#241512', paper: '#f4efe4', amoled: '#000000' };
    if (meta && colors[theme]) meta.setAttribute('content', colors[theme]);
  } catch (e) {}
})();
