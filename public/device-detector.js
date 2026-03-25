document.addEventListener('DOMContentLoaded', () => {
    const resEl = document.querySelector('.hud_res');
    const osEl  = document.querySelector('.hud_os');
    if (!resEl || !osEl) return;
    const detectOS = () => {
      const ua = navigator.userAgent || '';
      const platform = (navigator.platform || '').toLowerCase();
      if (/iphone/i.test(ua)) return 'iOS';
      if (/android/i.test(ua)) return 'Android';
      // iPadOS 13+ reports itself as MacOS — check touch support to distinguish
      if (/ipad/i.test(ua)) return 'iPadOS';
      if (platform.includes('mac') && navigator.maxTouchPoints > 1) return 'iPadOS';
      if (platform.includes('mac')) return 'MacOS';
      if (platform.includes('win')) return 'Windows';
      if (platform.includes('linux')) return 'Linux';
      return 'Unknown';
    };
    const updateRes = () => {
      resEl.textContent = `${window.innerWidth}×${window.innerHeight}`;
    };
    osEl.textContent = detectOS();
    updateRes();
    window.addEventListener('resize', updateRes);
  });